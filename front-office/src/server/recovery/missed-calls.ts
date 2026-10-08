/**
 * Missed Call Recovery.
 *
 * A missed call is the highest-intent signal a local business gets: someone
 * tried to reach you right now. The phone system (or Zapier/Make, or Twilio)
 * reports it as a normalized `call.missed` event; this worker:
 *
 *   1. matches the caller to an existing customer by phone, or creates one;
 *   2. opens (or adds to) one missed-call opportunity per customer, with the
 *      call as evidence;
 *   3. texts the caller back — only if the owner allows it (recovery setting
 *      + the "Send messages" AI permission), the caller hasn't opted out, no
 *      person owns their conversation, they weren't already texted today, and
 *      an SMS/WhatsApp channel is actually configured. Otherwise the team is
 *      asked to call back, with the reason;
 *   4. later (sweep) escalates to a person when the text gets no reply, and
 *      closes the opportunity when the caller books (credited as recovered
 *      only if the text-back went out first) or after 7 quiet days.
 *
 * The caller's reply arrives as a normal SMS/WhatsApp message in the same
 * thread, so the AI receptionist (with all its safety rules) takes it from
 * there. Nothing here claims a message was sent unless the channel accepted it.
 */
import { and, desc, eq, gt, gte, inArray } from "drizzle-orm";
import { DateTime } from "luxon";
import { conversations, customers, followUps, messages, opportunities, type OpportunityEvidence } from "@/db/schema";
import { renderTemplate } from "@/lib/templates";
import { isAllowed } from "../ai/permissions";
import { channelsFor, hasPhoneChannel, type BusinessSenders } from "../channels/registry";
import { dbOf, type Ctx } from "../context";
import { close, findOpen, upsertOpen } from "../opportunities/engine";
import { getAiSettings, getBusiness } from "../services/business";
import { createCustomer, findCustomerByContact, normalizePhone } from "../services/customers";
import { civilHours, processFollowUp, scheduleFollowUp } from "../services/followups";

type Opportunity = typeof opportunities.$inferSelect;

const HOUR = 3600_000;
/** A call reported within this window is answered immediately, whatever the hour — they just called us. */
const IMMEDIATE_WINDOW_MS = 30 * 60_000;
/** How long to wait for a reply to the text before asking the team to call. */
const REPLY_WAIT_MS = 2 * HOUR;
/** Close a missed call that led nowhere after this long. */
const STALE_AFTER_MS = 7 * 24 * HOUR;

const REASON_LABEL: Record<string, string> = {
  no_answer: "no answer",
  busy: "line busy",
  failed: "call failed",
  abandoned: "hung up while ringing",
  voicemail: "left a voicemail",
  after_hours: "after hours",
};

export const missedCallKey = (customerId: string) => `missed_call:${customerId}`;

/** When the most recent missed call in this opportunity happened. */
function lastCallAt(o: Pick<Opportunity, "evidence" | "createdAt">) {
  const calls = o.evidence.filter((e) => e.kind === "missed_call").map((e) => new Date(e.at).getTime());
  return calls.length ? new Date(Math.max(...calls)) : o.createdAt;
}

export type MissedCallInput = {
  from: string;
  callerName?: string;
  reason: keyof typeof REASON_LABEL | string;
  voicemailTranscript?: string;
  occurredAt: Date;
};

export type MissedCallResult =
  | { handled: false; detail: string }
  | {
      handled: true;
      customerId: string;
      opportunityId: string;
      textBack: "sent" | "scheduled" | "skipped" | "failed";
      detail: string;
    };

/** "SMS isn't…" stays as is; "Caller opted out" → "caller opted out" (for joining into a sentence). */
const lowerFirst = (t: string) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);

function fmt(at: Date, tz: string) {
  return DateTime.fromJSDate(at).setZone(tz).toFormat("ccc d LLL, h:mm a");
}

/** Is there a channel that can actually text a phone number? */
function phoneChannelConfigured(business: BusinessSenders) {
  return hasPhoneChannel(channelsFor(business));
}

export async function onMissedCall(ctx: Ctx, input: MissedCallInput, now = new Date()): Promise<MissedCallResult> {
  const settings = await getAiSettings(ctx);
  if (!settings.recovery.missedCall.enabled) return { handled: false, detail: "Missed-call recovery is turned off" };

  let phone: string | null;
  try {
    phone = normalizePhone(input.from);
  } catch {
    phone = null;
  }
  if (!phone) return { handled: false, detail: "Caller number withheld or not usable" };

  const business = await getBusiness(ctx);
  const tz = business.timezone;
  const customer =
    (await findCustomerByContact(ctx, { phone })) ??
    (await createCustomer(ctx, { phone, name: input.callerName?.trim() || null, source: "phone" })).customer;

  const key = missedCallKey(customer.id);
  const open = await findOpen(ctx, key);
  const callEvidence: OpportunityEvidence[] = [
    { at: input.occurredAt.toISOString(), kind: "missed_call", detail: `Missed call — ${REASON_LABEL[input.reason] ?? input.reason} (${fmt(input.occurredAt, tz)})` },
  ];
  if (input.voicemailTranscript)
    callEvidence.push({ at: input.occurredAt.toISOString(), kind: "voicemail", detail: `Voicemail: “${input.voicemailTranscript.slice(0, 300)}”` });
  const calls = (open?.evidence.filter((e) => e.kind === "missed_call").length ?? 0) + 1;

  // ── Decide whether the AI may text back ───────────────────────────
  const db = dbOf(ctx);
  const humanOwned = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.businessId, ctx.businessId), eq(conversations.customerId, customer.id), eq(conversations.owner, "human")))
    .limit(1);
  const [recentText] = await db
    .select({ id: followUps.id })
    .from(followUps)
    .where(
      and(
        eq(followUps.businessId, ctx.businessId),
        eq(followUps.customerId, customer.id),
        eq(followUps.purpose, "missed_call"),
        inArray(followUps.status, ["scheduled", "sent"]),
        gte(followUps.createdAt, new Date(now.getTime() - 24 * HOUR)),
      ),
    )
    .limit(1);

  let skip: string | null = null;
  if (!settings.recovery.missedCall.textBack) skip = "Automatic text-back is turned off";
  else if (!isAllowed(settings.permissions, "send_messages")) skip = "The AI isn't allowed to send messages";
  else if (customer.optedOut) skip = "Caller opted out of messages";
  else if (humanOwned.length) skip = "A team member owns this customer's conversation";
  else if (recentText) skip = "Already texted back in the last 24 hours";
  else if (!phoneChannelConfigured(business)) skip = "SMS/WhatsApp isn't configured, so the AI can't text back (configuration required)";

  let textBack: "sent" | "scheduled" | "skipped" | "failed" = "skipped";
  let detail = skip ?? "";
  let conversationId = open?.conversationId ?? null;
  let nextAt: Date | null = now;
  const evidence = [...(open?.evidence ?? []), ...callEvidence];

  if (!skip) {
    const immediate = now.getTime() - input.occurredAt.getTime() <= IMMEDIATE_WINDOW_MS;
    const scheduledFor = immediate ? now : civilHours(now, tz);
    const message = renderTemplate(settings.recovery.missedCall.template, { business: business.name, customer_name: customer.name?.split(" ")[0] ?? "" });
    const f = await scheduleFollowUp(ctx, { customerId: customer.id, scheduledFor, message, reason: "Missed call text-back", purpose: "missed_call" });
    if (scheduledFor.getTime() <= now.getTime()) {
      const r = await processFollowUp(ctx, f);
      if (r.sent) {
        textBack = "sent";
        detail = `Texted back via ${r.channel?.replace("_", " ")}`;
        conversationId = r.conversationId ?? conversationId;
        nextAt = new Date(now.getTime() + REPLY_WAIT_MS);
      } else {
        textBack = "failed";
        detail = `Text-back not delivered: ${r.reason}`;
      }
    } else {
      textBack = "scheduled";
      detail = `Text-back queued for ${fmt(scheduledFor, tz)} (outside messaging hours)`;
      nextAt = new Date(scheduledFor.getTime() + REPLY_WAIT_MS);
    }
    evidence.push({ at: now.toISOString(), kind: "text_back", detail });
  } else {
    evidence.push({ at: now.toISOString(), kind: "text_back_skipped", detail: `No text-back: ${skip}` });
  }

  const aiWaiting = textBack === "sent" || textBack === "scheduled";
  const label = aiWaiting
    ? textBack === "sent"
      ? `AI texted back — call them if there's no reply by ${fmt(nextAt!, tz)}`
      : `AI texts back ${detail.replace(/^Text-back queued for /, "").replace(/ \(outside messaging hours\)$/, "")}`
    : `Call back ${phone}${skip ? ` — ${lowerFirst(skip)}` : ""}${textBack === "failed" ? ` — ${detail.toLowerCase()}` : ""}`;

  const row = await upsertOpen(ctx, key, {
    kind: "missed_call",
    // The opportunity began with the (first) call, so a text-back sent after it counts toward recovery.
    createdAt: open?.createdAt ?? new Date(Math.min(input.occurredAt.getTime(), now.getTime())),
    stage: aiWaiting ? "waiting" : "needs_follow_up",
    customerId: customer.id,
    conversationId,
    title: calls > 1 ? `Missed calls (${calls})` : "Missed call",
    wants: null,
    blocker: customer.optedOut ? "opted_out" : "unresponsive",
    blockerDetail: `Called and didn't reach you${input.voicemailTranscript ? " — left a voicemail" : ""}`,
    intentScore: Math.min(100, 60 + (calls - 1) * 10 + (input.voicemailTranscript ? 10 : 0)),
    nextAction: aiWaiting ? "follow_up" : "human_review",
    nextActionBy: aiWaiting ? "ai" : "human",
    nextActionLabel: label,
    nextActionAt: nextAt,
    evidence: evidence.slice(-10),
    estimatedValueCents: open?.estimatedValueCents ?? null,
    lastActivityAt: input.occurredAt,
  });
  return { handled: true, customerId: customer.id, opportunityId: row.id, textBack, detail: detail || "Recorded" };
}

/** A call connected (the team called back, or the customer got through). The team has spoken with them; the AI stands down. */
export async function onCallCompleted(ctx: Ctx, input: { customer: string; direction: "inbound" | "outbound"; occurredAt: Date }) {
  let phone: string | null;
  try {
    phone = normalizePhone(input.customer);
  } catch {
    phone = null;
  }
  if (!phone) return { handled: false as const, detail: "Number not usable" };
  const customer = await findCustomerByContact(ctx, { phone });
  if (!customer) return { handled: false as const, detail: "No matching customer" };
  const open = await findOpen(ctx, missedCallKey(customer.id));
  if (!open) return { handled: false as const, detail: "No open missed call for this number" };
  const business = await getBusiness(ctx);
  await dbOf(ctx)
    .update(followUps)
    .set({ status: "cancelled", statusReason: "Team spoke with the customer by phone" })
    .where(and(eq(followUps.businessId, ctx.businessId), eq(followUps.customerId, customer.id), eq(followUps.purpose, "missed_call"), eq(followUps.status, "scheduled")));
  const what = input.direction === "outbound" ? "Your team called them back" : "They got through by phone";
  const [row] = await dbOf(ctx)
    .update(opportunities)
    .set({
      stage: "interested",
      nextAction: "none",
      nextActionBy: "human",
      nextActionAt: null,
      nextActionLabel: `${what} (${fmt(input.occurredAt, business.timezone)}) — closes when they book`,
      evidence: [...open.evidence, { at: input.occurredAt.toISOString(), kind: "call_connected", detail: what }].slice(-10),
      lastActivityAt: input.occurredAt,
    })
    .where(and(eq(opportunities.id, open.id), eq(opportunities.status, "open")))
    .returning();
  return { handled: true as const, customerId: customer.id, opportunityId: row?.id ?? open.id, detail: what };
}

/** The caller replied to the text: the AI receptionist is now handling the conversation. */
export async function syncMissedCallReply(ctx: Ctx, customerId: string, now = new Date()) {
  const open = await findOpen(ctx, missedCallKey(customerId));
  if (!open) return;
  const call = lastCallAt(open).getTime();
  if (open.evidence.some((e) => e.kind === "replied" && new Date(e.at).getTime() >= call)) return; // already recorded for this call
  await dbOf(ctx)
    .update(followUps)
    .set({ status: "cancelled", statusReason: "Customer replied" })
    .where(and(eq(followUps.businessId, ctx.businessId), eq(followUps.customerId, customerId), eq(followUps.purpose, "missed_call"), eq(followUps.status, "scheduled")));
  await dbOf(ctx)
    .update(opportunities)
    .set({
      stage: "interested",
      nextAction: "none",
      nextActionBy: "ai",
      nextActionAt: null,
      nextActionLabel: "They replied — the AI receptionist is handling the conversation",
      evidence: [...open.evidence, { at: now.toISOString(), kind: "replied", detail: "Customer replied after the missed call" }].slice(-10),
      lastActivityAt: now,
    })
    .where(and(eq(opportunities.id, open.id), eq(opportunities.status, "open")));
}

/**
 * Sweep: replies that hooks missed, text-backs with no reply (→ ask the team
 * to call), failed sends, and stale missed calls (→ lost). Idempotent.
 */
export async function advanceMissedCalls(ctx: Ctx, now = new Date()) {
  const db = dbOf(ctx);
  const open = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.businessId, ctx.businessId), eq(opportunities.kind, "missed_call"), eq(opportunities.status, "open")))
    .limit(300);
  if (!open.length) return;
  const business = await getBusiness(ctx);
  for (const o of open) await advanceOne(ctx, o, now, business.timezone);
}

async function advanceOne(ctx: Ctx, o: Opportunity, now: Date, tz: string) {
  const db = dbOf(ctx);
  const replied = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(eq(messages.businessId, ctx.businessId), eq(conversations.customerId, o.customerId), eq(messages.role, "customer"), gt(messages.createdAt, lastCallAt(o))))
    .limit(1);
  if (replied.length) await syncMissedCallReply(ctx, o.customerId, now);

  const last = o.lastActivityAt ?? o.createdAt;
  if (now.getTime() - last.getTime() > STALE_AFTER_MS && now.getTime() - o.updatedAt.getTime() > STALE_AFTER_MS) {
    await close(ctx, o, { status: "lost", stage: "lost", reason: replied.length ? "Talked, but no booking within 7 days" : "No response within 7 days of the missed call" });
    return;
  }
  if (replied.length || o.nextActionBy !== "ai" || o.nextAction !== "follow_up" || !o.nextActionAt || o.nextActionAt > now) return;

  // The AI's turn is over: the text went unanswered, or never went out.
  const [f] = await db
    .select()
    .from(followUps)
    .where(and(eq(followUps.businessId, ctx.businessId), eq(followUps.customerId, o.customerId), eq(followUps.purpose, "missed_call")))
    .orderBy(desc(followUps.createdAt))
    .limit(1);
  if (f?.status === "scheduled") return; // still waiting for messaging hours
  const customer = await db.query.customers.findFirst({ where: and(eq(customers.businessId, ctx.businessId), eq(customers.id, o.customerId)) });
  const why =
    f?.status === "sent"
      ? `No reply to our text (sent ${fmt(f.sentAt ?? f.createdAt, tz)})`
      : `Text-back didn't go out${f?.statusReason ? `: ${f.statusReason}` : ""}`;
  await db
    .update(opportunities)
    .set({
      stage: "needs_follow_up",
      nextAction: "human_review",
      nextActionBy: "human",
      nextActionAt: now,
      nextActionLabel: `Call back ${customer?.phone ?? "the caller"} — ${lowerFirst(why)}`,
      evidence: [...o.evidence, { at: now.toISOString(), kind: "escalated", detail: why }].slice(-10),
    })
    .where(and(eq(opportunities.id, o.id), eq(opportunities.status, "open")));
}
