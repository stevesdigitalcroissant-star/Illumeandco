/**
 * Appointments. Booking is validated against real availability and is
 * protected by a database exclusion constraint, so two concurrent bookings
 * for the same staff member and time can never both succeed.
 *
 * Booking side effects (same transaction):
 *   appointment row → lead moved to "appointment booked" → pending follow-ups
 *   stopped → reminders queued → conversation timeline event → audit log
 */
import { and, asc, desc, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
import { DateTime } from "luxon";
import { db as rootDb, type Tx } from "@/db";
import { appointments, customers, leads, services, staff } from "@/db/schema";
import { audit } from "../audit";
import { AppError, assertCan, conflict, dbOf, forbidden, invalid, isRestrictedStaff, notFound, type Ctx } from "../context";
import { findSlot, formatSlotLabel } from "./availability";
import { getBusiness } from "./business";
import { addEvent } from "./conversations";
import { cancelPendingFollowUps } from "./followups";
import { cancelReminders, scheduleReminders } from "./reminders";
import { scheduleReviewRequest } from "./reviews";
import { onAppointmentBooked, onAppointmentLost, safely } from "../opportunities/engine";

export type Appointment = typeof appointments.$inferSelect;
type Source = Appointment["source"];

const ACTIVE = ["booked", "confirmed"] as const;

function isExclusionViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23P01" || err?.cause?.code === "23P01";
}

async function inTx<T>(ctx: Ctx, fn: (ctx: Ctx) => Promise<T>) {
  if (ctx.tx) return fn(ctx);
  return rootDb.transaction((tx: Tx) => fn({ ...ctx, tx }));
}

export async function getAppointment(ctx: Ctx, id: string) {
  const a = await dbOf(ctx).query.appointments.findFirst({
    where: and(eq(appointments.businessId, ctx.businessId), eq(appointments.id, id)),
  });
  if (!a) throw notFound("Appointment");
  return a;
}

/** Staff may only act on their own appointments. */
async function assertMayManage(ctx: Ctx, appt: Pick<Appointment, "staffId">) {
  if (ctx.actor.type === "user") assertCan(ctx, "appointments.manage");
  if (isRestrictedStaff(ctx)) {
    const s = await dbOf(ctx).query.staff.findFirst({ where: and(eq(staff.businessId, ctx.businessId), eq(staff.id, appt.staffId)) });
    if (s?.userId !== ctx.actor.userId) throw forbidden("Staff can only manage their own appointments.");
  }
}

export type BookInput = {
  serviceId: string;
  startsAt: Date;
  customerId: string;
  staffId?: string;
  source: Source;
  conversationId?: string | null;
  notes?: string | null;
  now?: Date;
};

export async function bookAppointment(ctx: Ctx, input: BookInput) {
  if (Number.isNaN(input.startsAt.getTime())) throw invalid("Invalid appointment time.");
  return inTx(ctx, async (ctx) => {
    const db = dbOf(ctx);
    const service = await db.query.services.findFirst({
      where: and(eq(services.businessId, ctx.businessId), eq(services.id, input.serviceId)),
    });
    if (!service || !service.active) throw notFound("Service");
    if (input.source !== "staff" && !service.onlineBookingEnabled)
      throw new AppError("unavailable", `${service.name} can't be booked online — the team books it directly.`);
    const customer = await db.query.customers.findFirst({
      where: and(eq(customers.businessId, ctx.businessId), eq(customers.id, input.customerId)),
    });
    if (!customer) throw notFound("Customer");

    const slot = await findSlot(ctx, { serviceId: service.id, startsAt: input.startsAt, staffId: input.staffId, now: input.now });
    if (!slot) throw conflict("That time is not available.");
    if (isRestrictedStaff(ctx)) await assertMayManage(ctx, { staffId: slot.staffId });

    const business = await getBusiness(ctx);
    const buffer = (service.bufferMinutes ?? business.defaultBufferMinutes) * 60_000;
    const startsAt = new Date(slot.startsAt);
    const endsAt = new Date(slot.endsAt);

    let appt: Appointment;
    try {
      // Savepoint so an exclusion violation does not poison an outer transaction.
      appt = await (db as Tx).transaction(async (sp) => {
        const [row] = await sp
          .insert(appointments)
          .values({
            businessId: ctx.businessId,
            customerId: customer.id,
            serviceId: service.id,
            staffId: slot.staffId,
            startsAt,
            endsAt,
            blockedUntil: new Date(endsAt.getTime() + buffer),
            source: input.source,
            bookedByUserId: ctx.actor.type === "user" ? ctx.actor.userId : null,
            conversationId: input.conversationId ?? null,
            priceCents: service.priceCents,
            notes: input.notes ?? null,
          })
          .returning();
        return row!;
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw conflict("Sorry — that time was just taken.");
      throw e;
    }

    // Lead → appointment booked
    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.businessId, ctx.businessId), eq(leads.customerId, customer.id), inArray(leads.status, ["new", "contacted", "qualified"])))
      .orderBy(desc(leads.createdAt))
      .limit(1);
    if (lead) {
      await db
        .update(leads)
        .set({ status: "appointment_booked", appointmentId: appt.id, serviceId: lead.serviceId ?? service.id, lastContactAt: new Date(), nextFollowUpAt: null })
        .where(eq(leads.id, lead.id));
      await db.update(appointments).set({ leadId: lead.id }).where(eq(appointments.id, appt.id));
      appt.leadId = lead.id;
    }
    await cancelPendingFollowUps(ctx, customer.id, "Appointment booked");
    // The booking conversation itself confirms to the customer; send a separate confirmation otherwise.
    await scheduleReminders(ctx, appt, { includeConfirmation: !input.conversationId, now: input.now });
    // The lead converted (and any cancellation/no-show for this customer is won back).
    await safely(ctx, "booked", (c) => onAppointmentBooked(c, appt));

    const label = formatSlotLabel(startsAt, business.timezone);
    if (input.conversationId)
      await addEvent(ctx, input.conversationId, `Appointment booked: ${service.name} with ${slot.staffName}, ${label}`, {
        kind: "appointment_booked",
        appointmentId: appt.id,
      });
    await audit(ctx, {
      action: "appointment.booked",
      summary: `Booked ${service.name} for ${customer.name ?? "customer"} — ${label} with ${slot.staffName}`,
      entityType: "appointment",
      entityId: appt.id,
      details: {
        customer: customer.name,
        customerId: customer.id,
        service: service.name,
        staff: slot.staffName,
        date: DateTime.fromJSDate(startsAt).setZone(business.timezone).toISODate(),
        time: DateTime.fromJSDate(startsAt).setZone(business.timezone).toFormat("HH:mm"),
        startsAt: startsAt.toISOString(),
        source: input.source,
      },
    });
    return { appointment: appt, service, staffName: slot.staffName, label };
  });
}

export async function rescheduleAppointment(
  ctx: Ctx,
  appointmentId: string,
  input: { startsAt: Date; staffId?: string; now?: Date },
) {
  if (Number.isNaN(input.startsAt.getTime())) throw invalid("Invalid appointment time.");
  return inTx(ctx, async (ctx) => {
    const db = dbOf(ctx);
    const appt = await getAppointment(ctx, appointmentId);
    await assertMayManage(ctx, appt);
    if (!ACTIVE.includes(appt.status as (typeof ACTIVE)[number])) throw invalid(`A ${appt.status} appointment can't be rescheduled.`);
    const service = await db.query.services.findFirst({ where: eq(services.id, appt.serviceId) });
    if (!service) throw notFound("Service");
    const query = { serviceId: appt.serviceId, startsAt: input.startsAt, excludeAppointmentId: appt.id, now: input.now };
    // Keep the same staff member when possible; otherwise any free staff member (unless one was requested).
    const slot =
      (await findSlot(ctx, { ...query, staffId: input.staffId ?? appt.staffId })) ??
      (input.staffId ? null : await findSlot(ctx, query));
    if (!slot) throw conflict("That new time is not available.");
    const business = await getBusiness(ctx);
    const buffer = (service.bufferMinutes ?? business.defaultBufferMinutes) * 60_000;
    const startsAt = new Date(slot.startsAt);
    const endsAt = new Date(slot.endsAt);
    let updated: Appointment;
    try {
      updated = await (db as Tx).transaction(async (sp) => {
        const [row] = await sp
          .update(appointments)
          .set({ startsAt, endsAt, blockedUntil: new Date(endsAt.getTime() + buffer), staffId: slot.staffId })
          .where(eq(appointments.id, appt.id))
          .returning();
        return row!;
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw conflict("Sorry — that time was just taken.");
      throw e;
    }
    await safely(ctx, "rescheduled", async (c) => (await import("../recovery/slots")).onSlotFreed(c, appt, "reschedule"));
    await cancelReminders(ctx, appt.id, "Appointment rescheduled");
    await scheduleReminders(ctx, updated, { includeConfirmation: !appt.conversationId, now: input.now });
    const customer = await db.query.customers.findFirst({ where: eq(customers.id, appt.customerId) });
    const from = formatSlotLabel(appt.startsAt, business.timezone);
    const to = formatSlotLabel(startsAt, business.timezone);
    if (appt.conversationId)
      await addEvent(ctx, appt.conversationId, `Appointment rescheduled: ${service.name} moved from ${from} to ${to}`, {
        kind: "appointment_rescheduled",
        appointmentId: appt.id,
      });
    await audit(ctx, {
      action: "appointment.rescheduled",
      summary: `Rescheduled ${service.name} for ${customer?.name ?? "customer"} from ${from} to ${to}`,
      entityType: "appointment",
      entityId: appt.id,
      details: {
        customer: customer?.name,
        service: service.name,
        from: appt.startsAt.toISOString(),
        to: startsAt.toISOString(),
        time: DateTime.fromJSDate(startsAt).setZone(business.timezone).toFormat("HH:mm"),
        staff: slot.staffName,
      },
    });
    return { appointment: updated, service, staffName: slot.staffName, label: to, previousLabel: from };
  });
}

export async function cancelAppointment(ctx: Ctx, appointmentId: string, reason?: string) {
  return inTx(ctx, async (ctx) => {
    const db = dbOf(ctx);
    const appt = await getAppointment(ctx, appointmentId);
    await assertMayManage(ctx, appt);
    if (!ACTIVE.includes(appt.status as (typeof ACTIVE)[number])) throw invalid(`This appointment is already ${appt.status}.`);
    const [updated] = await db
      .update(appointments)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason?.slice(0, 500) ?? null })
      .where(eq(appointments.id, appt.id))
      .returning();
    await cancelReminders(ctx, appt.id, "Appointment cancelled");
    await safely(ctx, "cancelled", (c) => onAppointmentLost(c, updated!, "cancellation"));
    await safely(ctx, "slot freed", async (c) => (await import("../recovery/slots")).onSlotFreed(c, appt, "cancellation"));
    if (appt.leadId)
      await db.update(leads).set({ status: "qualified", appointmentId: null }).where(and(eq(leads.id, appt.leadId), eq(leads.status, "appointment_booked")));
    const business = await getBusiness(ctx);
    const service = await db.query.services.findFirst({ where: eq(services.id, appt.serviceId) });
    const customer = await db.query.customers.findFirst({ where: eq(customers.id, appt.customerId) });
    const label = formatSlotLabel(appt.startsAt, business.timezone);
    if (appt.conversationId)
      await addEvent(ctx, appt.conversationId, `Appointment cancelled: ${service?.name} on ${label}${reason ? ` (${reason})` : ""}`, {
        kind: "appointment_cancelled",
        appointmentId: appt.id,
      });
    await audit(ctx, {
      action: "appointment.cancelled",
      summary: `Cancelled ${service?.name} for ${customer?.name ?? "customer"} on ${label}${reason ? ` — ${reason}` : ""}`,
      entityType: "appointment",
      entityId: appt.id,
      details: { customer: customer?.name, service: service?.name, startsAt: appt.startsAt.toISOString(), reason: reason ?? null },
    });
    return { appointment: updated!, label, serviceName: service?.name ?? "appointment" };
  });
}

export async function setAppointmentOutcome(ctx: Ctx, appointmentId: string, outcome: "completed" | "no_show" | "confirmed") {
  return inTx(ctx, async (ctx) => {
    const db = dbOf(ctx);
    const appt = await getAppointment(ctx, appointmentId);
    await assertMayManage(ctx, appt);
    if (!ACTIVE.includes(appt.status as (typeof ACTIVE)[number])) throw invalid(`This appointment is already ${appt.status}.`);
    const [updated] = await db
      .update(appointments)
      .set({ status: outcome, completedAt: outcome === "completed" ? new Date() : null })
      .where(eq(appointments.id, appt.id))
      .returning();
    if (outcome === "completed") {
      if (appt.leadId) await db.update(leads).set({ status: "completed" }).where(eq(leads.id, appt.leadId));
      await scheduleReviewRequest(ctx, appt.id);
    }
    if (outcome !== "confirmed") await cancelReminders(ctx, appt.id, `Appointment ${outcome.replace("_", " ")}`);
    if (outcome === "no_show") await safely(ctx, "no-show", (c) => onAppointmentLost(c, updated!, "no_show"));
    const service = await db.query.services.findFirst({ where: eq(services.id, appt.serviceId) });
    const customer = await db.query.customers.findFirst({ where: eq(customers.id, appt.customerId) });
    if (outcome !== "confirmed")
      await audit(ctx, {
        action: outcome === "completed" ? "appointment.completed" : "appointment.no_show",
        summary: `${service?.name} for ${customer?.name ?? "customer"} marked ${outcome.replace("_", " ")}`,
        entityType: "appointment",
        entityId: appt.id,
      });
    return updated!;
  });
}

export async function listAppointments(
  ctx: Ctx,
  opts: { from?: Date; to?: Date; staffId?: string; status?: Appointment["status"][]; customerId?: string; limit?: number } = {},
) {
  const conds: (SQL | undefined)[] = [eq(appointments.businessId, ctx.businessId)];
  if (opts.from) conds.push(gte(appointments.startsAt, opts.from));
  if (opts.to) conds.push(lt(appointments.startsAt, opts.to));
  if (opts.staffId) conds.push(eq(appointments.staffId, opts.staffId));
  if (opts.status?.length) conds.push(inArray(appointments.status, opts.status));
  if (opts.customerId) conds.push(eq(appointments.customerId, opts.customerId));
  if (isRestrictedStaff(ctx)) conds.push(eq(staff.userId, ctx.actor.userId));
  return dbOf(ctx)
    .select({
      appointment: appointments,
      customer: { id: customers.id, name: customers.name, phone: customers.phone, email: customers.email },
      service: { id: services.id, name: services.name, durationMinutes: services.durationMinutes },
      staff: { id: staff.id, name: staff.name },
    })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(staff, eq(staff.id, appointments.staffId))
    .where(and(...conds))
    .orderBy(asc(appointments.startsAt))
    .limit(opts.limit ?? 500);
}

/** Customer-facing: the customer's upcoming appointments (used by the AI). */
export async function upcomingForCustomer(ctx: Ctx, customerId: string, now = new Date()) {
  return listAppointments(ctx, { customerId, from: now, status: ["booked", "confirmed"], limit: 10 });
}
