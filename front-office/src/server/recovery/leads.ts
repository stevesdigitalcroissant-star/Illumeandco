/**
 * Lead Recovery — new enquiries from the tools a business already uses
 * (website forms, Facebook/Google lead ads, Typeform, Zapier…).
 *
 * Speed to lead is what converts: most enquiries go cold within minutes. A
 * normalized `lead.created` event:
 *   1. matches the person to an existing customer (email/phone) or creates one;
 *   2. records the lead on the existing pipeline (one active lead per customer)
 *      with the service matched by name and their message as the notes;
 *   3. sends a first message right away — only if allowed (recovery setting +
 *      "Send messages" permission), they haven't opted out, no person owns
 *      their conversation, they don't already have an appointment, they
 *      weren't first-touched in the last 24h, and a configured channel can
 *      actually reach them. Otherwise the team is asked to reach out, with why;
 *   4. hands over to the Opportunity Engine, which times further follow-ups
 *      from what the customer says (all existing stop conditions apply).
 */
import { and, eq, gt, gte, ilike, inArray, sql } from "drizzle-orm";
import { appointments, conversations, customers, followUps, services } from "@/db/schema";
import { renderTemplate } from "@/lib/templates";
import { isAllowed } from "../ai/permissions";
import { getChannel, PROACTIVE_ORDER } from "../channels/registry";
import { dbOf, type Ctx } from "../context";
import { evaluateLead, findOpen } from "../opportunities/engine";
import { getAiSettings, getBusiness } from "../services/business";
import { createCustomer, findCustomerByContact, normalizeCustomerEmail, normalizePhone } from "../services/customers";
import { civilHours, processFollowUp, scheduleFollowUp } from "../services/followups";
import { upsertLead } from "../services/leads";

const HOUR = 3600_000;
const IMMEDIATE_WINDOW_MS = 30 * 60_000;

export type LeadInput = {
  name?: string;
  email?: string;
  phone?: string;
  service?: string;
  message?: string;
  source: string;
  occurredAt: Date;
};

export type LeadResult =
  | { handled: false; detail: string }
  | { handled: true; customerId: string; opportunityId: string | null; firstTouch: "sent" | "scheduled" | "skipped" | "failed"; detail: string };

const safe = <T,>(fn: () => T): T | null => {
  try {
    return fn();
  } catch {
    return null;
  }
};

/** Match free text ("whitening", "Teeth Whitening") to one of the business's services. */
export async function matchService(ctx: Ctx, text: string | undefined) {
  const q = text?.trim();
  if (!q) return null;
  const active = and(eq(services.businessId, ctx.businessId), eq(services.active, true));
  const [exact] = await dbOf(ctx).select().from(services).where(and(active, sql`lower(${services.name}) = ${q.toLowerCase()}`)).limit(1);
  if (exact) return exact;
  const like = await dbOf(ctx).select().from(services).where(and(active, ilike(services.name, `%${q.replace(/[%_\\]/g, "")}%`))).limit(2);
  return like.length === 1 ? like[0]! : null; // ambiguous → keep it as free text
}

/** Could any configured channel actually deliver to this person? */
export function reachable(to: { email: string | null; phone: string | null }) {
  return PROACTIVE_ORDER.some((k) => {
    const a = getChannel(k);
    return a.isConfigured() && a.canReach({ name: null, ...to });
  });
}

export async function onLeadCreated(ctx: Ctx, input: LeadInput, now = new Date()): Promise<LeadResult> {
  const settings = await getAiSettings(ctx);
  if (!settings.recovery.leads.enabled) return { handled: false, detail: "Lead recovery is turned off" };
  const email = safe(() => normalizeCustomerEmail(input.email));
  const phone = safe(() => normalizePhone(input.phone));
  if (!email && !phone) return { handled: false, detail: "No usable email or phone number" };

  const db = dbOf(ctx);
  const business = await getBusiness(ctx);
  let customer = await findCustomerByContact(ctx, { email, phone });
  if (!customer) customer = (await createCustomer(ctx, { name: input.name?.trim() || null, email, phone, source: input.source })).customer;
  else {
    // Fill gaps only — never overwrite what the business already knows.
    const patch: Partial<typeof customers.$inferInsert> = {};
    if (!customer.name && input.name?.trim()) patch.name = input.name.trim();
    if (!customer.email && email) patch.email = email;
    if (!customer.phone && phone) patch.phone = phone;
    if (Object.keys(patch).length)
      customer = (await db.update(customers).set(patch).where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, customer.id))).returning())[0] ?? customer;
  }

  const service = await matchService(ctx, input.service);
  const note = input.message ? `${input.source}: ${input.message}` : `Enquiry via ${input.source}`;
  const { lead } = await upsertLead(ctx, {
    customerId: customer.id,
    source: input.source,
    serviceId: service?.id ?? null,
    serviceInterest: service ? null : (input.service ?? null),
    notes: note.slice(0, 2000),
  });

  // ── First touch ──────────────────────────────────────────────────
  const [humanOwned] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.businessId, ctx.businessId), eq(conversations.customerId, customer.id), eq(conversations.owner, "human")))
    .limit(1);
  const [upcoming] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.businessId, ctx.businessId), eq(appointments.customerId, customer.id), inArray(appointments.status, ["booked", "confirmed"]), gt(appointments.startsAt, now)))
    .limit(1);
  const [recent] = await db
    .select({ id: followUps.id })
    .from(followUps)
    .where(
      and(
        eq(followUps.businessId, ctx.businessId),
        eq(followUps.customerId, customer.id),
        eq(followUps.purpose, "first_touch"),
        inArray(followUps.status, ["scheduled", "sent"]),
        gte(followUps.createdAt, new Date(now.getTime() - 24 * HOUR)),
      ),
    )
    .limit(1);

  let skip: string | null = null;
  if (!settings.recovery.leads.firstTouch) skip = "Automatic first message is turned off";
  else if (!isAllowed(settings.permissions, "send_messages")) skip = "The AI isn't allowed to send messages";
  else if (customer.optedOut) skip = "Customer opted out of messages";
  else if (humanOwned) skip = "A team member owns this customer's conversation";
  else if (upcoming) skip = "They already have an appointment booked";
  else if (recent) skip = "Already sent a first message in the last 24 hours";
  else if (!reachable(customer)) skip = "No configured channel can reach them — SMS, WhatsApp or email needs setting up (configuration required)";

  let firstTouch: "sent" | "scheduled" | "skipped" | "failed" = "skipped";
  let detail = skip ? `No first message: ${skip}` : "";
  if (!skip) {
    const immediate = now.getTime() - input.occurredAt.getTime() <= IMMEDIATE_WINDOW_MS;
    const scheduledFor = immediate ? now : civilHours(now, business.timezone);
    const message = renderTemplate(settings.recovery.leads.template, {
      business: business.name,
      customer_name: customer.name?.split(" ")[0] ?? "",
      about_service: service ? ` about ${service.name.toLowerCase()}` : input.service ? ` about ${input.service.toLowerCase()}` : "",
    });
    const f = await scheduleFollowUp(ctx, { customerId: customer.id, leadId: lead.id, scheduledFor, message, reason: `New lead via ${input.source}`, purpose: "first_touch" });
    if (scheduledFor.getTime() <= now.getTime()) {
      const r = await processFollowUp(ctx, f);
      firstTouch = r.sent ? "sent" : "failed";
      detail = r.sent ? `First message sent via ${r.channel?.replace("_", " ")}` : `First message not delivered: ${r.reason}`;
    } else {
      firstTouch = "scheduled";
      detail = "First message queued for messaging hours";
    }
  }

  // The Opportunity Engine takes it from here (stage, blocker, follow-up timing).
  await evaluateLead(ctx, customer.id, { now });
  const opp = await findOpen(ctx, `lead:${customer.id}`);
  return { handled: true, customerId: customer.id, opportunityId: opp?.id ?? null, firstTouch, detail };
}
