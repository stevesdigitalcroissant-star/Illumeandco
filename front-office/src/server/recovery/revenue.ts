/**
 * Revenue attribution — what the recovery workers found, influenced and
 * actually brought in. Three tiers, deliberately conservative:
 *
 *   Identified  — opportunities and freed slots that appeared in the period.
 *                 Valued at the service price; where the service is unknown
 *                 (a missed call, a vague enquiry) at the business's average
 *                 booking value — counted separately and labelled an estimate.
 *   Influenced  — bookings that happened after one of our actions (a text-back,
 *                 first message, follow-up or slot offer went out first).
 *                 Valued at the booked appointment's price.
 *   Realized    — influenced bookings whose appointment was completed. Only
 *                 what we can verify in the calendar counts; slots booked in an
 *                 external system are reported as "not verifiable here".
 *
 * Everything is computed from real rows; nothing is projected.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { appointments, customers, opportunities, services, slotRecoveries, staff } from "@/db/schema";
import { assertCan, dbOf, type Ctx } from "../context";

export type Worker = "missed_call" | "lead" | "slot" | "rebooking" | "reactivation";
export const WORKER_LABELS: Record<Worker, string> = {
  missed_call: "Missed calls",
  lead: "Leads",
  slot: "Freed slots",
  rebooking: "Cancellations & no-shows",
  reactivation: "Reactivation",
};
const WORKERS = Object.keys(WORKER_LABELS) as Worker[];

const workerOf = (kind: string): Worker | null =>
  kind === "missed_call" ? "missed_call" : kind === "lead" ? "lead" : kind === "cancellation" || kind === "no_show" ? "rebooking" : kind === "reactivation" ? "reactivation" : null;

type Tier = { count: number; valueCents: number };
const zero = (): Tier => ({ count: 0, valueCents: 0 });

export async function revenueSummary(ctx: Ctx, opts: { days?: number; now?: Date } = {}) {
  assertCan(ctx, "analytics.view");
  const db = dbOf(ctx);
  const now = opts.now ?? new Date();
  const days = opts.days ?? 30;
  const since = new Date(now.getTime() - days * 86400_000);
  const b = ctx.businessId;

  // Average booking value over the last 90 days (for unknown-value opportunities only).
  const [avg] = (
    await db.execute<{ avg: string | null }>(sql`
      select avg(price_cents) as avg from appointments
      where business_id = ${b} and price_cents is not null and status in ('booked','confirmed','completed')
        and created_at >= ${new Date(now.getTime() - 90 * 86400_000)}`)
  ).rows;
  const averageCents = avg?.avg == null ? null : Math.round(Number(avg.avg) / 100) * 100;

  const byWorker = Object.fromEntries(WORKERS.map((w) => [w, { identified: zero(), influenced: zero(), realized: zero(), estimated: 0 }])) as Record<
    Worker,
    { identified: Tier; influenced: Tier; realized: Tier; estimated: number }
  >;
  let unverifiable = 0;

  // ── Opportunities ────────────────────────────────────────────────
  const created = await db
    .select({ kind: opportunities.kind, value: opportunities.estimatedValueCents })
    .from(opportunities)
    .where(and(eq(opportunities.businessId, b), gte(opportunities.createdAt, since)));
  for (const o of created) {
    const w = workerOf(o.kind);
    if (!w) continue;
    const row = byWorker[w];
    row.identified.count++;
    if (o.value != null) row.identified.valueCents += o.value;
    else if (averageCents != null) {
      row.identified.valueCents += averageCents;
      row.estimated++;
    }
  }
  const recovered = await db
    .select({ kind: opportunities.kind, value: opportunities.recoveredValueCents, status: appointments.status, price: appointments.priceCents })
    .from(opportunities)
    .leftJoin(appointments, eq(appointments.id, opportunities.wonAppointmentId))
    .where(and(eq(opportunities.businessId, b), eq(opportunities.recovered, true), gte(opportunities.closedAt, since)));
  for (const o of recovered) {
    const w = workerOf(o.kind);
    if (!w) continue;
    byWorker[w].influenced.count++;
    byWorker[w].influenced.valueCents += o.value ?? 0;
    if (o.status === "completed") {
      byWorker[w].realized.count++;
      byWorker[w].realized.valueCents += o.price ?? o.value ?? 0;
    }
  }

  // ── Freed slots ──────────────────────────────────────────────────
  const slots = await db
    .select({ slot: slotRecoveries, apptStatus: appointments.status, apptPrice: appointments.priceCents })
    .from(slotRecoveries)
    .leftJoin(appointments, eq(appointments.id, slotRecoveries.filledAppointmentId))
    .where(and(eq(slotRecoveries.businessId, b), gte(slotRecoveries.createdAt, since)));
  for (const { slot, apptStatus, apptPrice } of slots) {
    const row = byWorker.slot;
    row.identified.count++;
    if (slot.lostValueCents != null) row.identified.valueCents += slot.lostValueCents;
    else if (averageCents != null) {
      row.identified.valueCents += averageCents;
      row.estimated++;
    }
    if (slot.status === "filled" && slot.filledBy) {
      row.influenced.count++;
      row.influenced.valueCents += slot.filledValueCents ?? 0;
      if (apptStatus === "completed") {
        row.realized.count++;
        row.realized.valueCents += apptPrice ?? slot.filledValueCents ?? 0;
      } else if (!slot.filledAppointmentId) unverifiable++;
    }
  }

  const total = (k: "identified" | "influenced" | "realized") =>
    WORKERS.reduce((t, w) => ({ count: t.count + byWorker[w][k].count, valueCents: t.valueCents + byWorker[w][k].valueCents }), zero());
  return {
    days,
    averageCents,
    identified: total("identified"),
    influenced: total("influenced"),
    realized: total("realized"),
    estimatedCount: WORKERS.reduce((n, w) => n + byWorker[w].estimated, 0),
    unverifiable,
    workers: WORKERS.map((w) => ({ worker: w, label: WORKER_LABELS[w], ...byWorker[w] })),
  };
}

// ─── Prioritized feed ─────────────────────────────────────────────────
export type FeedAction = "let_ai_handle" | "offer_rebooking" | "reactivate" | "recover_slot" | "confirm_slot" | "open_conversation" | null;
export type FeedItem = {
  id: string;
  type: "opportunity" | "slot";
  worker: Worker | "needs_human";
  title: string;
  who: string | null;
  detail: string | null;
  valueCents: number | null;
  valueIsEstimate: boolean;
  /** 0–100 likelihood signal (intent score for opportunities). */
  likelihood: number;
  /** 2 = a customer is waiting on a person, 1 = a customer accepted a slot, 0 = everything else. Sorted first. */
  tier: 0 | 1 | 2;
  priority: number;
  why: string;
  action: FeedAction;
  conversationId: string | null;
  dueAt: Date | null;
};

/**
 * What to do next. A customer waiting on a person always comes first, then
 * a customer who accepted a slot; everything else by priority = value ×
 * likelihood, doubled for empty time in the next 48h. Only items a person can
 * act on are listed; work the AI is already doing is not.
 */
export async function revenueFeed(ctx: Ctx, opts: { now?: Date; limit?: number } = {}) {
  assertCan(ctx, "leads.manage");
  const db = dbOf(ctx);
  const now = opts.now ?? new Date();
  const [avg] = (
    await db.execute<{ avg: string | null }>(sql`
      select avg(price_cents) as avg from appointments where business_id = ${ctx.businessId} and price_cents is not null and status in ('booked','confirmed','completed')`)
  ).rows;
  const averageCents = avg?.avg == null ? null : Math.round(Number(avg.avg) / 100) * 100;
  const items: FeedItem[] = [];

  const opps = await db
    .select({ o: opportunities, name: customers.name, phone: customers.phone, email: customers.email, optedOut: customers.optedOut, serviceName: services.name })
    .from(opportunities)
    .innerJoin(customers, eq(customers.id, opportunities.customerId))
    .leftJoin(services, eq(services.id, opportunities.serviceId))
    .where(
      and(
        eq(opportunities.businessId, ctx.businessId),
        eq(opportunities.status, "open"),
        sql`(${opportunities.kind} = 'needs_human' or (${opportunities.nextActionBy} = 'human' and ${opportunities.nextAction} <> 'none'))`,
      ),
    )
    .orderBy(desc(opportunities.intentScore))
    .limit(200);
  for (const { o, name, phone, email, optedOut, serviceName } of opps) {
    const waitingPerson = o.kind === "needs_human";
    // A person waiting in the inbox isn't a priced opportunity — don't invent a value for it.
    const value = waitingPerson ? null : (o.estimatedValueCents ?? averageCents);
    const likelihood = o.intentScore;
    const action: FeedAction = waitingPerson
      ? "open_conversation"
      : optedOut || o.blocker === "opted_out"
        ? null
        : o.kind === "reactivation"
          ? "reactivate"
          : o.kind === "cancellation" || o.kind === "no_show"
            ? "offer_rebooking"
            : "let_ai_handle";
    const base = ((value ?? 0) / 100) * (likelihood / 100);
    items.push({
      id: o.id,
      type: "opportunity",
      worker: waitingPerson ? "needs_human" : (workerOf(o.kind) ?? "lead"),
      title: o.title,
      who: name ?? phone ?? email ?? "Website visitor",
      detail: o.nextActionLabel,
      valueCents: value,
      valueIsEstimate: o.estimatedValueCents == null && value != null,
      likelihood,
      tier: waitingPerson ? 2 : 0,
      priority: Math.round(base),
      why: waitingPerson
        ? "A customer is waiting for a person — always first"
        : `${likelihood}/100 intent${value != null ? ` × ${o.estimatedValueCents == null ? "avg. " : ""}value` : ""}${serviceName ? ` · ${serviceName}` : ""}`,
      action,
      conversationId: o.conversationId,
      dueAt: o.nextActionAt,
    });
  }

  const slots = await db
    .select({ s: slotRecoveries, serviceName: services.name, staffName: staff.name, filledName: customers.name })
    .from(slotRecoveries)
    .leftJoin(services, eq(services.id, slotRecoveries.serviceId))
    .leftJoin(staff, eq(staff.id, slotRecoveries.staffId))
    .leftJoin(customers, eq(customers.id, slotRecoveries.filledCustomerId))
    .where(and(eq(slotRecoveries.businessId, ctx.businessId), inArray(slotRecoveries.status, ["open", "pending_staff"])))
    .limit(100);
  for (const { s, serviceName, staffName, filledName } of slots) {
    const value = s.lostValueCents ?? averageCents;
    const hours = (s.startsAt.getTime() - now.getTime()) / 3600_000;
    const urgent = hours <= 48;
    const confirm = s.status === "pending_staff";
    const likelihood = confirm ? 95 : 50;
    items.push({
      id: s.id,
      type: "slot",
      worker: "slot",
      title: `${confirm ? "Accepted slot" : "Empty slot"} · ${[serviceName ?? s.label, staffName].filter(Boolean).join(" · ") || "appointment"}`,
      who: confirm ? (filledName ?? "A waitlisted customer") : null,
      detail: confirm ? "The customer said YES — book them and mark it recovered" : s.statusNote,
      valueCents: value,
      valueIsEstimate: s.lostValueCents == null && value != null,
      likelihood,
      tier: confirm ? 1 : 0,
      priority: Math.round(((value ?? 0) / 100) * (likelihood / 100) * (urgent ? 2 : 1)),
      why: confirm ? "Accepted by a customer — only needs booking" : `Empty time${urgent ? " in the next 48 hours (×2 urgency)" : ""} · refill chance treated as 50%`,
      action: confirm ? "confirm_slot" : "recover_slot",
      conversationId: null,
      dueAt: s.startsAt,
    });
  }
  return items.sort((a, b) => b.tier - a.tier || b.priority - a.priority).slice(0, opts.limit ?? 25);
}
