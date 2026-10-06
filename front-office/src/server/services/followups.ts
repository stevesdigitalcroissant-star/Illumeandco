/**
 * AI follow-ups.
 *
 * Mandatory stop conditions (cannot be disabled):
 *   - the customer replied after the follow-up was scheduled
 *   - the customer opted out
 *   - an appointment was booked (or the lead is completed)
 *   - a human took over the conversation
 * Optional: stop when the lead is marked lost.
 */
import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { appointments, conversations, customers, followUps, leads, services } from "@/db/schema";
import { audit } from "../audit";
import { dbOf, invalid, notFound, type Ctx } from "../context";
import { DateTime } from "luxon";
import { getAiSettings, getBusiness } from "./business";
import { deliverToCustomer } from "./messaging";

export type FollowUp = typeof followUps.$inferSelect;

export async function cancelPendingFollowUps(ctx: Ctx, customerId: string, reason: string) {
  const cancelled = await dbOf(ctx)
    .update(followUps)
    .set({ status: "cancelled", statusReason: reason })
    .where(and(eq(followUps.businessId, ctx.businessId), eq(followUps.customerId, customerId), eq(followUps.status, "scheduled")))
    .returning({ id: followUps.id });
  if (cancelled.length) {
    await dbOf(ctx)
      .update(leads)
      .set({ nextFollowUpAt: null })
      .where(and(eq(leads.businessId, ctx.businessId), eq(leads.customerId, customerId)));
    await audit(ctx, {
      action: "follow_up.cancelled",
      summary: `${cancelled.length} pending follow-up${cancelled.length > 1 ? "s" : ""} stopped — ${reason}`,
      entityType: "customer",
      entityId: customerId,
      details: { reason, ids: cancelled.map((c) => c.id) },
    });
  }
  return cancelled.length;
}

/** Returns why a follow-up must not be sent, or null if it may go out. */
export async function checkStopConditions(ctx: Ctx, f: Pick<FollowUp, "customerId" | "leadId" | "createdAt" | "conversationId">) {
  const db = dbOf(ctx);
  const customer = await db.query.customers.findFirst({ where: and(eq(customers.businessId, ctx.businessId), eq(customers.id, f.customerId)) });
  if (!customer) return "Customer no longer exists";
  if (customer.optedOut) return "Customer opted out";

  const [future] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, ctx.businessId),
        eq(appointments.customerId, f.customerId),
        inArray(appointments.status, ["booked", "confirmed"]),
        gt(appointments.startsAt, new Date()),
      ),
    )
    .limit(1);
  if (future) return "Appointment already booked";

  if (f.leadId) {
    const lead = await db.query.leads.findFirst({ where: and(eq(leads.businessId, ctx.businessId), eq(leads.id, f.leadId)) });
    if (lead?.status === "appointment_booked" || lead?.status === "completed") return "Appointment already booked";
    if (lead?.status === "lost") {
      const settings = await getAiSettings(ctx);
      if (settings.followUp.stopWhenLeadLost) return "Lead marked lost";
    }
  }

  const convs = await db
    .select({ owner: conversations.owner, lastCustomerMessageAt: conversations.lastCustomerMessageAt })
    .from(conversations)
    .where(and(eq(conversations.businessId, ctx.businessId), eq(conversations.customerId, f.customerId)));
  if (convs.some((c) => c.owner === "human")) return "Human took over the conversation";
  if (convs.some((c) => c.lastCustomerMessageAt && c.lastCustomerMessageAt > f.createdAt)) return "Customer replied";
  return null;
}

export async function scheduleFollowUp(
  ctx: Ctx,
  input: {
    customerId: string;
    leadId?: string | null;
    conversationId?: string | null;
    delayHours?: number;
    scheduledFor?: Date;
    message?: string | null;
    reason?: string;
    attempt?: number;
  },
) {
  const settings = await getAiSettings(ctx);
  if (ctx.actor.type === "ai" && !settings.followUp.enabled) throw invalid("Follow-ups are turned off for this business.");
  const customer = await dbOf(ctx).query.customers.findFirst({
    where: and(eq(customers.businessId, ctx.businessId), eq(customers.id, input.customerId)),
  });
  if (!customer) throw notFound("Customer");
  if (input.leadId) {
    const lead = await dbOf(ctx).query.leads.findFirst({ where: and(eq(leads.businessId, ctx.businessId), eq(leads.id, input.leadId)) });
    if (!lead) throw notFound("Lead");
  }
  const createdAt = new Date();
  const stop = await checkStopConditions(ctx, { customerId: input.customerId, leadId: input.leadId ?? null, conversationId: input.conversationId ?? null, createdAt: new Date(0) });
  // "Customer replied" is irrelevant at scheduling time — that's what we're following up on.
  if (stop && stop !== "Customer replied") throw invalid(`Follow-up not scheduled: ${stop.toLowerCase()}.`);

  const delay = input.delayHours ?? settings.followUp.delayHours;
  if (delay < 0 || delay > 24 * 60) throw invalid("Follow-up delay must be between 0 and 1440 hours.");
  const scheduledFor = input.scheduledFor ?? new Date(createdAt.getTime() + delay * 3600_000);

  // Replace any pending follow-up so a customer never has two queued.
  await dbOf(ctx)
    .update(followUps)
    .set({ status: "cancelled", statusReason: "Replaced by a newer follow-up" })
    .where(and(eq(followUps.businessId, ctx.businessId), eq(followUps.customerId, input.customerId), eq(followUps.status, "scheduled")));

  const [f] = await dbOf(ctx)
    .insert(followUps)
    .values({
      businessId: ctx.businessId,
      customerId: input.customerId,
      leadId: input.leadId ?? null,
      conversationId: input.conversationId ?? null,
      attempt: input.attempt ?? 1,
      reason: input.reason ?? null,
      message: input.message ?? null,
      scheduledFor,
      createdBy: ctx.actor.type,
      createdAt,
    })
    .returning();
  if (input.leadId)
    await dbOf(ctx).update(leads).set({ nextFollowUpAt: scheduledFor }).where(eq(leads.id, input.leadId));
  await audit(ctx, {
    action: "follow_up.scheduled",
    summary: `Follow-up #${f!.attempt} scheduled for ${customer.name ?? "a website visitor"} on ${DateTime.fromJSDate(scheduledFor).setZone((await getBusiness(ctx)).timezone).toFormat("ccc d LLL, h:mm a")}${input.reason ? ` — ${input.reason}` : ""}`,
    entityType: "follow_up",
    entityId: f!.id,
  });
  return f!;
}

/** Called after an AI turn: if the customer showed interest but has not booked, queue a follow-up. */
export async function autoScheduleFollowUp(ctx: Ctx, customerId: string, conversationId: string) {
  const settings = await getAiSettings(ctx);
  if (!settings.followUp.enabled) return null;
  const db = dbOf(ctx);
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.businessId, ctx.businessId), eq(leads.customerId, customerId), inArray(leads.status, ["new", "contacted", "qualified"])))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  if (!lead || (!lead.serviceId && !lead.serviceInterest)) return null;
  const [pending] = await db
    .select({ id: followUps.id })
    .from(followUps)
    .where(and(eq(followUps.businessId, ctx.businessId), eq(followUps.customerId, customerId), eq(followUps.status, "scheduled")))
    .limit(1);
  if (pending) return null;
  const [{ sent }] = (await db
    .select({ sent: sql<number>`count(*)::int` })
    .from(followUps)
    .where(and(eq(followUps.businessId, ctx.businessId), eq(followUps.leadId, lead.id), eq(followUps.status, "sent")))) as [{ sent: number }];
  if (sent >= settings.followUp.maxAttempts) return null;
  const stop = await checkStopConditions(ctx, { customerId, leadId: lead.id, conversationId, createdAt: new Date() });
  if (stop) return null;
  return scheduleFollowUp(ctx, {
    customerId,
    leadId: lead.id,
    conversationId,
    attempt: sent + 1,
    reason: `Asked about ${lead.serviceInterest ?? "a service"} but did not book`,
  });
}

const STYLE_TEMPLATES: Record<string, (name: string, service: string | null, attempt: number) => string> = {
  gentle: (n, s, a) =>
    a > 1
      ? `Hi ${n}, just one last check-in — if you'd still like ${s ? `a ${s}` : "an appointment"}, I'm happy to find a time that suits you. Reply STOP to opt out.`
      : `Hi ${n}, just checking in. Would you like me to find you ${s ? `a ${s}` : "an appointment"} time this week?`,
  direct: (n, s) => `Hi ${n}, shall I book ${s ? `your ${s}` : "an appointment"}? Reply with a day that works and I'll check availability.`,
  value: (n, s) =>
    `Hi ${n}, following up on your question${s ? ` about ${s}` : ""}. We still have good availability this week — want me to look for a time?`,
};

export async function composeFollowUpMessage(ctx: Ctx, f: FollowUp) {
  if (f.message) return f.message;
  const settings = await getAiSettings(ctx);
  const customer = await dbOf(ctx).query.customers.findFirst({ where: eq(customers.id, f.customerId) });
  let service: string | null = null;
  if (f.leadId) {
    const [row] = await dbOf(ctx)
      .select({ interest: leads.serviceInterest, serviceName: services.name })
      .from(leads)
      .leftJoin(services, eq(services.id, leads.serviceId))
      .where(eq(leads.id, f.leadId));
    service = row?.serviceName ?? row?.interest ?? null;
  }
  const name = customer?.name?.split(" ")[0] ?? "there";
  const tpl = STYLE_TEMPLATES[settings.followUp.style] ?? STYLE_TEMPLATES.gentle!;
  return tpl(name, service?.toLowerCase() ?? null, f.attempt);
}

/** Send one due follow-up, honouring stop conditions. */
export async function processFollowUp(ctx: Ctx, f: FollowUp) {
  const stop = await checkStopConditions(ctx, f);
  if (stop) {
    await dbOf(ctx).update(followUps).set({ status: "cancelled", statusReason: stop }).where(eq(followUps.id, f.id));
    if (f.leadId) await dbOf(ctx).update(leads).set({ nextFollowUpAt: null }).where(eq(leads.id, f.leadId));
    await audit(ctx, { action: "follow_up.cancelled", summary: `Follow-up stopped — ${stop}`, entityType: "follow_up", entityId: f.id });
    return { sent: false, reason: stop };
  }
  const text = await composeFollowUpMessage(ctx, f);
  const delivery = await deliverToCustomer(ctx, { customerId: f.customerId, text, subject: "Following up", metadata: { followUpId: f.id } });
  if (!delivery.ok) {
    await dbOf(ctx).update(followUps).set({ status: "failed", statusReason: delivery.detail }).where(eq(followUps.id, f.id));
    return { sent: false, reason: delivery.detail };
  }
  // Mark sent *with createdAt-equivalent timestamp* so the next attempt's "customer replied" check starts now.
  await dbOf(ctx)
    .update(followUps)
    .set({ status: "sent", sentAt: new Date(), statusReason: `${delivery.channel}: ${delivery.status}` })
    .where(eq(followUps.id, f.id));
  if (f.leadId)
    await dbOf(ctx).update(leads).set({ status: sql`case when ${leads.status} = 'new' then 'contacted'::lead_status else ${leads.status} end`, lastContactAt: new Date(), nextFollowUpAt: null }).where(eq(leads.id, f.leadId));
  await audit(ctx, {
    action: "follow_up.sent",
    summary: `Follow-up #${f.attempt} sent via ${delivery.channel?.replace("_", " ")}`,
    entityType: "follow_up",
    entityId: f.id,
    details: { text, channel: delivery.channel, status: delivery.status },
  });

  const settings = await getAiSettings(ctx);
  if (f.attempt < settings.followUp.maxAttempts && settings.followUp.enabled) {
    await scheduleFollowUp(ctx, {
      customerId: f.customerId,
      leadId: f.leadId,
      conversationId: f.conversationId,
      attempt: f.attempt + 1,
      reason: f.reason ?? undefined,
    }).catch(() => null);
  }
  return { sent: true, channel: delivery.channel };
}

export async function dueFollowUps(now = new Date(), limit = 100) {
  const { db } = await import("@/db");
  return db.select().from(followUps).where(and(eq(followUps.status, "scheduled"), lte(followUps.scheduledFor, now))).limit(limit);
}

export async function listFollowUps(ctx: Ctx, opts: { status?: FollowUp["status"]; limit?: number } = {}) {
  return dbOf(ctx)
    .select({ followUp: followUps, customerName: customers.name })
    .from(followUps)
    .innerJoin(customers, eq(customers.id, followUps.customerId))
    .where(and(eq(followUps.businessId, ctx.businessId), opts.status ? eq(followUps.status, opts.status) : undefined))
    .orderBy(desc(followUps.scheduledFor))
    .limit(opts.limit ?? 100);
}
