import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { appointments } from "@/db/schema";
import type { Ctx } from "@/server/context";
import { bookAppointment, listAppointments } from "@/server/services/appointments";
import { getAvailableSlots } from "@/server/services/availability";
import { getService, listServices, updateService } from "@/server/services/catalog";
import { getConversation, listConversations } from "@/server/services/conversations";
import { createCustomer, getCustomer, listCustomers } from "@/server/services/customers";
import { searchKnowledge } from "@/server/services/knowledge";
import { listLeads } from "@/server/services/leads";
import { handleInbound } from "@/server/ai/orchestrator";
import { at, createClinic, visitor } from "./helpers";

describe("tenant isolation", () => {
  it("never returns or modifies another business's data", async () => {
    const a = await createClinic("Clinic A");
    const b = await createClinic("Clinic B");
    const { customer: bCustomer } = await createCustomer(b.ctx, { name: "Bea B", email: "bea@b.test" });
    const { customer: aCustomer } = await createCustomer(a.ctx, { name: "Al A", email: "al@a.test" });

    // Reads are scoped
    await expect(getCustomer(a.ctx, bCustomer.id)).rejects.toThrow(/not found/);
    expect((await listCustomers(a.ctx)).map((c) => c.id)).not.toContain(bCustomer.id);
    await expect(getService(a.ctx, b.services.whitening.id)).rejects.toThrow(/not found/);
    expect((await listServices(a.ctx)).map((s) => s.id)).not.toContain(b.services.whitening.id);

    // Writes cannot target another tenant's rows
    await expect(updateService(a.ctx, b.services.whitening.id, { priceCents: 1 })).rejects.toThrow(/not found/);
    expect((await getService(b.ctx, b.services.whitening.id)).priceCents).toBe(65000);
    await expect(
      bookAppointment(a.ctx, { serviceId: b.services.whitening.id, startsAt: at("14:00"), customerId: aCustomer.id, source: "staff" }),
    ).rejects.toThrow(/not found/);
    await expect(
      bookAppointment(a.ctx, { serviceId: a.services.whitening.id, startsAt: at("14:00"), customerId: bCustomer.id, source: "staff" }),
    ).rejects.toThrow(/not found/);
    await expect(getAvailableSlots(a.ctx, { serviceId: b.services.whitening.id, fromDate: "2030-01-01" })).rejects.toThrow(/not found/);
  });

  it("the database rejects cross-tenant references even if application code is bypassed", async () => {
    const a = await createClinic("Clinic A");
    const b = await createClinic("Clinic B");
    const { customer: bCustomer } = await createCustomer(b.ctx, { name: "Bea", phone: "+971500000001" });
    const startsAt = at("10:00");
    await expect(
      db.insert(appointments).values({
        businessId: a.business.id,
        customerId: bCustomer.id, // belongs to B
        serviceId: a.services.consultation.id,
        staffId: a.staff.amira.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        blockedUntil: new Date(startsAt.getTime() + 30 * 60_000),
        source: "staff",
      }),
    ).rejects.toThrow();
  });

  it("isolates conversations, leads, appointments and knowledge", async () => {
    const a = await createClinic("Clinic A");
    const b = await createClinic("Clinic B");
    const inbound = await handleInbound({ businessId: b.business.id, channel: "web_chat", identity: visitor(), text: "How much is teeth whitening?" });
    await expect(getConversation(a.ctx, inbound.conversationId)).rejects.toThrow(/not found/);
    expect((await listConversations(a.ctx)).map((c) => c.conversation.id)).not.toContain(inbound.conversationId);
    expect((await listLeads(a.ctx)).length).toBe(0);
    expect((await listLeads(b.ctx)).length).toBe(1);
    expect(await listAppointments(a.ctx)).toEqual([]);

    // Knowledge: a unique fact only in B must never surface for A.
    const { addSource } = await import("@/server/services/knowledge");
    await addSource(b.ctx, { kind: "text", title: "Secret", content: "The zebra-quantum parking code is 4471." });
    const aHits = await searchKnowledge(a.ctx, "zebra-quantum parking code");
    expect(aHits.some((h) => h.content.includes("zebra-quantum"))).toBe(false);
    expect((await searchKnowledge(b.ctx, "zebra-quantum parking code")).length).toBeGreaterThan(0);
  });

  it("the AI cannot act on another tenant's or another customer's appointment", async () => {
    const a = await createClinic("Clinic A");
    const { customer } = await createCustomer(a.ctx, { name: "Victim", email: "victim@a.test" });
    const appt = await bookAppointment(a.ctx, { serviceId: a.services.consultation.id, startsAt: at("11:00"), customerId: customer.id, source: "staff" });

    // A different visitor in the same business tries to cancel by id via the tool layer.
    const { runAgentTurn } = await import("@/server/ai/agent");
    const inbound = await handleInbound({ businessId: a.business.id, channel: "web_chat", identity: visitor(), text: "hello" });
    const provider = {
      id: "scripted",
      label: "scripted",
      isConfigured: () => true,
      async run(input: Parameters<import("@/server/ai/providers/types").ModelProvider["run"]>[0]) {
        const r = await input.execute("cancel_appointment", { appointment_id: appt.appointment.id });
        return { text: r.ok ? "cancelled" : "could not", stopReason: "end_turn", model: "scripted" };
      },
    };
    const turn = await runAgentTurn(a.business.id, inbound.conversationId, { provider });
    expect(turn.reply).toBe("could not");
    const still = await listAppointments(a.ctx as Ctx, { customerId: customer.id });
    expect(still[0]!.appointment.status).toBe("booked");
  });
});
