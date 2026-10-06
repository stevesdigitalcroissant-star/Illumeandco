/** Appointment confirmation + 24h + same-day reminders. */
import { and, eq, inArray, lte } from "drizzle-orm";
import { DateTime } from "luxon";
import { appointmentReminders, appointments, customers, services } from "@/db/schema";
import { audit } from "../audit";
import { dbOf, type Ctx } from "../context";
import { getAiSettings, getBusiness } from "./business";
import { deliverToCustomer, renderTemplate } from "./messaging";

type Appointment = typeof appointments.$inferSelect;

export async function cancelReminders(ctx: Ctx, appointmentId: string, reason: string) {
  await dbOf(ctx)
    .update(appointmentReminders)
    .set({ status: "cancelled", statusReason: reason })
    .where(
      and(
        eq(appointmentReminders.businessId, ctx.businessId),
        eq(appointmentReminders.appointmentId, appointmentId),
        eq(appointmentReminders.status, "scheduled"),
      ),
    );
}

/**
 * Queue reminders for an appointment. `includeConfirmation` is false when the
 * customer already received the confirmation in the conversation that booked it.
 */
export async function scheduleReminders(ctx: Ctx, appt: Appointment, opts: { includeConfirmation: boolean; now?: Date }) {
  const settings = await getAiSettings(ctx);
  const now = opts.now ?? new Date();
  const rows: (typeof appointmentReminders.$inferInsert)[] = [];
  const r = settings.reminders;
  if (r.confirmation && opts.includeConfirmation)
    rows.push({ businessId: ctx.businessId, appointmentId: appt.id, kind: "confirmation", scheduledFor: now });
  const t24 = new Date(appt.startsAt.getTime() - 24 * 3600_000);
  if (r.reminder24h && t24 > now)
    rows.push({ businessId: ctx.businessId, appointmentId: appt.id, kind: "reminder_24h", scheduledFor: t24 });
  const tSame = new Date(appt.startsAt.getTime() - r.sameDayHoursBefore * 3600_000);
  if (r.sameDay && tSame > now && tSame > t24)
    rows.push({ businessId: ctx.businessId, appointmentId: appt.id, kind: "same_day", scheduledFor: tSame });
  if (rows.length) await dbOf(ctx).insert(appointmentReminders).values(rows);
  return rows.length;
}

export async function dueReminders(now = new Date(), limit = 100) {
  const { db } = await import("@/db");
  return db
    .select()
    .from(appointmentReminders)
    .where(and(eq(appointmentReminders.status, "scheduled"), lte(appointmentReminders.scheduledFor, now)))
    .limit(limit);
}

export async function processReminder(ctx: Ctx, reminder: typeof appointmentReminders.$inferSelect) {
  const db = dbOf(ctx);
  const [row] = await db
    .select({ appt: appointments, customer: customers, serviceName: services.name })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(and(eq(appointments.businessId, ctx.businessId), eq(appointments.id, reminder.appointmentId)));
  const finish = async (status: "sent" | "skipped" | "failed" | "cancelled", reason: string) =>
    db
      .update(appointmentReminders)
      .set({ status, statusReason: reason, sentAt: status === "sent" ? new Date() : null })
      .where(eq(appointmentReminders.id, reminder.id));

  if (!row || !["booked", "confirmed"].includes(row.appt.status)) return finish("cancelled", "Appointment no longer active");
  if (row.appt.startsAt < new Date()) return finish("skipped", "Appointment already started");

  const business = await getBusiness(ctx);
  const settings = await getAiSettings(ctx);
  const local = DateTime.fromJSDate(row.appt.startsAt).setZone(business.timezone);
  const text = renderTemplate(settings.reminders.templates[reminder.kind], {
    customer_name: row.customer.name?.split(" ")[0] ?? "there",
    service: row.serviceName,
    business: business.name,
    date: local.toFormat("cccc d LLLL"),
    time: local.toFormat("h:mm a"),
  });
  const delivery = await deliverToCustomer(ctx, {
    customerId: row.customer.id,
    text,
    subject: reminder.kind === "confirmation" ? "Appointment confirmed" : "Appointment reminder",
    metadata: { reminderId: reminder.id, kind: reminder.kind },
  });
  if (!delivery.ok) return finish("failed", delivery.detail);
  await finish("sent", `${delivery.channel}: ${delivery.status}`);
  await audit(ctx, {
    action: "reminder.sent",
    summary: `${reminder.kind.replace("_", " ")} reminder sent to ${row.customer.name ?? "customer"} via ${delivery.channel?.replace("_", " ")}`,
    entityType: "appointment",
    entityId: row.appt.id,
    details: { channel: delivery.channel, status: delivery.status },
  });
}

export async function listRemindersForAppointments(ctx: Ctx, appointmentIds: string[]) {
  if (!appointmentIds.length) return [];
  return dbOf(ctx)
    .select()
    .from(appointmentReminders)
    .where(and(eq(appointmentReminders.businessId, ctx.businessId), inArray(appointmentReminders.appointmentId, appointmentIds)));
}
