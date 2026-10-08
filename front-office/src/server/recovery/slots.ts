/**
 * Slot Recovery — refill cancelled and moved appointments from a waitlist.
 *
 * A freed slot (a cancellation or reschedule in the built-in calendar, or a
 * `slot.opened` event from the business's own booking system) is recorded
 * once. Waitlisted customers are ranked by an explainable score — fit
 * (time of day, staff), value, how long they've waited, reliability — and the
 * top few are offered the slot (automatically, or when a person clicks
 * "Recover slot"). The first to reply YES gets it:
 *
 *   - built-in calendar + the AI may book → booked immediately; the database's
 *     double-booking constraint guarantees only one person can win;
 *   - otherwise (external system, or booking not permitted) → the team is
 *     asked to confirm, and the customer is told exactly that.
 *
 * Nothing is claimed that didn't happen: offers only count as sent when the
 * channel accepted them, and a slot only counts as recovered when it was
 * filled through an accepted offer.
 */
import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import {
  appointments,
  customers,
  messages,
  services,
  slotOffers,
  slotRecoveries,
  staff,
  waitlistEntries,
  type Daypart,
} from "@/db/schema";
import { renderTemplate } from "@/lib/templates";
import { audit } from "../audit";
import { isAllowed } from "../ai/permissions";
import { AppError, assertCan, dbOf, invalid, notFound, type Ctx } from "../context";
import { bookAppointment } from "../services/appointments";
import { findSlot } from "../services/availability";
import { getAgent, getAiSettings, getBusiness } from "../services/business";
import { processFollowUp, scheduleFollowUp } from "../services/followups";
import { reachable } from "./leads";

export type Slot = typeof slotRecoveries.$inferSelect;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
type Appointment = typeof appointments.$inferSelect;

const DAY = 24 * 3600_000;
export const DAYPARTS: Daypart[] = ["morning", "afternoon", "evening"];

export function daypartOf(at: Date, tz: string): Daypart {
  const h = DateTime.fromJSDate(at).setZone(tz).hour;
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

const fmt = (at: Date, tz: string) => DateTime.fromJSDate(at).setZone(tz).toFormat("ccc d LLL 'at' h:mm a");
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && DateTime.fromISO(v).isValid;

// ─── Waitlist ─────────────────────────────────────────────────────────
export async function addToWaitlist(
  ctx: Ctx,
  input: { customerId: string; serviceId: string; staffId?: string | null; earliestDate: string; latestDate?: string | null; dayparts?: Daypart[]; notes?: string | null; source: string },
) {
  if (ctx.actor.type === "user") assertCan(ctx, "appointments.manage");
  const db = dbOf(ctx);
  if (!isDate(input.earliestDate) || (input.latestDate && !isDate(input.latestDate))) throw invalid("Dates must be YYYY-MM-DD.");
  if (input.latestDate && input.latestDate < input.earliestDate) throw invalid("The latest date is before the earliest date.");
  const dayparts = [...new Set((input.dayparts ?? []).filter((d) => DAYPARTS.includes(d)))];
  const customer = await db.query.customers.findFirst({ where: and(eq(customers.businessId, ctx.businessId), eq(customers.id, input.customerId)) });
  if (!customer) throw notFound("Customer");
  const service = await db.query.services.findFirst({ where: and(eq(services.businessId, ctx.businessId), eq(services.id, input.serviceId)) });
  if (!service || !service.active) throw notFound("Service");
  if (input.staffId) {
    const s = await db.query.staff.findFirst({ where: and(eq(staff.businessId, ctx.businessId), eq(staff.id, input.staffId)) });
    if (!s) throw notFound("Staff member");
  }
  const values = {
    staffId: input.staffId ?? null,
    earliestDate: input.earliestDate,
    latestDate: input.latestDate ?? null,
    dayparts,
    notes: input.notes?.slice(0, 500) ?? null,
  };
  // One active entry per customer and service: re-joining updates it.
  const [existing] = await db
    .select()
    .from(waitlistEntries)
    .where(and(eq(waitlistEntries.businessId, ctx.businessId), eq(waitlistEntries.customerId, customer.id), eq(waitlistEntries.serviceId, service.id), eq(waitlistEntries.status, "active")))
    .limit(1);
  const [row] = existing
    ? await db.update(waitlistEntries).set(values).where(eq(waitlistEntries.id, existing.id)).returning()
    : await db
        .insert(waitlistEntries)
        .values({ ...values, businessId: ctx.businessId, customerId: customer.id, serviceId: service.id, source: input.source, createdBy: ctx.actor.type })
        .returning();
  await audit(ctx, {
    action: "waitlist.updated",
    summary: `${customer.name ?? customer.phone ?? customer.email ?? "Customer"} ${existing ? "updated their" : "joined the"} waitlist for ${service.name} (from ${input.earliestDate}${input.latestDate ? ` to ${input.latestDate}` : ""})`,
    entityType: "waitlist_entry",
    entityId: row!.id,
  });
  return row!;
}

export async function removeFromWaitlist(ctx: Ctx, entryId: string) {
  assertCan(ctx, "appointments.manage");
  const [row] = await dbOf(ctx)
    .update(waitlistEntries)
    .set({ status: "removed" })
    .where(and(eq(waitlistEntries.businessId, ctx.businessId), eq(waitlistEntries.id, entryId), eq(waitlistEntries.status, "active")))
    .returning();
  if (!row) throw notFound("Waitlist entry");
  await audit(ctx, { action: "waitlist.updated", summary: "Removed a waitlist entry", entityType: "waitlist_entry", entityId: row.id });
  return row;
}

export async function listWaitlist(ctx: Ctx) {
  assertCan(ctx, "appointments.view_all");
  return dbOf(ctx)
    .select({ entry: waitlistEntries, customer: customers, serviceName: services.name, staffName: staff.name })
    .from(waitlistEntries)
    .innerJoin(customers, eq(customers.id, waitlistEntries.customerId))
    .innerJoin(services, eq(services.id, waitlistEntries.serviceId))
    .leftJoin(staff, eq(staff.id, waitlistEntries.staffId))
    .where(and(eq(waitlistEntries.businessId, ctx.businessId), eq(waitlistEntries.status, "active")))
    .orderBy(asc(waitlistEntries.createdAt));
}

// ─── Freed slots ──────────────────────────────────────────────────────
/** Record a slot freed in the built-in calendar. Called from cancellation/reschedule (inside their transaction). */
export async function onSlotFreed(ctx: Ctx, appt: Pick<Appointment, "id" | "staffId" | "serviceId" | "startsAt" | "endsAt" | "priceCents">, source: "cancellation" | "reschedule", now = new Date()) {
  const settings = await getAiSettings(ctx);
  if (!settings.recovery.slots.enabled) return null;
  const business = await getBusiness(ctx);
  if (appt.startsAt.getTime() - business.minNoticeMinutes * 60_000 <= now.getTime()) return null; // too late to refill
  const [row] = await dbOf(ctx)
    .insert(slotRecoveries)
    .values({
      businessId: ctx.businessId,
      source,
      sourceAppointmentId: appt.id,
      staffId: appt.staffId,
      serviceId: appt.serviceId,
      startsAt: appt.startsAt,
      endsAt: appt.endsAt,
      lostValueCents: appt.priceCents,
      statusNote: settings.recovery.slots.autoOffer ? "Offers go out automatically" : "Waiting for someone to click Recover slot",
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

/** A free slot reported by the business's own booking system (we can offer it; the team books it there). */
export async function onExternalSlot(ctx: Ctx, input: { externalRef: string; startsAt: Date; durationMinutes: number; service?: string; staff?: string }, now = new Date()) {
  const settings = await getAiSettings(ctx);
  if (!settings.recovery.slots.enabled) return { handled: false as const, detail: "Slot recovery is turned off" };
  if (input.startsAt.getTime() <= now.getTime()) return { handled: false as const, detail: "That slot is already in the past" };
  const { matchService } = await import("./leads");
  const service = await matchService(ctx, input.service);
  const [row] = await dbOf(ctx)
    .insert(slotRecoveries)
    .values({
      businessId: ctx.businessId,
      source: "external",
      externalRef: input.externalRef,
      serviceId: service?.id ?? null,
      label: [service ? null : input.service, input.staff].filter(Boolean).join(" · ") || null,
      startsAt: input.startsAt,
      endsAt: new Date(input.startsAt.getTime() + input.durationMinutes * 60_000),
      lostValueCents: service?.priceCents ?? null,
      statusNote: settings.recovery.slots.autoOffer ? "Offers go out automatically" : "Waiting for someone to click Recover slot",
    })
    .onConflictDoNothing()
    .returning();
  if (!row) return { handled: false as const, detail: "Slot already recorded" };
  return { handled: true as const, slotId: row.id, detail: `Slot recorded${service ? ` for ${service.name}` : ""}` };
}

// ─── Ranking ──────────────────────────────────────────────────────────
export type Candidate = {
  entry: WaitlistEntry;
  customer: typeof customers.$inferSelect;
  serviceName: string;
  priceCents: number | null;
  score: number;
  reasons: string[];
  /** Why they can't be offered this slot (null = eligible). */
  blocked: string | null;
};

/**
 * Rank everyone on the waitlist for a slot. Deterministic and explainable.
 * Pass `need` to stop the (expensive) calendar check once that many people are
 * confirmed eligible; anyone left unchecked is omitted from the result.
 *
 *   base 20 · value up to +30 · waiting time up to +25 · reliability −20…+10 ·
 *   preferred time of day +10 · preferred staff +10 · needs it soon +5.
 */
export async function rankCandidates(ctx: Ctx, slot: Slot, now = new Date(), opts: { need?: number } = {}): Promise<Candidate[]> {
  const db = dbOf(ctx);
  const business = await getBusiness(ctx);
  const tz = business.timezone;
  const slotDate = DateTime.fromJSDate(slot.startsAt).setZone(tz).toISODate()!;
  const part = daypartOf(slot.startsAt, tz);
  const rows = await db
    .select({ entry: waitlistEntries, customer: customers, serviceName: services.name, priceCents: services.priceCents, duration: services.durationMinutes })
    .from(waitlistEntries)
    .innerJoin(customers, eq(customers.id, waitlistEntries.customerId))
    .innerJoin(services, eq(services.id, waitlistEntries.serviceId))
    .where(and(eq(waitlistEntries.businessId, ctx.businessId), eq(waitlistEntries.status, "active")))
    .orderBy(asc(waitlistEntries.createdAt))
    .limit(100);
  if (!rows.length) return [];
  const maxPrice = Math.max(1, ...rows.map((r) => r.priceCents ?? 0));
  const ids = rows.map((r) => r.customer.id);
  const history = await db
    .select({ customerId: appointments.customerId, status: appointments.status, startsAt: appointments.startsAt, endsAt: appointments.endsAt, id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.businessId, ctx.businessId), inArray(appointments.customerId, ids)));
  const offered = new Set(
    (await db.select({ customerId: slotOffers.customerId }).from(slotOffers).where(eq(slotOffers.slotId, slot.id))).map((o) => o.customerId),
  );
  const sourceCustomer = slot.sourceAppointmentId ? history.find((h) => h.id === slot.sourceAppointmentId)?.customerId : null;

  const out: (Candidate & { needsFit: boolean })[] = [];
  for (const r of rows) {
    const { entry, customer } = r;
    const reasons: string[] = [];
    let blocked: string | null = null;
    let score = 20;

    const valuePts = Math.round(((r.priceCents ?? 0) / maxPrice) * 30);
    score += valuePts;
    if (valuePts) reasons.push(`Value: ${r.serviceName} (+${valuePts})`);
    const days = Math.floor((now.getTime() - entry.createdAt.getTime()) / DAY);
    const waitPts = Math.min(25, Math.round(days * 2.5));
    score += waitPts;
    reasons.push(`Waiting ${days} day${days === 1 ? "" : "s"}${waitPts ? ` (+${waitPts})` : ""}`);
    const mine = history.filter((h) => h.customerId === customer.id);
    const completed = mine.filter((h) => h.status === "completed").length;
    const noShows = mine.filter((h) => h.status === "no_show").length;
    const rel = Math.max(-20, Math.min(10, completed * 3) - noShows * 10);
    score += rel;
    if (completed || noShows) reasons.push(`${completed} completed visit${completed === 1 ? "" : "s"}${noShows ? `, ${noShows} no-show${noShows === 1 ? "" : "s"}` : ""} (${rel >= 0 ? "+" : ""}${rel})`);
    if (entry.dayparts.length && entry.dayparts.includes(part)) {
      score += 10;
      reasons.push(`Asked for ${part}s (+10)`);
    }
    if (entry.staffId && entry.staffId === slot.staffId) {
      score += 10;
      reasons.push("Their preferred staff member (+10)");
    }
    if (entry.latestDate && DateTime.fromISO(entry.latestDate).diff(DateTime.fromISO(slotDate), "days").days <= 7) {
      score += 5;
      reasons.push("Needs it soon (+5)");
    }

    // Eligibility — every check is a hard rule, not a score.
    if (offered.has(customer.id)) blocked = "Already offered this slot";
    else if (customer.id === sourceCustomer) blocked = "They gave up this slot";
    else if (customer.optedOut) blocked = "Opted out of messages";
    else if (slotDate < entry.earliestDate || (entry.latestDate && slotDate > entry.latestDate)) blocked = "Outside their dates";
    else if (entry.dayparts.length && !entry.dayparts.includes(part)) blocked = `Wants ${entry.dayparts.join("/")}, not ${part}`;
    else if (entry.staffId && slot.staffId && entry.staffId !== slot.staffId) blocked = "Wants a different staff member";
    else if (slot.serviceId && slot.source === "external" && entry.serviceId !== slot.serviceId) blocked = "Different service";
    else if (slot.source === "external" && r.duration * 60_000 > slot.endsAt.getTime() - slot.startsAt.getTime()) blocked = "Their service doesn't fit in this slot";
    else if (mine.some((h) => ["booked", "confirmed"].includes(h.status) && h.startsAt < slot.endsAt && h.endsAt > slot.startsAt)) blocked = "Already booked at that time";
    else if (!reachable(business, customer)) blocked = "No configured channel can reach them";
    // Built-in calendar: whether their service fits this exact time is checked below (the expensive part).
    const needsFit = !blocked && slot.source !== "external";
    out.push({ entry, customer, serviceName: r.serviceName, priceCents: r.priceCents, score: Math.max(0, Math.min(100, score)), reasons, blocked, needsFit });
  }

  // Calendar fit, highest score first. The answer depends only on the service (same slot, staff and time),
  // so it's computed once per service — and with `need`, only until enough people are confirmed.
  out.sort((a, b) => b.score - a.score || a.entry.createdAt.getTime() - b.entry.createdAt.getTime());
  const fitByService = new Map<string, boolean>();
  let eligible = 0;
  const result: Candidate[] = [];
  for (const { needsFit, ...c } of out) {
    if (!c.blocked && needsFit) {
      if (opts.need !== undefined && eligible >= opts.need) continue; // not needed — left unchecked and omitted
      let fits = fitByService.get(c.entry.serviceId);
      if (fits === undefined) {
        fits = Boolean(await findSlot(ctx, { serviceId: c.entry.serviceId, startsAt: slot.startsAt, staffId: slot.staffId ?? undefined, now }));
        fitByService.set(c.entry.serviceId, fits);
      }
      if (!fits) c.blocked = "Their service doesn't fit in this slot";
    }
    if (!c.blocked) eligible++;
    result.push(c);
  }
  return result.sort((a, b) => Number(Boolean(a.blocked)) - Number(Boolean(b.blocked)) || b.score - a.score || a.entry.createdAt.getTime() - b.entry.createdAt.getTime());
}

// ─── Offering ─────────────────────────────────────────────────────────
async function getSlot(ctx: Ctx, slotId: string) {
  const s = await dbOf(ctx).query.slotRecoveries.findFirst({ where: and(eq(slotRecoveries.businessId, ctx.businessId), eq(slotRecoveries.id, slotId)) });
  if (!s) throw notFound("Slot");
  return s;
}

function withinMessagingHours(now: Date, tz: string) {
  const h = DateTime.fromJSDate(now).setZone(tz).hour;
  return h >= 9 && h < 20;
}

/**
 * Offer a slot to the next best candidates. Used by the "Recover slot" button
 * (a person) and by the sweep when auto-offer is on.
 */
export async function offerSlot(ctx: Ctx, slotId: string, opts: { now?: Date } = {}) {
  if (ctx.actor.type === "user") assertCan(ctx, "appointments.manage");
  const now = opts.now ?? new Date();
  const settings = await getAiSettings(ctx);
  const cfg = settings.recovery.slots;
  const business = await getBusiness(ctx);
  const slot = await getSlot(ctx, slotId);
  if (!["open", "offering"].includes(slot.status)) throw invalid(`This slot is ${slot.status.replace("_", " ")}.`);
  if (slot.startsAt.getTime() - business.minNoticeMinutes * 60_000 <= now.getTime()) throw invalid("Too late — this slot is within your minimum booking notice.");
  if (!isAllowed(settings.permissions, "send_messages")) throw invalid("The AI's \"Send messages\" permission is off, so offers can't be sent.");
  if (!withinMessagingHours(now, business.timezone)) throw invalid("Offers are only sent between 09:00 and 20:00 your time.");

  const live = await dbOf(ctx)
    .select({ id: slotOffers.id })
    .from(slotOffers)
    .where(and(eq(slotOffers.slotId, slot.id), eq(slotOffers.status, "sent"), gt(slotOffers.expiresAt, now)));
  const room = Math.max(0, Math.min(10, cfg.batchSize) - live.length);
  const ranked = await rankCandidates(ctx, slot, now, { need: room });
  const picks = ranked.filter((c) => !c.blocked).slice(0, room);
  if (!picks.length) {
    const unreachable = ranked.some((c) => c.blocked === "No configured channel can reach them");
    const detail = live.length
      ? "Offers are already out — waiting for replies."
      : unreachable && !ranked.some((c) => !c.blocked)
        ? "Nobody can be reached — SMS, WhatsApp or email needs setting up (configuration required)."
        : "No one on the waitlist fits this slot right now.";
    await dbOf(ctx)
      .update(slotRecoveries)
      .set({ statusNote: live.length ? "Waiting for replies" : detail })
      .where(eq(slotRecoveries.id, slot.id));
    return { sent: 0, failed: 0, detail };
  }
  const expiresAt = new Date(Math.min(now.getTime() + cfg.offerMinutes * 60_000, slot.startsAt.getTime() - business.minNoticeMinutes * 60_000));
  const agent = await getAgent(ctx);
  const aiCtx: Ctx = { ...ctx, actor: { type: "ai", agentId: agent.id, name: `${agent.name} (AI Receptionist)` } };
  let sent = 0;
  let failed = 0;
  for (const c of picks) {
    const message = renderTemplate(cfg.template, {
      customer_name: c.customer.name?.split(" ")[0] ?? "",
      business: business.name,
      service: c.serviceName.toLowerCase(),
      when: fmt(slot.startsAt, business.timezone),
    });
    const [offer] = await dbOf(ctx)
      .insert(slotOffers)
      .values({ businessId: ctx.businessId, slotId: slot.id, waitlistEntryId: c.entry.id, customerId: c.customer.id, score: c.score, reasons: c.reasons, expiresAt })
      .onConflictDoNothing()
      .returning();
    if (!offer) continue; // offered concurrently
    try {
      const f = await scheduleFollowUp(aiCtx, { customerId: c.customer.id, scheduledFor: now, message, reason: `Slot offer: ${fmt(slot.startsAt, business.timezone)}`, purpose: "slot_offer", quiet: true });
      const r = await processFollowUp(aiCtx, f);
      await dbOf(ctx)
        .update(slotOffers)
        .set({ status: r.sent ? "sent" : "failed", followUpId: f.id, conversationId: r.sent ? (r.conversationId ?? null) : null })
        .where(eq(slotOffers.id, offer.id));
      if (r.sent) sent++;
      else failed++;
    } catch (e) {
      failed++;
      await dbOf(ctx).update(slotOffers).set({ status: "failed" }).where(eq(slotOffers.id, offer.id));
      if (!(e instanceof AppError)) throw e;
    }
  }
  if (sent || live.length)
    await dbOf(ctx)
      .update(slotRecoveries)
      .set({ status: "offering", statusNote: `Offered to ${sent + live.length} — first to reply YES gets it` })
      .where(and(eq(slotRecoveries.id, slot.id), inArray(slotRecoveries.status, ["open", "offering"])));
  await audit(ctx, {
    action: "slot.offered",
    summary: `Slot ${fmt(slot.startsAt, business.timezone)} offered to ${sent} waitlisted customer${sent === 1 ? "" : "s"}${failed ? ` (${failed} not delivered)` : ""}`,
    entityType: "slot",
    entityId: slot.id,
  });
  return { sent, failed, detail: sent ? `Offered to ${sent} customer${sent === 1 ? "" : "s"}.` : "No offers could be delivered." };
}

// ─── Replies ──────────────────────────────────────────────────────────
const YES = /^\s*(y|yes|yes please|yep|yeah|yea|ok|okay|sure|definitely|absolutely|i'?ll take it|book (it|me)( in)?|please book( it| me)?|confirm(ed)?)\b[\s!.,]*(please|thanks|thank you)?[\s!.]*$/i;
const NO = /^\s*(n|no|nope|no thanks|no thank you|not this (one|time)|can'?t|cannot|pass)\b/i;

/**
 * If this customer has a live slot offer and their message is a clear yes or
 * no, handle it deterministically (no model involved) and return the reply.
 * Anything else returns null and the AI receptionist answers as usual.
 */
export async function handleSlotReply(ctx: Ctx, customerId: string, conversationId: string, text: string, now = new Date()): Promise<string | null> {
  const isYes = YES.test(text);
  const isNo = !isYes && NO.test(text);
  if (!isYes && !isNo) return null;
  const db = dbOf(ctx);
  const [offer] = await db
    .select()
    .from(slotOffers)
    .where(and(eq(slotOffers.businessId, ctx.businessId), eq(slotOffers.customerId, customerId), inArray(slotOffers.status, ["sent", "taken", "expired"]), gt(slotOffers.createdAt, new Date(now.getTime() - 2 * DAY))))
    .orderBy(desc(slotOffers.createdAt))
    .limit(1);
  if (!offer) return null;
  // Only treat it as an answer to the offer if the offer is the last thing we said in this conversation.
  const [lastOut] = await db
    .select({ metadata: messages.metadata })
    .from(messages)
    .where(and(eq(messages.businessId, ctx.businessId), eq(messages.conversationId, conversationId), inArray(messages.role, ["ai", "human"])))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (!offer.followUpId || (lastOut?.metadata as { followUpId?: string } | null)?.followUpId !== offer.followUpId) return null;
  const business = await getBusiness(ctx);
  const slot = await getSlot(ctx, offer.slotId);
  const when = fmt(slot.startsAt, business.timezone);

  if (offer.status !== "sent" || offer.expiresAt <= now || !["open", "offering"].includes(slot.status)) {
    if (offer.status === "sent") await db.update(slotOffers).set({ status: slot.status === "filled" || slot.status === "pending_staff" ? "taken" : "expired", respondedAt: now }).where(eq(slotOffers.id, offer.id));
    if (isNo) return "No problem — you're still on the waitlist.";
    return `Sorry — the ${when} slot is no longer available. You're still on the waitlist and we'll let you know when another one opens up.`;
  }
  if (isNo) {
    await db.update(slotOffers).set({ status: "declined", respondedAt: now }).where(eq(slotOffers.id, offer.id));
    return "No problem — you're still on the waitlist and we'll let you know about the next opening.";
  }

  const entry = await db.query.waitlistEntries.findFirst({ where: eq(waitlistEntries.id, offer.waitlistEntryId) });
  if (!entry) return null;
  const settings = await getAiSettings(ctx);
  const canBook = slot.source !== "external" && isAllowed(settings.permissions, "book_appointments");

  if (canBook) {
    const agent = await getAgent(ctx);
    const aiCtx: Ctx = { ...ctx, actor: { type: "ai", agentId: agent.id, name: `${agent.name} (AI Receptionist)` } };
    try {
      const booked = await bookAppointment(aiCtx, { serviceId: entry.serviceId, staffId: slot.staffId ?? undefined, startsAt: slot.startsAt, customerId, source: "ai", conversationId, now });
      await db.update(slotOffers).set({ status: "accepted", respondedAt: now }).where(eq(slotOffers.id, offer.id));
      await db.update(slotOffers).set({ status: "taken" }).where(and(eq(slotOffers.slotId, slot.id), eq(slotOffers.status, "sent")));
      await db.update(waitlistEntries).set({ status: "booked", bookedAppointmentId: booked.appointment.id }).where(eq(waitlistEntries.id, entry.id));
      await db
        .update(slotRecoveries)
        .set({ status: "filled", filledAppointmentId: booked.appointment.id, filledCustomerId: customerId, filledValueCents: booked.appointment.priceCents, filledBy: "ai", statusNote: "Booked by the AI after the customer accepted", closedAt: now })
        .where(eq(slotRecoveries.id, slot.id));
      await audit(aiCtx, {
        action: "slot.recovered",
        summary: `Recovered slot ${when}: ${booked.service.name} booked for a waitlisted customer`,
        entityType: "slot",
        entityId: slot.id,
        details: { appointmentId: booked.appointment.id, valueCents: booked.appointment.priceCents },
      });
      return `You're booked! ${booked.service.name} on ${when} with ${booked.staffName}. See you then.`;
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      // Someone else got there first (or the time no longer fits) — never claim a booking.
      await db.update(slotOffers).set({ status: "taken", respondedAt: now }).where(eq(slotOffers.id, offer.id));
      return `Sorry — the ${when} slot was just taken. You're still on the waitlist and we'll let you know about the next opening.`;
    }
  }

  // External booking system, or the AI may not book: claim it for this customer and hand to the team.
  const [claimed] = await db
    .update(slotRecoveries)
    .set({ status: "pending_staff", filledCustomerId: customerId, statusNote: "Customer accepted — the team needs to confirm the booking" })
    .where(and(eq(slotRecoveries.id, slot.id), inArray(slotRecoveries.status, ["open", "offering"])))
    .returning();
  if (!claimed) {
    await db.update(slotOffers).set({ status: "taken", respondedAt: now }).where(eq(slotOffers.id, offer.id));
    return `Sorry — the ${when} slot was just taken. You're still on the waitlist and we'll let you know about the next opening.`;
  }
  await db.update(slotOffers).set({ status: "accepted", respondedAt: now }).where(eq(slotOffers.id, offer.id));
  await db.update(slotOffers).set({ status: "taken" }).where(and(eq(slotOffers.slotId, slot.id), eq(slotOffers.status, "sent")));
  return `Thank you! I've passed this to the team to confirm your ${when} appointment — they'll confirm it with you directly.`;
}

// ─── Staff actions ────────────────────────────────────────────────────
/** The team booked an accepted slot (in their own system, or here) — record the outcome. */
export async function confirmSlotBooked(ctx: Ctx, slotId: string, input: { appointmentId?: string | null; valueCents?: number | null } = {}) {
  assertCan(ctx, "appointments.manage");
  const slot = await getSlot(ctx, slotId);
  if (slot.status !== "pending_staff") throw invalid("Only an accepted slot can be confirmed.");
  let value = input.valueCents ?? null;
  if (input.appointmentId) {
    const a = await dbOf(ctx).query.appointments.findFirst({ where: and(eq(appointments.businessId, ctx.businessId), eq(appointments.id, input.appointmentId)) });
    if (!a) throw notFound("Appointment");
    value = a.priceCents;
  }
  if (value == null && slot.serviceId) value = (await dbOf(ctx).query.services.findFirst({ where: eq(services.id, slot.serviceId) }))?.priceCents ?? null;
  const [row] = await dbOf(ctx)
    .update(slotRecoveries)
    .set({ status: "filled", filledBy: "staff", filledAppointmentId: input.appointmentId ?? null, filledValueCents: value, statusNote: "Booked by the team after the customer accepted", closedAt: new Date() })
    .where(and(eq(slotRecoveries.id, slot.id), eq(slotRecoveries.status, "pending_staff")))
    .returning();
  if (slot.filledCustomerId)
    await dbOf(ctx)
      .update(waitlistEntries)
      .set({ status: "booked", bookedAppointmentId: input.appointmentId ?? null })
      .where(and(eq(waitlistEntries.businessId, ctx.businessId), eq(waitlistEntries.customerId, slot.filledCustomerId), eq(waitlistEntries.status, "active")));
  await audit(ctx, { action: "slot.recovered", summary: "Recovered slot confirmed by the team", entityType: "slot", entityId: slot.id, details: { valueCents: value } });
  return row!;
}

export async function dismissSlot(ctx: Ctx, slotId: string) {
  assertCan(ctx, "appointments.manage");
  const [row] = await dbOf(ctx)
    .update(slotRecoveries)
    .set({ status: "dismissed", statusNote: `Dismissed${ctx.actor.type === "user" ? ` by ${ctx.actor.name}` : ""}`, closedAt: new Date() })
    .where(and(eq(slotRecoveries.businessId, ctx.businessId), eq(slotRecoveries.id, slotId), inArray(slotRecoveries.status, ["open", "offering", "pending_staff"])))
    .returning();
  if (!row) throw notFound("Open slot");
  await dbOf(ctx).update(slotOffers).set({ status: "expired" }).where(and(eq(slotOffers.slotId, row.id), eq(slotOffers.status, "sent")));
  return row;
}

/** Someone was booked into a freed slot directly (not through an offer): it's filled, but not credited as recovered. */
export async function onAppointmentBookedForSlots(ctx: Ctx, appt: Appointment) {
  await dbOf(ctx)
    .update(slotRecoveries)
    .set({ status: "filled", filledAppointmentId: appt.id, filledCustomerId: appt.customerId, statusNote: "Booked directly", closedAt: new Date() })
    .where(
      and(
        eq(slotRecoveries.businessId, ctx.businessId),
        eq(slotRecoveries.staffId, appt.staffId),
        inArray(slotRecoveries.status, ["open", "offering"]),
        lt(slotRecoveries.startsAt, appt.endsAt),
        gt(slotRecoveries.endsAt, appt.startsAt),
      ),
    );
}

// ─── Sweep ────────────────────────────────────────────────────────────
/** Expire stale offers and slots; when auto-offer is on, offer open slots to the next candidates. Idempotent. */
export async function sweepSlots(ctx: Ctx, now = new Date()) {
  const db = dbOf(ctx);
  const business = await getBusiness(ctx);
  const settings = await getAiSettings(ctx);
  const cutoff = new Date(now.getTime() + business.minNoticeMinutes * 60_000);
  await db
    .update(slotOffers)
    .set({ status: "expired" })
    .where(and(eq(slotOffers.businessId, ctx.businessId), eq(slotOffers.status, "sent"), lt(slotOffers.expiresAt, now)));
  const expired = await db
    .update(slotRecoveries)
    .set({ status: "expired", statusNote: "The time passed before it was refilled", closedAt: now })
    .where(and(eq(slotRecoveries.businessId, ctx.businessId), inArray(slotRecoveries.status, ["open", "offering"]), lt(slotRecoveries.startsAt, cutoff)))
    .returning({ id: slotRecoveries.id });
  if (expired.length)
    await db.update(slotOffers).set({ status: "expired" }).where(and(inArray(slotOffers.slotId, expired.map((e) => e.id)), eq(slotOffers.status, "sent")));
  // Offering slots whose offers all lapsed go back to open.
  await db.execute(sql`
    update slot_recoveries s set status = 'open', status_note = 'Offers expired without a reply'
    where s.business_id = ${ctx.businessId} and s.status = 'offering'
      and not exists (select 1 from slot_offers o where o.slot_id = s.id and o.status = 'sent')`);
  if (!settings.recovery.slots.enabled || !settings.recovery.slots.autoOffer) return;
  if (!isAllowed(settings.permissions, "send_messages") || !withinMessagingHours(now, business.timezone)) return;
  const open = await db
    .select({ id: slotRecoveries.id })
    .from(slotRecoveries)
    .where(and(eq(slotRecoveries.businessId, ctx.businessId), eq(slotRecoveries.status, "open"), gt(slotRecoveries.startsAt, cutoff)))
    .orderBy(asc(slotRecoveries.startsAt))
    .limit(20);
  const agent = await getAgent(ctx);
  for (const s of open) await offerSlot({ ...ctx, actor: { type: "ai", agentId: agent.id, name: `${agent.name} (AI Receptionist)` } }, s.id, { now }).catch(() => null);
}

export async function listSlots(ctx: Ctx, opts: { open?: boolean; limit?: number } = {}) {
  assertCan(ctx, "appointments.view_all");
  const rows = await dbOf(ctx)
    .select({ slot: slotRecoveries, serviceName: services.name, staffName: staff.name, filledName: customers.name })
    .from(slotRecoveries)
    .leftJoin(services, eq(services.id, slotRecoveries.serviceId))
    .leftJoin(staff, eq(staff.id, slotRecoveries.staffId))
    .leftJoin(customers, eq(customers.id, slotRecoveries.filledCustomerId))
    .where(
      and(
        eq(slotRecoveries.businessId, ctx.businessId),
        opts.open ? inArray(slotRecoveries.status, ["open", "offering", "pending_staff"]) : inArray(slotRecoveries.status, ["filled", "expired", "dismissed"]),
      ),
    )
    .orderBy(opts.open ? asc(slotRecoveries.startsAt) : desc(slotRecoveries.updatedAt))
    .limit(opts.limit ?? 50);
  const offers = rows.length
    ? await dbOf(ctx)
        .select({ offer: slotOffers, name: customers.name, phone: customers.phone })
        .from(slotOffers)
        .innerJoin(customers, eq(customers.id, slotOffers.customerId))
        .where(inArray(slotOffers.slotId, rows.map((r) => r.slot.id)))
        .orderBy(desc(slotOffers.score))
    : [];
  return rows.map((r) => ({ ...r, offers: offers.filter((o) => o.offer.slotId === r.slot.id) }));
}
