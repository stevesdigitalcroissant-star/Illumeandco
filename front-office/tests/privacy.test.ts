/** Customer data rights: full export, and erasure that leaves no trace of their identifiers. */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, customers, messages } from "@/db/schema";
import { handleInbound } from "@/server/ai/orchestrator";
import { ingestEvent } from "@/server/integrations/ingest";
import { bookAppointment, cancelAppointment } from "@/server/services/appointments";
import { createCustomer } from "@/server/services/customers";
import { eraseCustomer, exportCustomerData, remainingTraces } from "@/server/services/privacy";
import { at, createClinic, visitor } from "./helpers";

async function richCustomer(c: Awaited<ReturnType<typeof createClinic>>) {
  const id = visitor();
  await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "How much is whitening?" });
  const r = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "I'm Layla Haddad, layla.haddad@example.com, +971 50 888 1234" });
  await ingestEvent(c.business.id, { connector: "webhook", externalId: `mc-${id}`, type: "call.missed", payload: { from: "+971508881234", callerName: "Layla Haddad" } });
  const appt = await bookAppointment(c.ctx, { serviceId: c.services.whitening.id, startsAt: at("10:00", 2), customerId: r.customerId, source: "staff" });
  return { customerId: r.customerId, appointmentId: appt.appointment.id };
}

describe("customer data rights", () => {
  it("exports everything held about the customer", async () => {
    const c = await createClinic();
    const { customerId } = await richCustomer(c);
    const data = await exportCustomerData(c.ctx, customerId);
    expect(data.customer).toMatchObject({ name: "Layla Haddad", email: "layla.haddad@example.com" });
    expect(data.conversations.length).toBeGreaterThanOrEqual(1);
    expect(data.conversations[0]!.messages.some((m) => m.content.includes("How much is whitening"))).toBe(true);
    expect(data.appointments).toHaveLength(1);
    expect(data.leads.length).toBeGreaterThanOrEqual(1);
    expect(data.opportunities.length).toBeGreaterThanOrEqual(1);
  });

  it("erases the customer and redacts their identifiers everywhere", async () => {
    const c = await createClinic();
    const { customerId, appointmentId } = await richCustomer(c);
    const { customer: other } = await createCustomer(c.ctx, { name: "Omar Other", phone: "+971508889999" });
    expect(await remainingTraces(c.ctx, "Layla Haddad")).toBeGreaterThan(0);

    await expect(eraseCustomer(c.ctx, customerId)).rejects.toThrow(/upcoming appointment/);
    await cancelAppointment(c.ctx, appointmentId);
    await eraseCustomer(c.ctx, customerId);

    for (const v of ["Layla Haddad", "layla haddad", "layla.haddad@example.com", "+971508881234"]) expect(await remainingTraces(c.ctx, v)).toBe(0);
    expect(await db.query.customers.findFirst({ where: eq(customers.id, customerId) })).toBeUndefined();
    expect(await db.select().from(messages).where(and(eq(messages.businessId, c.business.id), eq(messages.content, "How much is whitening?")))).toHaveLength(0);
    const erased = await db.select().from(auditLogs).where(and(eq(auditLogs.businessId, c.business.id), eq(auditLogs.action, "customer.erased")));
    expect(erased).toHaveLength(1);
    expect(await db.query.customers.findFirst({ where: eq(customers.id, other.id) })).toBeTruthy();
    expect(await remainingTraces(c.ctx, "Omar Other")).toBeGreaterThan(0);
  });

  it("is owner/manager only and tenant-scoped", async () => {
    const a = await createClinic("A");
    const b = await createClinic("B");
    const { customer } = await createCustomer(a.ctx, { name: "Tenant Test", phone: "+971508887777" });
    await expect(eraseCustomer(b.ctx, customer.id)).rejects.toThrow(/not found/i);
    await expect(exportCustomerData(b.ctx, customer.id)).rejects.toThrow(/not found/i);
    const staff = { ...a.ctx, actor: { ...a.ctx.actor, role: "staff" as const } };
    await expect(eraseCustomer(staff, customer.id)).rejects.toThrow();
    await expect(exportCustomerData(staff, customer.id)).rejects.toThrow();
    expect(await db.query.customers.findFirst({ where: eq(customers.id, customer.id) })).toBeTruthy();
  });
});
