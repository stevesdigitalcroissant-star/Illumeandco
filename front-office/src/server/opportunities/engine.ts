/**
 * AI Opportunity Engine.
 *
 * Every customer journey has a next step. For each customer the engine
 * determines, from evidence only:
 *   what is happening (stage) · what they want · what blocks conversion ·
 *   what should happen next · whether the AI may do it · when.
 *
 * Design rules
 * - Deterministic and explainable: classifications come from real messages,
 *   tool results, appointments and follow-ups, recorded as `evidence`.
 * - One execution path: the engine never messages customers itself. It
 *   schedules through the follow-up service, so every stop condition,
 *   permission, opt-out and audit rule still applies.
 * - Idempotent: one OPEN opportunity per key (partial unique index), so
 *   re-evaluation, retries and concurrent hooks converge on one row.
 * - Honest outcomes: `recovered` is only set when a recovery action (a sent
 *   follow-up or staff outreach) happened before the booking.
 */
import { and, desc, eq, gt, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import type { Tx } from "@/db";
import {
  aiActions,
  appointments,
  conversations,
  customers,
  followUps,
  leads,
  messages,
  opportunities,
  services,
  type OpportunityEvidence,
} from "@/db/schema";
import { audit } from "../audit";
import { dbOf, type Ctx } from "../context";
import { isAllowed } from "../ai/permissions";
import { getAiSettings, getBusiness } from "../services/business";
import { civilHours, scheduleFollowUp } from "../services/followups";
import { detectSignals, latest, statedTimePreference, type Signal } from "./signals";

type Opportunity = typeof opportunities.$inferSelect;
type Stage = Opportunity["stage"];
type Blocker = Opportunity["blocker"];
type NewOpportunity = typeof opportunities.$inferInsert;

const HOUR = 3600_000;
/** Silence after the AI's last reply before a lead counts as gone quiet. */
const QUIET_AFTER_MS = HOUR;
/** A lead with no reply this long after the final follow-up is closed as lost. */
const LOST_AFTER_MS = 7 * 24 * HOUR;

export const STAGE_LABELS: Record<Stage, string> = {
  new_lead: "New lead",
  interested: "Interested",
  high_intent: "High intent",
  booking_in_progress: "Booking in progress",
  needs_follow_up: "Needs follow-up",
  waiting: "Waiting on customer",
  booked: "Booked",
  cancelled: "Cancelled",
  no_show: "No-show",
  reactivation: "Reactivation",
  needs_human: "Needs a person",
  completed: "Completed",
  lost: "Lost",
};

const BASE_INTENT: Partial<Record<Stage, number>> = { new_lead: 20, interested: 40, high_intent: 65, booking_in_progress: 85 };

/**
 * Run engine work without ever breaking the caller. Inside a transaction a
 * savepoint isolates failures, so a booking can't be rolled back by
 * opportunity bookkeeping.
 */
export async function safely(ctx: Ctx, label: string, fn: (ctx: Ctx) => Promise<unknown>) {
  try {
    if (ctx.tx) await (ctx.tx as Tx).transaction((sp) => fn({ ...ctx, tx: sp }));
    else await fn(ctx);
  } catch (e) {
    console.error(`[opportunities] ${label} failed`, e);
  }
}

async function findOpen(ctx: Ctx, key: string) {
  return (
    (await dbOf(ctx).query.opportunities.findFirst({
      where: and(eq(opportunities.businessId, ctx.businessId), eq(opportunities.key, key), eq(opportunities.status, "open")),
    })) ?? null
  );
}

/** Insert or update the open opportunity for `key`. Safe to call repeatedly and concurrently. */
async function upsertOpen(ctx: Ctx, key: string, values: Omit<NewOpportunity, "businessId" | "key" | "status">) {
  const now = new Date();
  const [row] = await dbOf(ctx)
    .insert(opportunities)
    .values({ ...values, businessId: ctx.businessId, key, status: "open", evaluatedAt: now })
    .onConflictDoUpdate({
      target: [opportunities.businessId, opportunities.key],
      targetWhere: sql`${opportunities.status} = 'open'`,
      set: { ...values, evaluatedAt: now },
    })
    .returning();
  return row!;
}

async function close(
  ctx: Ctx,
  opp: Opportunity,
  outcome: { status: "won" | "lost" | "dismissed"; stage: Stage; reason: string; wonAppointmentId?: string | null; recovered?: boolean; recoveredValueCents?: number | null },
) {
  const [row] = await dbOf(ctx)
    .update(opportunities)
    .set({
      status: outcome.status,
      stage: outcome.stage,
      closedReason: outcome.reason,
      closedAt: new Date(),
      wonAppointmentId: outcome.wonAppointmentId ?? null,
      recovered: outcome.recovered ?? false,
      recoveredValueCents: outcome.recovered ? (outcome.recoveredValueCents ?? null) : null,
      nextAction: "none",
      nextActionAt: null,
      nextActionLabel: null,
    })
    .where(and(eq(opportunities.id, opp.id), eq(opportunities.status, "open")))
    .returning();
  if (!row) return null; // someone else closed it first
  if (opp.kind === "lead" && outcome.status === "lost" && opp.leadId)
    await dbOf(ctx)
      .update(leads)
      .set({ status: "lost", lostReason: outcome.reason.slice(0, 300), nextFollowUpAt: null })
      .where(and(eq(leads.businessId, ctx.businessId), eq(leads.id, opp.leadId), inArray(leads.status, ["new", "contacted", "qualified"])));
  if (outcome.status !== "dismissed")
    await audit(ctx, {
      action: outcome.recovered ? "opportunity.recovered" : outcome.status === "won" ? "opportunity.won" : "opportunity.lost",
      summary: `${opp.title}: ${outcome.reason}`,
      entityType: "opportunity",
      entityId: opp.id,
      details: { kind: opp.kind, recoveredValueCents: row.recoveredValueCents, appointmentId: outcome.wonAppointmentId ?? null },
    });
  return row;
}

/** Was there a recovery action (follow-up sent, or the opportunity was being worked) before this booking? */
async function recoveryPreceded(ctx: Ctx, customerId: string, since: Date, bookedAt: Date) {
  const [f] = await dbOf(ctx)
    .select({ id: followUps.id })
    .from(followUps)
    .where(
      and(
        eq(followUps.businessId, ctx.businessId),
        eq(followUps.customerId, customerId),
        eq(followUps.status, "sent"),
        gte(followUps.sentAt, since),
        lt(followUps.sentAt, bookedAt),
      ),
    )
    .limit(1);
  return Boolean(f);
}

// ─── Lead pipeline ────────────────────────────────────────────────────
type LeadFacts = Awaited<ReturnType<typeof loadLeadFacts>>;

async function loadLeadFacts(ctx: Ctx, customerId: string, now: Date) {
  const db = dbOf(ctx);
  const customer = await db.query.customers.findFirst({ where: and(eq(customers.businessId, ctx.businessId), eq(customers.id, customerId)) });
  if (!customer) return null;
  const [lead] = await db
    .select({ lead: leads, serviceName: services.name, priceCents: services.priceCents })
    .from(leads)
    .leftJoin(services, eq(services.id, leads.serviceId))
    .where(and(eq(leads.businessId, ctx.businessId), eq(leads.customerId, customerId)))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  const convs = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.businessId, ctx.businessId), eq(conversations.customerId, customerId)))
    .orderBy(desc(conversations.lastMessageAt));
  const convIds = convs.map((c) => c.id);
  const msgs = convIds.length
    ? await db
        .select({ id: messages.id, role: messages.role, content: messages.content, createdAt: messages.createdAt, conversationId: messages.conversationId })
        .from(messages)
        .where(and(eq(messages.businessId, ctx.businessId), inArray(messages.conversationId, convIds), inArray(messages.role, ["customer", "ai", "human"])))
        .orderBy(desc(messages.createdAt))
        .limit(60)
    : [];
  msgs.reverse();
  const actions = convIds.length
    ? await db
        .select({ tool: aiActions.tool, status: aiActions.status, output: aiActions.output, createdAt: aiActions.createdAt })
        .from(aiActions)
        .where(and(eq(aiActions.businessId, ctx.businessId), inArray(aiActions.conversationId, convIds)))
        .orderBy(desc(aiActions.createdAt))
        .limit(40)
    : [];
  const upcoming = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, ctx.businessId),
        eq(appointments.customerId, customerId),
        inArray(appointments.status, ["booked", "confirmed"]),
        gt(appointments.startsAt, now),
      ),
    )
    .orderBy(desc(appointments.createdAt))
    .limit(1);
  const fus = await db
    .select()
    .from(followUps)
    .where(and(eq(followUps.businessId, ctx.businessId), eq(followUps.customerId, customerId)))
    .orderBy(desc(followUps.createdAt))
    .limit(20);
  return { customer, lead: lead ?? null, convs, msgs, actions, upcoming: upcoming[0] ?? null, followUps: fus };
}

type Classification = {
  stage: Stage;
  blocker: Blocker;
  blockerDetail: string | null;
  intent: number;
  evidence: OpportunityEvidence[];
  signals: Signal[];
};

function classify(facts: NonNullable<LeadFacts>, now: Date): Classification {
  const customerMsgs = facts.msgs.filter((m) => m.role === "customer");
  const signals = detectSignals(customerMsgs);
  const evidence: OpportunityEvidence[] = [];
  const quote = (s: Signal, label: string) => evidence.push({ at: s.at.toISOString(), kind: s.kind, detail: `${label}: “${s.quote}”`, messageId: s.messageId });

  const price = latest(signals, "asked_price");
  const avail = latest(signals, "asked_availability");
  const picked = latest(signals, "picked_time");
  const contact = latest(signals, "shared_contact");
  if (price) quote(price, "Asked about price");
  if (avail) quote(avail, "Asked about availability");
  if (picked) quote(picked, "Chose a time");
  if (contact) evidence.push({ at: contact.at.toISOString(), kind: "shared_contact", detail: "Shared contact details", messageId: contact.messageId });

  const offered = facts.actions.find((a) => a.tool === "get_available_appointments" && a.status === "success");
  const offeredSlots = offered ? ((offered.output as { available?: unknown[] } | null)?.available?.length ?? 0) : null;
  if (offered) evidence.push({ at: offered.createdAt.toISOString(), kind: "tool", detail: offeredSlots ? `Was offered ${offeredSlots} real time${offeredSlots === 1 ? "" : "s"}` : "Availability was checked — nothing free in that period" });

  // Stage by strongest intent shown.
  let stage: Stage = "new_lead";
  if (price || facts.lead?.lead.serviceId || facts.lead?.lead.serviceInterest) stage = "interested";
  if (avail || offered) stage = "high_intent";
  if (picked && offered) stage = "booking_in_progress";
  let intent = BASE_INTENT[stage] ?? 20;
  if (contact) intent += 10;
  intent += Math.min(10, Math.max(0, customerMsgs.length - 1) * 2);

  // Blocker: what is preventing conversion, most decisive evidence first.
  let blocker: Blocker = "none";
  let blockerDetail: string | null = null;
  const lastCustomer = customerMsgs.at(-1) ?? null;
  const signalsOfLast = lastCustomer ? signals.filter((s) => s.messageId === lastCustomer.id) : [];
  const dnc = latest(signals, "do_not_contact");
  const objection = latest(signals, "price_objection");
  const consulting = signalsOfLast.find((s) => s.kind === "consulting_someone");
  const schedule = signalsOfLast.find((s) => s.kind === "checking_schedule");
  if (facts.customer.optedOut || dnc) {
    blocker = "opted_out";
    blockerDetail = dnc ? `Asked not to be contacted: “${dnc.quote}”` : "Customer opted out of messages";
    if (dnc) quote(dnc, "Asked not to be contacted");
  } else if (objection) {
    blocker = "price";
    blockerDetail = `Price concern: “${objection.quote}”`;
    quote(objection, "Raised a price concern");
    intent -= 10;
  } else if (consulting) {
    blocker = "consulting_someone";
    blockerDetail = `Wants to check with someone first: “${consulting.quote}”`;
    quote(consulting, "Deciding with someone else");
  } else if (schedule) {
    blocker = "undecided";
    blockerDetail = `Needs to check their schedule: “${schedule.quote}”`;
    quote(schedule, "Hasn't decided yet");
  } else if (offered && offeredSlots === 0) {
    blocker = "availability";
    blockerDetail = "No suitable time was available when they asked";
  }

  const lastMsg = facts.msgs.at(-1) ?? null;
  const quiet = lastMsg && lastMsg.role !== "customer" && now.getTime() - lastMsg.createdAt.getTime() >= QUIET_AFTER_MS;
  if (blocker === "consulting_someone" || blocker === "undecided") stage = "waiting";
  else if (quiet && blocker !== "opted_out") {
    stage = "needs_follow_up";
    if (blocker === "none") {
      blocker = "unresponsive";
      blockerDetail = "Went quiet after our last reply";
    }
  }
  return { stage, blocker, blockerDetail, intent: Math.max(0, Math.min(100, intent)), evidence: evidence.sort((a, b) => a.at.localeCompare(b.at)).slice(-8), signals };
}

/** How long to wait before following up, from what the customer actually said. */
export function followUpDelayHours(c: Pick<Classification, "stage" | "blocker">, baseHours: number) {
  if (c.blocker === "consulting_someone") return baseHours * 3;
  if (c.blocker === "undecided" || c.blocker === "price") return baseHours * 2;
  if (c.stage === "booking_in_progress" || c.stage === "high_intent") return Math.max(2, Math.round(baseHours / 8));
  return baseHours;
}

/**
 * Evaluate the lead pipeline for one customer: create/update the open lead
 * opportunity, close it when booked (crediting recovery only when earned) or
 * lost, and schedule the next AI follow-up when permitted.
 */
export async function evaluateLead(ctx: Ctx, customerId: string, opts: { now?: Date; schedule?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const facts = await loadLeadFacts(ctx, customerId, now);
  if (!facts) return null;
  const key = `lead:${customerId}`;
  const open = await findOpen(ctx, key);

  // No lead and nothing that shows buying interest → not an opportunity (yet).
  const customerMsgs = facts.msgs.filter((m) => m.role === "customer");
  if (!facts.lead && !open) {
    const s = detectSignals(customerMsgs);
    if (!s.some((x) => ["asked_price", "asked_availability", "picked_time"].includes(x.kind))) return null;
  }

  // Booked → the lead converted.
  if (facts.upcoming) {
    if (!open) return null;
    const recovered = await recoveryPreceded(ctx, customerId, open.createdAt, facts.upcoming.createdAt);
    return close(ctx, open, {
      status: "won",
      stage: "booked",
      reason: recovered ? "Booked after AI follow-up" : "Booked",
      wonAppointmentId: facts.upcoming.id,
      recovered,
      recoveredValueCents: facts.upcoming.priceCents,
    });
  }
  // A lead that already went through to a completed visit is not re-opened by old messages.
  if (facts.lead && ["completed", "appointment_booked"].includes(facts.lead.lead.status) && !open) return null;

  const settings = await getAiSettings(ctx);
  const business = await getBusiness(ctx);
  const c = classify(facts, now);

  if (latest(c.signals, "not_interested") && (!open || latest(c.signals, "not_interested")!.at >= open.createdAt)) {
    const s = latest(c.signals, "not_interested")!;
    if (open) return close(ctx, open, { status: "lost", stage: "lost", reason: `Customer said: “${s.quote}”` });
    return null;
  }

  const sent = facts.followUps.filter((f) => f.status === "sent");
  const pending = facts.followUps.find((f) => f.status === "scheduled") ?? null;
  const lastSent = sent[0] ?? null;
  const lastCustomerAt = customerMsgs.at(-1)?.createdAt ?? null;
  const exhausted = sent.length >= settings.followUp.maxAttempts;

  if (open && exhausted && !pending && lastSent?.sentAt && (!lastCustomerAt || lastCustomerAt < lastSent.sentAt) && now.getTime() - lastSent.sentAt.getTime() > LOST_AFTER_MS)
    return close(ctx, open, { status: "lost", stage: "lost", reason: `No response after ${sent.length} follow-up${sent.length === 1 ? "" : "s"}` });

  const humanOwned = facts.convs.some((cv) => cv.owner === "human");
  const aiMayFollowUp =
    settings.followUp.enabled && isAllowed(settings.permissions, "create_follow_ups") && c.blocker !== "opted_out" && !humanOwned && !exhausted;

  // Next action and when.
  let nextAction: Opportunity["nextAction"] = "follow_up";
  let nextActionBy: "ai" | "human" = aiMayFollowUp ? "ai" : "human";
  let nextActionAt: Date | null = null;
  let label: string;
  const lastAiAt = [...facts.msgs].reverse().find((m) => m.role !== "customer")?.createdAt ?? null;
  const awaitingCustomer = lastAiAt && (!lastCustomerAt || lastAiAt >= lastCustomerAt);
  if (c.blocker === "opted_out") {
    nextAction = "none";
    nextActionBy = "human";
    label = "Don't contact — the customer asked not to be messaged";
  } else if (humanOwned) {
    // The conversation's own needs-a-person opportunity carries the action; don't list it twice.
    nextAction = "none";
    nextActionBy = "human";
    label = "With the team — the AI won't follow up while a person owns the conversation";
  } else if (exhausted) {
    nextAction = "human_review";
    label = `AI follow-ups used (${sent.length}) — consider a personal call`;
    nextActionAt = now;
  } else if (!awaitingCustomer) {
    nextAction = "none";
    label = "Conversation in progress — the AI is replying";
  } else {
    const delay = followUpDelayHours(c, settings.followUp.delayHours);
    const from = lastCustomerAt ?? lastAiAt ?? now;
    nextActionAt = pending?.scheduledFor ?? civilHours(new Date(Math.max(from.getTime() + delay * HOUR, now.getTime())), business.timezone);
    const when = DateTime.fromJSDate(nextActionAt).setZone(business.timezone).toFormat("ccc d LLL, h:mm a");
    const why =
      c.blocker === "consulting_someone"
        ? " (giving them time to decide with someone)"
        : c.blocker === "undecided"
          ? " (they're checking their schedule)"
          : c.blocker === "price"
            ? " (price concern — never offer discounts without permission)"
            : c.stage === "high_intent" || c.stage === "booking_in_progress"
              ? " (high intent — sooner)"
              : "";
    label = nextActionBy === "ai" ? `AI follows up ${when}${why}` : `Follow up ${when}${why}`;
  }

  const serviceName = facts.lead?.serviceName ?? facts.lead?.lead.serviceInterest ?? null;
  const pref = statedTimePreference(customerMsgs);
  const wants = [serviceName, pref ? `${pref} appointment` : null].filter(Boolean).join(" · ") || null;
  const conversationId = facts.lead?.lead.conversationId ?? facts.convs[0]?.id ?? null;

  const row = await upsertOpen(ctx, key, {
    kind: "lead",
    stage: c.stage,
    customerId,
    conversationId,
    leadId: facts.lead?.lead.id ?? null,
    serviceId: facts.lead?.lead.serviceId ?? null,
    title: serviceName ? `${serviceName} enquiry` : "New enquiry",
    wants,
    blocker: c.blocker,
    blockerDetail: c.blockerDetail,
    intentScore: c.intent,
    nextAction,
    nextActionLabel: label,
    nextActionAt,
    nextActionBy,
    followUpId: pending?.id ?? null,
    evidence: c.evidence,
    estimatedValueCents: facts.lead?.priceCents ?? null,
    lastActivityAt: facts.msgs.at(-1)?.createdAt ?? null,
  });

  // Execute: queue the AI follow-up at the engine's time (one pending per customer, all stop conditions apply).
  if (opts.schedule !== false && nextActionBy === "ai" && nextAction === "follow_up" && nextActionAt && awaitingCustomer) {
    const needsNew = !pending || Math.abs(pending.scheduledFor.getTime() - nextActionAt.getTime()) > 5 * 60_000;
    if (needsNew) {
      const rearm = facts.followUps.some((f) => f.statusReason === "Customer replied");
      const f = await scheduleFollowUp(ctx, {
        customerId,
        leadId: facts.lead?.lead.id ?? null,
        conversationId,
        scheduledFor: nextActionAt,
        attempt: sent.length + 1,
        reason: `Asked about ${serviceName ?? "a service"} but did not book`,
        quiet: rearm || Boolean(pending),
      }).catch(() => null);
      if (f) await dbOf(ctx).update(opportunities).set({ followUpId: f.id }).where(eq(opportunities.id, row.id));
    }
  }
  return row;
}

// ─── Appointment events ───────────────────────────────────────────────
type Appointment = typeof appointments.$inferSelect;

async function serviceInfo(ctx: Ctx, serviceId: string) {
  return dbOf(ctx).query.services.findFirst({ where: and(eq(services.businessId, ctx.businessId), eq(services.id, serviceId)) });
}

export async function onAppointmentBooked(ctx: Ctx, appt: Appointment) {
  await evaluateLead(ctx, appt.customerId, { schedule: false });
  // A rebooking closes this customer's open cancellation / no-show / reactivation opportunities.
  const open = await dbOf(ctx)
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.businessId, ctx.businessId),
        eq(opportunities.customerId, appt.customerId),
        eq(opportunities.status, "open"),
        inArray(opportunities.kind, ["cancellation", "no_show", "reactivation"]),
      ),
    );
  for (const o of open) {
    const recovered = await recoveryPreceded(ctx, appt.customerId, o.createdAt, appt.createdAt);
    await close(ctx, o, {
      status: "won",
      stage: "booked",
      reason: recovered ? "Rebooked after follow-up" : "Customer rebooked",
      wonAppointmentId: appt.id,
      recovered,
      recoveredValueCents: appt.priceCents,
    });
  }
}

export async function onAppointmentLost(ctx: Ctx, appt: Appointment, kind: "cancellation" | "no_show") {
  const service = await serviceInfo(ctx, appt.serviceId);
  const business = await getBusiness(ctx);
  const local = DateTime.fromJSDate(appt.startsAt).setZone(business.timezone);
  const when = local.toFormat("ccc d LLL, h:mm a");
  const nextMorning = civilHours(DateTime.fromJSDate(new Date()).setZone(business.timezone).plus({ hours: kind === "no_show" ? 2 : 0 }).toJSDate(), business.timezone);
  await upsertOpen(ctx, `${kind}:${appt.id}`, {
    kind,
    stage: kind === "cancellation" ? "cancelled" : "no_show",
    customerId: appt.customerId,
    conversationId: appt.conversationId,
    sourceAppointmentId: appt.id,
    serviceId: appt.serviceId,
    title: `${service?.name ?? "Appointment"} ${kind === "cancellation" ? "cancelled" : "missed"} — ${when}`,
    wants: `Rebook ${service?.name ?? "their appointment"}`,
    blocker: "none",
    blockerDetail: kind === "cancellation" ? (appt.cancelReason ? `Reason given: “${appt.cancelReason}”` : null) : "Didn't attend",
    intentScore: kind === "cancellation" ? 45 : 35,
    nextAction: "offer_rebooking",
    nextActionLabel: "Offer a new time",
    nextActionAt: nextMorning,
    nextActionBy: "human",
    evidence: [
      {
        at: (kind === "cancellation" ? (appt.cancelledAt ?? new Date()) : new Date()).toISOString(),
        kind: kind === "cancellation" ? "appointment_cancelled" : "no_show",
        detail: `${service?.name ?? "Appointment"} on ${when} ${kind === "cancellation" ? "was cancelled" : "was marked as a no-show"}`,
      },
    ],
    estimatedValueCents: appt.priceCents,
    lastActivityAt: new Date(),
  });
}

// ─── Human escalation ─────────────────────────────────────────────────
export async function onHandoff(ctx: Ctx, conversationId: string, reason: string) {
  const conv = await dbOf(ctx).query.conversations.findFirst({ where: and(eq(conversations.businessId, ctx.businessId), eq(conversations.id, conversationId)) });
  if (!conv) return;
  await upsertOpen(ctx, `needs_human:${conversationId}`, {
    kind: "needs_human",
    stage: "needs_human",
    customerId: conv.customerId,
    conversationId,
    title: "Handed to the team",
    blocker: "needs_staff",
    blockerDetail: reason,
    intentScore: 50,
    nextAction: "human_review",
    nextActionLabel: "Reply to the customer in the inbox",
    nextActionAt: new Date(),
    nextActionBy: "human",
    evidence: [{ at: new Date().toISOString(), kind: "handoff", detail: `Handed to a person: ${reason}` }],
    lastActivityAt: new Date(),
  });
  // The lead (if any) now waits on staff.
  await evaluateLead(ctx, conv.customerId, { schedule: false });
}

export async function onTakeOver(ctx: Ctx, conversationId: string, byName: string) {
  await dbOf(ctx)
    .update(opportunities)
    .set({ nextActionLabel: `${byName} is handling this conversation`, nextActionAt: null })
    .where(and(eq(opportunities.businessId, ctx.businessId), eq(opportunities.key, `needs_human:${conversationId}`), eq(opportunities.status, "open")));
}

export async function onConversationReleased(ctx: Ctx, conversationId: string, how: "resolved" | "returned_to_ai") {
  const open = await findOpen(ctx, `needs_human:${conversationId}`);
  if (open) await close(ctx, open, { status: "won", stage: "completed", reason: how === "resolved" ? "Resolved by the team" : "Handled by the team, returned to the AI" });
}

// ─── Sweep (runs in the background tick) ──────────────────────────────
/**
 * Reconcile and advance opportunities for one business: re-evaluate leads
 * whose next action is due or that have no opportunity yet, detect
 * cancellations/no-shows that slipped past hooks, and surface customers who
 * haven't returned. Idempotent.
 */
export async function sweepBusiness(ctx: Ctx, now = new Date()) {
  const db = dbOf(ctx);
  const b = ctx.businessId;
  const settings = await getAiSettings(ctx);

  // Leads without an open opportunity (e.g. created before the engine) or whose next action is due / stale.
  const leadCustomers = await db.execute<{ customer_id: string }>(sql`
    select distinct l.customer_id from leads l
    where l.business_id = ${b} and l.status in ('new','contacted','qualified')
      and not exists (select 1 from opportunities o where o.business_id = ${b} and o.key = 'lead:' || l.customer_id and o.status <> 'open' and o.closed_at > l.updated_at)
    limit 300`);
  const due = await db
    .select({ customerId: opportunities.customerId })
    .from(opportunities)
    .where(and(eq(opportunities.businessId, b), eq(opportunities.status, "open"), eq(opportunities.kind, "lead"), lt(opportunities.evaluatedAt, new Date(now.getTime() - HOUR))))
    .limit(300);
  const ids = new Set([...leadCustomers.rows.map((r) => r.customer_id), ...due.map((d) => d.customerId)]);
  for (const id of ids) await safely(ctx, "sweep lead", (c) => evaluateLead(c, id, { now }));

  // Cancellations / no-shows in the last 30 days without an opportunity, and not rebooked since.
  const lost = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.businessId, b),
        inArray(appointments.status, ["cancelled", "no_show"]),
        gte(appointments.updatedAt, new Date(now.getTime() - 30 * 24 * HOUR)),
        sql`not exists (select 1 from opportunities o where o.business_id = ${b} and o.source_appointment_id = ${appointments.id})`,
        sql`not exists (select 1 from appointments a2 where a2.business_id = ${b} and a2.customer_id = ${appointments.customerId} and a2.status in ('booked','confirmed','completed') and a2.created_at > ${appointments.updatedAt})`,
      ),
    )
    .limit(100);
  for (const a of lost) await safely(ctx, "sweep appointment", (c) => onAppointmentLost(c, a, a.status === "cancelled" ? "cancellation" : "no_show"));

  // Handoffs still waiting for a person without an open opportunity.
  const waiting = await db
    .select({ id: conversations.id, reason: conversations.handoffReason })
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, b),
        eq(conversations.owner, "human"),
        sql`${conversations.handoffRequestedAt} is not null`,
        isNull(conversations.assignedUserId),
        sql`${conversations.status} <> 'resolved'`,
        sql`not exists (select 1 from opportunities o where o.business_id = ${b} and o.key = 'needs_human:' || ${conversations.id} and o.status = 'open')`,
      ),
    )
    .limit(100);
  for (const w of waiting) await safely(ctx, "sweep handoff", (c) => onHandoff(c, w.id, w.reason ?? "Customer needs a person"));

  // Customers who haven't returned (reactivation).
  const cutoff = new Date(now.getTime() - settings.missedOpportunities.noReturnDays * 24 * HOUR);
  const lapsed = await db.execute<{ customer_id: string; last: string; service_id: string; price_cents: number | null; service_name: string }>(sql`
    select distinct on (c.id) c.id as customer_id, a.starts_at as last, a.service_id, a.price_cents, s.name as service_name
    from customers c
    join appointments a on a.customer_id = c.id and a.business_id = ${b} and a.status = 'completed'
    join services s on s.id = a.service_id
    where c.business_id = ${b}
      and not exists (select 1 from appointments a2 where a2.customer_id = c.id and a2.business_id = ${b} and (a2.starts_at > a.starts_at or (a2.status in ('booked','confirmed') and a2.starts_at > ${now})))
      and not exists (select 1 from opportunities o where o.business_id = ${b} and o.key = 'reactivation:' || c.id || ':' || to_char(a.starts_at, 'YYYY-MM-DD'))
    order by c.id, a.starts_at desc
    limit 100`);
  for (const r of lapsed.rows) {
    const last = new Date(r.last);
    if (last >= cutoff) continue;
    const day = DateTime.fromJSDate(last).toISODate();
    await safely(ctx, "sweep reactivation", (c) =>
      upsertOpen(c, `reactivation:${r.customer_id}:${day}`, {
        kind: "reactivation",
        stage: "reactivation",
        customerId: r.customer_id,
        serviceId: r.service_id,
        title: `Hasn't been back since ${DateTime.fromJSDate(last).toFormat("d LLL yyyy")}`,
        wants: null,
        blocker: "none",
        intentScore: 25,
        nextAction: "reactivate",
        nextActionLabel: `Invite them back (last visit: ${r.service_name})`,
        nextActionAt: now,
        nextActionBy: "human",
        evidence: [{ at: last.toISOString(), kind: "last_visit", detail: `Last completed visit: ${r.service_name}, ${DateTime.fromJSDate(last).toFormat("d LLL yyyy")}` }],
        estimatedValueCents: r.price_cents,
        lastActivityAt: last,
      }),
    );
  }
}

/** Run the sweep for every business with recent activity. */
export async function sweepAll(now = new Date()) {
  const { db } = await import("@/db");
  const rows = await db.execute<{ id: string }>(sql`
    select b.id from businesses b
    where exists (select 1 from leads l where l.business_id = b.id and l.updated_at > ${new Date(now.getTime() - 60 * 24 * HOUR)})
       or exists (select 1 from appointments a where a.business_id = b.id and a.updated_at > ${new Date(now.getTime() - 400 * 24 * HOUR)})
       or exists (select 1 from opportunities o where o.business_id = b.id and o.status = 'open')`);
  for (const r of rows.rows) await safely({ businessId: r.id, actor: { type: "system", name: "Opportunity Engine" } }, "sweep business", (c) => sweepBusiness(c, now));
  return rows.rows.length;
}
