import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointmentReminders, auditLogs, leads } from "@/db/schema";
import type { Ctx } from "@/server/context";
import { bookAppointment, cancelAppointment, listAppointments, rescheduleAppointment, setAppointmentOutcome } from "@/server/services/appointments";
import { getAvailableSlots } from "@/server/services/availability";
import { addBlackout, createStaff, setStaffAvailability, updateService } from "@/server/services/catalog";
import { createCustomer } from "@/server/services/customers";
import { upsertLead } from "@/server/services/leads";
import { updateBusiness } from "@/server/services/business";
import { at, createClinic, localDate } from "./helpers";

describe("availability", () => {
  it("returns slots only inside opening hours, on the slot grid", async () => {
    const c = await createClinic();
    const { slots } = await getAvailableSlots(c.ctx, { serviceId: c.services.whitening.id, fromDate: localDate(1) });
    expect(slots.length).toBeGreaterThan(0);
    const times = slots.map((s) => s.startsAt.slice(11, 16));
    expect(times[0]).toBe("09:00");
    expect(times.at(-1)).toBe("17:00"); // 60-minute service must end by 18:00
    expect(times.every((t) => /:(00|15|30|45)$/.test(t))).toBe(true);
  });

  it("respects blackout dates, staff breaks, buffers and minimum notice", async () => {
    const c = await createClinic();
    await addBlackout(c.ctx, { startDate: localDate(2), endDate: localDate(2), reason: "Holiday" });
    expect((await getAvailableSlots(c.ctx, { serviceId: c.services.whitening.id, fromDate: localDate(2) })).slots).toEqual([]);

    // Whitening is only done by Dr. Amira; give her a lunch break.
    const weekday = new Date(at("12:00", 3)).getUTCDay() || 7;
    await setStaffAvailability(c.ctx, c.staff.amira.id, [
      ...[1, 2, 3, 4, 5, 6, 7].map((d) => ({ kind: "work" as const, weekday: d, startTime: "09:00", endTime: "18:00" })),
      { kind: "break", weekday, startTime: "13:00", endTime: "14:00" },
    ]);
    const day3 = (await getAvailableSlots(c.ctx, { serviceId: c.services.whitening.id, fromDate: localDate(3) })).slots.map((s) => s.startsAt.slice(11, 16));
    expect(day3).not.toContain("12:30"); // would overlap the break
    expect(day3).not.toContain("13:00");
    expect(day3).toContain("14:00");

    // Buffer: 15 minutes after each whitening
    await updateService(c.ctx, c.services.whitening.id, { bufferMinutes: 15 });
    const { customer } = await createCustomer(c.ctx, { name: "Buffy", phone: "+971501111111" });
    await bookAppointment(c.ctx, { serviceId: c.services.whitening.id, startsAt: at("10:00", 4), customerId: customer.id, source: "staff" });
    const day4 = (await getAvailableSlots(c.ctx, { serviceId: c.services.whitening.id, fromDate: localDate(4) })).slots.map((s) => s.startsAt.slice(11, 16));
    expect(day4).not.toContain("11:00"); // 10:00–11:00 + 15 min buffer
    expect(day4).toContain("11:15");

    // Minimum notice: nothing within the next 60 minutes today
    await updateBusiness(c.ctx, { minNoticeMinutes: 24 * 60 });
    const today = (await getAvailableSlots(c.ctx, { serviceId: c.services.consultation.id, fromDate: localDate(0) })).slots;
    expect(today).toEqual([]);
  });
});

describe("booking", () => {
  it("books, updates the lead, queues reminders and writes the audit log", async () => {
    const c = await createClinic();
    const { customer } = await createCustomer(c.ctx, { name: "Sarah Johnson", email: "sarah@example.com" });
    const { lead } = await upsertLead(c.ctx, { customerId: customer.id, source: "web_chat", serviceId: c.services.consultation.id });
    const r = await bookAppointment(c.ctx, { serviceId: c.services.consultation.id, startsAt: at("14:30", 2), customerId: customer.id, source: "staff" });
    expect(r.appointment.status).toBe("booked");
    expect(r.appointment.priceCents).toBe(25000);

    const updatedLead = await db.query.leads.findFirst({ where: eq(leads.id, lead.id) });
    expect(updatedLead?.status).toBe("appointment_booked");
    expect(updatedLead?.appointmentId).toBe(r.appointment.id);

    const reminders = await db.select().from(appointmentReminders).where(eq(appointmentReminders.appointmentId, r.appointment.id));
    expect(reminders.map((x) => x.kind).sort()).toEqual(["confirmation", "reminder_24h", "same_day"]);

    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, r.appointment.id), eq(auditLogs.action, "appointment.booked")));
    expect(log?.summary).toContain("Dental consultation");
    expect(log?.summary).toContain("Sarah Johnson");
    expect(log?.details).toMatchObject({ customer: "Sarah Johnson", service: "Dental consultation", time: "14:30" });
  });

  it("prevents double booking, including concurrent attempts", async () => {
    const c = await createClinic();
    const { customer: c1 } = await createCustomer(c.ctx, { name: "One", phone: "+971500000011" });
    const { customer: c2 } = await createCustomer(c.ctx, { name: "Two", phone: "+971500000012" });
    const { customer: c3 } = await createCustomer(c.ctx, { name: "Three", phone: "+971500000013" });
    const startsAt = at("15:00", 2);
    const w = c.services.whitening.id; // only one dentist performs whitening
    await bookAppointment(c.ctx, { serviceId: w, startsAt, customerId: c1.id, source: "staff" });
    await expect(bookAppointment(c.ctx, { serviceId: w, startsAt, customerId: c2.id, source: "staff" })).rejects.toThrow(/not available|just taken/);
    // Overlapping (15:30 inside 15:00–16:00) is also rejected
    await expect(bookAppointment(c.ctx, { serviceId: w, startsAt: at("15:30", 2), customerId: c2.id, source: "staff" })).rejects.toThrow();

    // Race: two simultaneous bookings for the same free slot → exactly one wins.
    const slot = at("10:00", 5);
    const results = await Promise.allSettled([
      bookAppointment(c.ctx, { serviceId: w, startsAt: slot, customerId: c2.id, source: "staff" }),
      bookAppointment(c.ctx, { serviceId: w, startsAt: slot, customerId: c3.id, source: "staff" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("rejects bookings outside opening hours and for services not bookable online", async () => {
    const c = await createClinic();
    const { customer } = await createCustomer(c.ctx, { name: "Late", phone: "+971500000021" });
    await expect(bookAppointment(c.ctx, { serviceId: c.services.consultation.id, startsAt: at("19:00", 2), customerId: customer.id, source: "staff" })).rejects.toThrow(/not available/);
    await expect(bookAppointment(c.ctx, { serviceId: c.services.consultation.id, startsAt: at("17:45", 2), customerId: customer.id, source: "staff" })).rejects.toThrow(/not available/);
    await updateService(c.ctx, c.services.cleaning.id, { onlineBookingEnabled: false });
    await expect(bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("10:00", 2), customerId: customer.id, source: "ai" })).rejects.toThrow(/can't be booked online/);
  });

  it("assigns another qualified staff member when the first is busy", async () => {
    const c = await createClinic();
    const { customer: a } = await createCustomer(c.ctx, { name: "A", phone: "+971500000031" });
    const { customer: b } = await createCustomer(c.ctx, { name: "B", phone: "+971500000032" });
    const r1 = await bookAppointment(c.ctx, { serviceId: c.services.consultation.id, startsAt: at("11:00", 2), customerId: a.id, source: "staff" });
    const r2 = await bookAppointment(c.ctx, { serviceId: c.services.consultation.id, startsAt: at("11:00", 2), customerId: b.id, source: "staff" });
    expect(r1.appointment.staffId).not.toBe(r2.appointment.staffId);
  });

  it("reschedules (freeing the old time) and cancels (freeing the slot)", async () => {
    const c = await createClinic();
    const { customer } = await createCustomer(c.ctx, { name: "Res", phone: "+971500000041" });
    const { customer: other } = await createCustomer(c.ctx, { name: "Other", phone: "+971500000042" });
    const w = c.services.whitening.id;
    const r = await bookAppointment(c.ctx, { serviceId: w, startsAt: at("14:00", 2), customerId: customer.id, source: "staff" });
    const moved = await rescheduleAppointment(c.ctx, r.appointment.id, { startsAt: at("15:00", 2) });
    expect(moved.appointment.id).toBe(r.appointment.id);
    expect(moved.appointment.startsAt.toISOString()).toBe(at("15:00", 2).toISOString());
    // Old slot is free again
    await bookAppointment(c.ctx, { serviceId: w, startsAt: at("14:00", 2), customerId: other.id, source: "staff" });
    // Rescheduling into a taken slot fails and leaves the appointment untouched
    await expect(rescheduleAppointment(c.ctx, r.appointment.id, { startsAt: at("14:00", 2) })).rejects.toThrow(/not available/);

    await cancelAppointment(c.ctx, r.appointment.id, "Customer request");
    await expect(cancelAppointment(c.ctx, r.appointment.id)).rejects.toThrow(/already cancelled/);
    await expect(rescheduleAppointment(c.ctx, r.appointment.id, { startsAt: at("16:00", 2) })).rejects.toThrow(/can't be rescheduled/);
    // 15:00 freed by the cancellation
    await bookAppointment(c.ctx, { serviceId: w, startsAt: at("15:00", 2), customerId: other.id, source: "staff" });

    const actions = (await db.select().from(auditLogs).where(eq(auditLogs.entityId, r.appointment.id))).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["appointment.booked", "appointment.rescheduled", "appointment.cancelled"]));
    const reminders = await db.select().from(appointmentReminders).where(eq(appointmentReminders.appointmentId, r.appointment.id));
    expect(reminders.every((x) => x.status === "cancelled")).toBe(true);
  });

  it("restricts staff users to their own appointments", async () => {
    const c = await createClinic();
    const { signUp } = await import("@/server/auth");
    const { user } = await signUp({ name: "Omar", email: `omar-${Date.now()}@test.dev`, password: "a-long-password" });
    const { updateStaff } = await import("@/server/services/catalog");
    await updateStaff(c.ctx, c.staff.omar.id, { userId: user.id });
    const staffCtx: Ctx = { businessId: c.business.id, actor: { type: "user", userId: user.id, name: "Omar", role: "staff" } };
    const { customer } = await createCustomer(c.ctx, { name: "P", phone: "+971500000051" });
    const amiraAppt = await bookAppointment(c.ctx, { serviceId: c.services.whitening.id, startsAt: at("10:00", 2), customerId: customer.id, source: "staff" });
    await expect(cancelAppointment(staffCtx, amiraAppt.appointment.id)).rejects.toThrow(/own appointments/);
    const omarAppt = await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("10:00", 2), customerId: customer.id, source: "staff" });
    expect((await listAppointments(staffCtx)).map((a) => a.appointment.id)).toEqual([omarAppt.appointment.id]);
    await setAppointmentOutcome(staffCtx, omarAppt.appointment.id, "completed");
    const newStaff = await createStaff(c.ctx, { name: "Temp" });
    expect(newStaff.id).toBeTruthy();
    await expect(createStaff(staffCtx, { name: "Nope" })).rejects.toThrow(/permission/);
  });
});
