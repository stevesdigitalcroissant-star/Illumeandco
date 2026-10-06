/**
 * Availability engine. Computes real bookable slots from:
 *   business hours ∩ staff working hours − staff breaks − blackout dates
 *   − existing appointments (incl. buffer) − minimum notice, within max advance.
 * All wall-clock maths happens in the business's timezone.
 */
import { and, eq, gte, inArray, lt, lte, or, isNull, ne, type SQL } from "drizzle-orm";
import { DateTime } from "luxon";
import { appointments, availability, blackoutDates, businessHours, serviceStaff, services, staff } from "@/db/schema";
import { dbOf, invalid, notFound, type Ctx } from "../context";
import { getBusiness } from "./business";

export type Slot = {
  startsAt: string; // ISO with offset
  endsAt: string;
  staffId: string;
  staffName: string;
  /** Human label in business time, e.g. "Tue 7 Oct, 2:30 PM" */
  label: string;
};

type Interval = [number, number]; // epoch millis [start, end)

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

function subtract(intervals: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const [s, e] of intervals) {
    if (cut[1] <= s || cut[0] >= e) {
      out.push([s, e]);
      continue;
    }
    if (cut[0] > s) out.push([s, cut[0]]);
    if (cut[1] < e) out.push([cut[1], e]);
  }
  return out;
}

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [as, ae] of a)
    for (const [bs, be] of b) {
      const s = Math.max(as, bs);
      const e = Math.min(ae, be);
      if (s < e) out.push([s, e]);
    }
  return out;
}

export function formatSlotLabel(iso: string | Date, timezone: string) {
  const dt = (typeof iso === "string" ? DateTime.fromISO(iso) : DateTime.fromJSDate(iso)).setZone(timezone);
  return dt.toFormat("ccc d LLL, h:mm a");
}

export async function bookableStaffForService(ctx: Ctx, serviceId: string) {
  const db = dbOf(ctx);
  const links = await db
    .select({ staffId: serviceStaff.staffId })
    .from(serviceStaff)
    .where(and(eq(serviceStaff.businessId, ctx.businessId), eq(serviceStaff.serviceId, serviceId)));
  const conds: SQL[] = [eq(staff.businessId, ctx.businessId), eq(staff.active, true)];
  // No explicit assignment → any active staff member can perform it.
  if (links.length) conds.push(inArray(staff.id, links.map((l) => l.staffId)));
  return db.select({ id: staff.id, name: staff.name }).from(staff).where(and(...conds));
}

export type SlotQuery = {
  serviceId: string;
  /** Inclusive local dates (YYYY-MM-DD) in business time. */
  fromDate: string;
  toDate?: string;
  staffId?: string;
  /** Time-of-day window in business time, e.g. afternoon = 12:00–17:00 */
  timeFrom?: string;
  timeTo?: string;
  /** Ignore this appointment when checking conflicts (rescheduling). */
  excludeAppointmentId?: string;
  limit?: number;
  now?: Date;
};

export async function getAvailableSlots(ctx: Ctx, q: SlotQuery): Promise<{ slots: Slot[]; reason?: string }> {
  const db = dbOf(ctx);
  const business = await getBusiness(ctx);
  const tz = business.timezone;
  const service = await db.query.services.findFirst({
    where: and(eq(services.businessId, ctx.businessId), eq(services.id, q.serviceId)),
  });
  if (!service || !service.active) throw notFound("Service");

  const from = DateTime.fromISO(q.fromDate, { zone: tz }).startOf("day");
  const to = DateTime.fromISO(q.toDate ?? q.fromDate, { zone: tz }).startOf("day");
  if (!from.isValid || !to.isValid) throw invalid("Dates must be YYYY-MM-DD.");
  if (to < from) throw invalid("End date is before start date.");
  if (to.diff(from, "days").days > 31) throw invalid("Search at most 31 days at a time.");

  const now = DateTime.fromJSDate(q.now ?? new Date()).setZone(tz);
  const earliest = now.plus({ minutes: business.minNoticeMinutes });
  const latest = now.startOf("day").plus({ days: business.maxAdvanceDays }).endOf("day");

  let staffList = await bookableStaffForService(ctx, service.id);
  if (q.staffId) staffList = staffList.filter((s) => s.id === q.staffId);
  if (!staffList.length)
    return { slots: [], reason: q.staffId ? "That staff member does not perform this service." : "No staff are set up to perform this service yet." };

  const staffIds = staffList.map((s) => s.id);
  // Sequential on purpose: inside a booking transaction these share one connection.
  const hours = await db.select().from(businessHours).where(eq(businessHours.businessId, ctx.businessId));
  const staffAvail = await db.select().from(availability).where(and(eq(availability.businessId, ctx.businessId), inArray(availability.staffId, staffIds)));
  const blackouts = await db
      .select()
      .from(blackoutDates)
      .where(
        and(
          eq(blackoutDates.businessId, ctx.businessId),
          lte(blackoutDates.startDate, to.toISODate()!),
          gte(blackoutDates.endDate, from.toISODate()!),
          or(isNull(blackoutDates.staffId), inArray(blackoutDates.staffId, staffIds)),
        ),
      );
  const existing = await db
      .select({ staffId: appointments.staffId, startsAt: appointments.startsAt, blockedUntil: appointments.blockedUntil })
      .from(appointments)
      .where(
        and(
          eq(appointments.businessId, ctx.businessId),
          inArray(appointments.staffId, staffIds),
          inArray(appointments.status, ["booked", "confirmed"]),
          lt(appointments.startsAt, to.plus({ days: 1 }).toJSDate()),
          gte(appointments.blockedUntil, from.toJSDate()),
          q.excludeAppointmentId ? ne(appointments.id, q.excludeAppointmentId) : undefined,
        ),
      );

  if (!hours.length) return { slots: [], reason: "Opening hours have not been set up yet." };

  const duration = service.durationMinutes * 60_000;
  const buffer = (service.bufferMinutes ?? business.defaultBufferMinutes) * 60_000;
  const step = business.slotIntervalMinutes * 60_000;
  const slots: Slot[] = [];
  const seen = new Set<string>();
  const limit = q.limit ?? 200;

  for (let day = from; day <= to; day = day.plus({ days: 1 })) {
    if (day > latest) break;
    const isoDate = day.toISODate()!;
    const weekday = day.weekday; // 1..7
    const at = (hhmm: string) => day.plus({ minutes: toMinutes(hhmm) }).toMillis();

    if (blackouts.some((b) => !b.staffId && b.startDate <= isoDate && b.endDate >= isoDate)) continue;
    const open: Interval[] = hours.filter((h) => h.weekday === weekday).map((h) => [at(h.openTime), at(h.closeTime)]);
    if (!open.length) continue;

    let window: Interval[] = [[day.toMillis(), day.plus({ days: 1 }).toMillis()]];
    if (q.timeFrom) window = [[at(q.timeFrom), window[0]![1]]];
    if (q.timeTo) window = [[window[0]![0], at(q.timeTo)]];

    for (const member of staffList) {
      if (blackouts.some((b) => b.staffId === member.id && b.startDate <= isoDate && b.endDate >= isoDate)) continue;
      const rows = staffAvail.filter((a) => a.staffId === member.id);
      const hasOwnSchedule = rows.some((r) => r.kind === "work");
      let free: Interval[] = hasOwnSchedule
        ? intersect(
            open,
            rows.filter((r) => r.kind === "work" && r.weekday === weekday).map((r) => [at(r.startTime), at(r.endTime)] as Interval),
          )
        : open;
      for (const br of rows.filter((r) => r.kind === "break" && r.weekday === weekday))
        free = subtract(free, [at(br.startTime), at(br.endTime)]);
      free = intersect(free, window);

      const busy = existing.filter((e) => e.staffId === member.id).map((e) => [e.startsAt.getTime(), e.blockedUntil.getTime()] as Interval);

      for (const [s, e] of free) {
        // Align to the slot grid from midnight so times look natural (9:00, 9:15…).
        let t = day.toMillis() + Math.ceil((s - day.toMillis()) / step) * step;
        for (; t + duration <= e; t += step) {
          if (t < earliest.toMillis() || t > latest.toMillis()) continue;
          const candidate: Interval = [t, t + duration + buffer];
          if (busy.some(([bs, be]) => candidate[0] < be && bs < candidate[1])) continue;
          const startIso = DateTime.fromMillis(t, { zone: tz }).toISO()!;
          const key = q.staffId ? `${startIso}|${member.id}` : startIso;
          if (seen.has(key)) continue; // one entry per time unless a specific staff member was requested
          seen.add(key);
          slots.push({
            startsAt: startIso,
            endsAt: DateTime.fromMillis(t + duration, { zone: tz }).toISO()!,
            staffId: member.id,
            staffName: member.name,
            label: formatSlotLabel(startIso, tz),
          });
        }
      }
    }
  }
  slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { slots: slots.slice(0, limit), reason: slots.length ? undefined : "No availability in that period." };
}

/** Check one exact start time; returns the slot (with an assigned staff member) or null. */
export async function findSlot(
  ctx: Ctx,
  input: { serviceId: string; startsAt: Date; staffId?: string; excludeAppointmentId?: string; now?: Date },
) {
  const business = await getBusiness(ctx);
  const local = DateTime.fromJSDate(input.startsAt).setZone(business.timezone);
  // Check each eligible staff member at that exact time; the first free one takes it.
  const candidates = input.staffId
    ? [{ id: input.staffId }]
    : await bookableStaffForService(ctx, input.serviceId);
  for (const member of candidates) {
    const { slots } = await getAvailableSlots(ctx, {
      serviceId: input.serviceId,
      fromDate: local.toISODate()!,
      staffId: member.id,
      excludeAppointmentId: input.excludeAppointmentId,
      now: input.now,
    });
    const hit = slots.find((s) => new Date(s.startsAt).getTime() === input.startsAt.getTime());
    if (hit) return hit;
  }
  return null;
}
