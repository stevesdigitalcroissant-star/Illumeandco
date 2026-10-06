/**
 * Final product test: a complete conversation with Dubai Smile Clinic,
 * verifying every step is a real action visible in the dashboard data and
 * the audit log.
 */
import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiActions, auditLogs, leads } from "@/db/schema";
import { handleInbound } from "@/server/ai/orchestrator";
import { listAppointments } from "@/server/services/appointments";
import { getConversation, listConversations } from "@/server/services/conversations";
import { getCustomer } from "@/server/services/customers";
import { at, createClinic, visitor } from "./helpers";

describe("Dubai Smile Clinic — end to end", () => {
  it("price → availability → book → reschedule → human handoff", async () => {
    const c = await createClinic("Dubai Smile Clinic");
    const id = visitor();
    const say = (text: string) => handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text });

    // 1. Price question answered from business data
    const r1 = await say("Hi, how much is teeth whitening?");
    expect(r1.reply).toMatch(/AED 650/);
    expect(r1.reply).toMatch(/check availability/i);

    // 2. Availability is checked for real
    const r2 = await say("Can I come tomorrow?");
    expect(r2.turn?.toolCalls.some((t) => t.tool === "get_available_appointments" && t.ok)).toBe(true);
    expect(r2.reply).toMatch(/2:00 PM|PM/);

    // 3. Customer picks 2pm — the clinic requires name + contact, so the AI asks first
    const r3 = await say("2pm works");
    expect(r3.reply).toMatch(/2:00 PM tomorrow is available/i);
    expect(r3.reply).not.toMatch(/I've booked/i);
    expect(await listAppointments(c.ctx)).toHaveLength(0);

    const r4 = await say("Sarah Johnson, +971 50 123 4567");
    expect(r4.reply).toMatch(/I've booked your teeth whitening/i);
    let appts = await listAppointments(c.ctx);
    expect(appts).toHaveLength(1);
    expect(appts[0]!.appointment.startsAt.toISOString()).toBe(at("14:00").toISOString());
    expect(appts[0]!.appointment.source).toBe("ai");
    expect(appts[0]!.customer.name).toBe("Sarah Johnson");

    // 4. Reschedule to 3pm — same appointment, new time
    const r5 = await say("Actually can we make it 3pm?");
    expect(r5.reply).toMatch(/moved your teeth whitening/i);
    appts = await listAppointments(c.ctx);
    expect(appts).toHaveLength(1);
    expect(appts[0]!.appointment.startsAt.toISOString()).toBe(at("15:00").toISOString());

    // 5. Handoff
    const r6 = await say("Can I speak to someone?");
    expect(r6.aiActive).toBe(false);
    const conv = await getConversation(c.ctx, r6.conversationId);
    expect(conv.owner).toBe("human");

    // ── Dashboard data ────────────────────────────────────────────
    const customer = await getCustomer(c.ctx, r6.customerId);
    expect(customer.phone).toBe("+971501234567");
    const [lead] = await db.select().from(leads).where(eq(leads.customerId, customer.id));
    expect(lead?.status).toBe("appointment_booked");
    expect(lead?.appointmentId).toBe(appts[0]!.appointment.id);
    const inbox = await listConversations(c.ctx, { status: "needs_human" });
    expect(inbox[0]?.conversation.id).toBe(conv.id);
    expect(inbox[0]?.leadStatus).toBe("appointment_booked");

    // ── Audit log ─────────────────────────────────────────────────
    const log = await db.select().from(auditLogs).where(eq(auditLogs.businessId, c.business.id)).orderBy(asc(auditLogs.createdAt));
    const aiEntries = log.filter((l) => l.actorType === "ai").map((l) => l.action);
    expect(aiEntries).toEqual(expect.arrayContaining(["lead.created", "customer.created", "appointment.booked", "appointment.rescheduled", "conversation.handoff_requested"]));
    const booked = log.find((l) => l.action === "appointment.booked")!;
    expect(booked.actorLabel).toMatch(/AI Receptionist/);
    expect(booked.details).toMatchObject({ customer: "Sarah Johnson", service: "Teeth whitening", time: "14:00" });
    const moved = log.find((l) => l.action === "appointment.rescheduled")!;
    expect(moved.details).toMatchObject({ time: "15:00" });

    // Every tool call was recorded
    const calls = await db.select().from(aiActions).where(and(eq(aiActions.conversationId, conv.id), eq(aiActions.status, "success")));
    expect(calls.map((x) => x.tool)).toEqual(expect.arrayContaining(["get_service_details", "get_available_appointments", "book_appointment", "reschedule_appointment", "escalate_to_human"]));
  });

  it("answers FAQs from the knowledge base", async () => {
    const c = await createClinic();
    const r = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "Is there parking?" });
    expect(r.reply).toMatch(/free underground parking/i);
  });

  it("offers real alternatives when the requested time is taken", async () => {
    const c = await createClinic();
    const a = visitor();
    const say = (who: string, text: string) => handleInbound({ businessId: c.business.id, channel: "web_chat", identity: who, text });
    await say(a, "How much is teeth whitening?");
    await say(a, "Can I come tomorrow?");
    await say(a, "2pm");
    await say(a, "My name is Maya Patel, maya@example.com");
    const b = visitor();
    await say(b, "teeth whitening tomorrow afternoon?");
    const r = await say(b, "2pm please");
    expect(r.reply).toMatch(/isn't available/);
    expect(await listAppointments(c.ctx)).toHaveLength(1);
  });

  it("cancels with confirmation and recognises returning customers", async () => {
    const c = await createClinic();
    const first = visitor();
    const say = (who: string, text: string) => handleInbound({ businessId: c.business.id, channel: "web_chat", identity: who, text });
    await say(first, "I'd like a cleaning tomorrow");
    await say(first, "11am");
    await say(first, "Omar Ali, +971 55 222 3333");
    expect(await listAppointments(c.ctx, { status: ["booked"] })).toHaveLength(1);

    // Same person on a new device: identifies themselves → linked to their record
    const second = visitor();
    await say(second, "Hi, it's Omar Ali, +971 55 222 3333");
    const ask = await say(second, "I need to cancel my appointment");
    expect(ask.reply).toMatch(/Just to confirm — cancel your Cleaning/);
    expect(ask.reply).toMatch(/24 hours/);
    const done = await say(second, "yes");
    expect(done.reply).toMatch(/has been cancelled/);
    expect(await listAppointments(c.ctx, { status: ["booked"] })).toHaveLength(0);
  });
});
