"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/action";
import { requireBusiness } from "@/lib/session";
import { invalid } from "@/server/context";
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  setAppointmentOutcome,
} from "@/server/services/appointments";
import { getAvailableSlots, type Slot } from "@/server/services/availability";
import { createCustomer, listCustomers } from "@/server/services/customers";

function revalidateAll() {
  revalidatePath("/app/appointments");
  revalidatePath("/app/calendar");
  revalidatePath("/app/customers", "layout");
  revalidatePath("/app");
}

/** Real bookable slots for one local date (YYYY-MM-DD, business time). */
export async function getSlotsAction(input: { serviceId: string; date: string; staffId?: string | null; excludeAppointmentId?: string | null }) {
  const { ctx } = await requireBusiness();
  return run<{ slots: Slot[]; reason?: string }>(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw invalid("Pick a date.");
    if (!input.serviceId) throw invalid("Pick a service first.");
    return getAvailableSlots(ctx, {
      serviceId: input.serviceId,
      fromDate: input.date,
      staffId: input.staffId || undefined,
      excludeAppointmentId: input.excludeAppointmentId || undefined,
    });
  });
}

export type CustomerHit = { id: string; name: string | null; phone: string | null; email: string | null };

export async function searchCustomersAction(q: string) {
  const { ctx } = await requireBusiness();
  return run<CustomerHit[]>(async () => {
    const rows = await listCustomers(ctx, { search: q.slice(0, 100), limit: 8 });
    return rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email }));
  });
}

export async function bookAppointmentAction(input: {
  serviceId: string;
  startsAt: string;
  staffId: string;
  customerId?: string | null;
  newCustomer?: { name: string; phone?: string; email?: string } | null;
  notes?: string | null;
}) {
  const { ctx } = await requireBusiness();
  const res = await run(async () => {
    let customerId = input.customerId ?? null;
    if (!customerId) {
      const nc = input.newCustomer;
      if (!nc?.name?.trim()) throw invalid("Enter the customer's name.");
      if (!nc.phone?.trim() && !nc.email?.trim()) throw invalid("Add a phone number or email so the customer can get reminders.");
      const { customer } = await createCustomer(ctx, {
        name: nc.name,
        phone: nc.phone?.trim() || null,
        email: nc.email?.trim() || null,
        source: "manual",
      });
      customerId = customer.id;
    }
    const r = await bookAppointment(ctx, {
      serviceId: input.serviceId,
      startsAt: new Date(input.startsAt),
      staffId: input.staffId,
      customerId,
      source: "staff",
      notes: input.notes?.trim() || null,
    });
    return { id: r.appointment.id, label: r.label, staffName: r.staffName, serviceName: r.service.name, customerId };
  });
  if (res.ok) revalidateAll();
  return res;
}

export async function rescheduleAppointmentAction(id: string, startsAt: string, staffId?: string | null) {
  const { ctx } = await requireBusiness();
  const res = await run(async () => {
    const r = await rescheduleAppointment(ctx, id, { startsAt: new Date(startsAt), staffId: staffId || undefined });
    return { label: r.label, previousLabel: r.previousLabel, staffName: r.staffName };
  });
  if (res.ok) revalidateAll();
  return res;
}

export async function cancelAppointmentAction(id: string, reason: string) {
  const { ctx } = await requireBusiness();
  const res = await run(async () => {
    const r = await cancelAppointment(ctx, id, reason.trim() || undefined);
    return { label: r.label };
  }, "Appointment cancelled");
  if (res.ok) revalidateAll();
  return res;
}

export async function setOutcomeAction(id: string, outcome: "completed" | "no_show" | "confirmed") {
  const { ctx } = await requireBusiness();
  const res = await run(async () => {
    if (!["completed", "no_show", "confirmed"].includes(outcome)) throw invalid("Unknown outcome.");
    await setAppointmentOutcome(ctx, id, outcome);
  });
  if (res.ok) revalidateAll();
  return res;
}
