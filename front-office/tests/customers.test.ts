import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, customers } from "@/db/schema";
import { handleInbound } from "@/server/ai/orchestrator";
import { createCustomer, updateCustomer } from "@/server/services/customers";
import { createClinic, visitor } from "./helpers";

describe("customers", () => {
  it("creates customers once per email/phone and normalises contact details", async () => {
    const c = await createClinic();
    const a = await createCustomer(c.ctx, { name: "Nour", email: "Nour@Example.com", phone: "+971 50 555 0000" });
    expect(a.created).toBe(true);
    expect(a.customer.email).toBe("nour@example.com");
    expect(a.customer.phone).toBe("+971505550000");
    const again = await createCustomer(c.ctx, { email: "nour@example.com" });
    expect(again.created).toBe(false);
    expect(again.customer.id).toBe(a.customer.id);
    await expect(createCustomer(c.ctx, { phone: "12" })).rejects.toThrow(/phone/);
  });

  it("audits customer changes and refuses to silently merge on edit", async () => {
    const c = await createClinic();
    const { customer: x } = await createCustomer(c.ctx, { name: "X", email: "x@example.com" });
    const { customer: y } = await createCustomer(c.ctx, { name: "Y", email: "y@example.com" });
    await updateCustomer(c.ctx, x.id, { name: "Xavier" });
    await expect(updateCustomer(c.ctx, x.id, { email: "y@example.com" })).rejects.toThrow(/already uses/);
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, x.id), eq(auditLogs.action, "customer.updated")));
    expect(logs[0]?.actorType).toBe("user");
    expect(y.id).toBeTruthy();
  });

  it("links a returning chat visitor to their existing record", async () => {
    const c = await createClinic();
    const { customer } = await createCustomer(c.ctx, { name: "Layla Haddad", phone: "+971507654321" });
    const r = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "hi it's Layla Haddad, +971 50 765 4321" });
    expect(r.customerId).toBe(customer.id);
    const all = await db.select().from(customers).where(eq(customers.businessId, c.business.id));
    expect(all).toHaveLength(1); // the anonymous shell was folded in
  });
});
