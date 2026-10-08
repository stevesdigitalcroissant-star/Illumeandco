/**
 * Revenue attribution (identified → influenced → realized) and the
 * prioritized "what to do next" feed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, slotRecoveries } from "@/db/schema";
import type { Ctx } from "@/server/context";
import { handleInbound } from "@/server/ai/orchestrator";
import { ingestEvent } from "@/server/integrations/ingest";
import { revenueFeed, revenueSummary } from "@/server/recovery/revenue";
import { addToWaitlist, offerSlot } from "@/server/recovery/slots";
import { bookAppointment, cancelAppointment, setAppointmentOutcome } from "@/server/services/appointments";
import { createCustomer, updateCustomer } from "@/server/services/customers";
import { at, createClinic, localDate, visitor } from "./helpers";

type Clinic = Awaited<ReturnType<typeof createClinic>>;

function smsConfigured() {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-token");
  vi.stubEnv("TWILIO_SMS_FROM", "+15550001111");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ sid: "SM1" }), { status: 201 })));
}
beforeEach(() => {
  for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM", "RESEND_API_KEY", "EMAIL_FROM"]) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const missedCall = (c: Clinic, from: string) =>
  ingestEvent(c.business.id, { connector: "webhook", externalId: `mc-${from}-${Math.random()}`, type: "call.missed", payload: { from } });
const customerByPhone = (c: Clinic, phone: string) => db.query.customers.findFirst({ where: and(eq(customers.businessId, c.business.id), eq(customers.phone, phone)) });

describe("revenue attribution", () => {
  it("identified: values at service prices; unknown values at the average booking, counted as estimates", async () => {
    const c = await createClinic();
    // Average booking value comes from real appointments: one cleaning (300) + one whitening (650) → 475.
    const { customer: x } = await createCustomer(c.ctx, { name: "X", phone: "+971504440001" });
    await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("10:00", 2), customerId: x.id, source: "staff" });
    await bookAppointment(c.ctx, { serviceId: c.services.whitening.id, startsAt: at("12:00", 3), customerId: x.id, source: "staff" });
    await missedCall(c, "+971504440002");
    await ingestEvent(c.business.id, { connector: "webhook", externalId: "lead-1", type: "lead.created", payload: { email: "w@example.com", service: "whitening" } });

    const s = await revenueSummary(c.ctx);
    const by = Object.fromEntries(s.workers.map((w) => [w.worker, w]));
    expect(s.averageCents).toBe(47500);
    expect(by.missed_call).toMatchObject({ identified: { count: 1, valueCents: 47500 }, estimated: 1 });
    expect(by.lead).toMatchObject({ identified: { count: 1, valueCents: 65000 }, estimated: 0 });
    expect(s.estimatedCount).toBe(1);
    expect(s.influenced).toEqual({ count: 0, valueCents: 0 });
  });

  it("influenced only when our action went out first; realized only when the appointment is completed", async () => {
    smsConfigured();
    const c = await createClinic();
    // Missed call → text-back sent → they book → influenced; completed → realized.
    await missedCall(c, "+971504440010");
    const caller = (await customerByPhone(c, "+971504440010"))!;
    const appt = await bookAppointment(c.ctx, { serviceId: c.services.whitening.id, startsAt: at("10:00", 2), customerId: caller.id, source: "staff" });
    // A booking with no prior action is not influenced.
    const { customer: walkIn } = await createCustomer(c.ctx, { name: "Walk-in", phone: "+971504440011" });
    await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("12:00", 2), customerId: walkIn.id, source: "staff" });

    let s = await revenueSummary(c.ctx);
    expect(s.influenced).toEqual({ count: 1, valueCents: 65000 });
    expect(s.realized).toEqual({ count: 0, valueCents: 0 });
    await setAppointmentOutcome(c.ctx, appt.appointment.id, "completed");
    s = await revenueSummary(c.ctx);
    expect(s.realized).toEqual({ count: 1, valueCents: 65000 });
    expect(s.workers.find((w) => w.worker === "missed_call")!.realized.count).toBe(1);
  });

  it("slots: filled through an accepted offer counts; filled directly doesn't", async () => {
    smsConfigured();
    const c = await createClinic();
    const { customer: leaver } = await createCustomer(c.ctx, { phone: "+971504440020" });
    const a = await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("14:00", 3), customerId: leaver.id, source: "staff" });
    await cancelAppointment(c.ctx, a.appointment.id);
    const { customer: w } = await createCustomer(c.ctx, { name: "Waiter", phone: "+971504440021" });
    await addToWaitlist(c.ctx, { customerId: w.id, serviceId: c.services.cleaning.id, earliestDate: localDate(0), source: "staff" });
    const slot = (await db.query.slotRecoveries.findFirst({ where: eq(slotRecoveries.businessId, c.business.id) }))!;
    await offerSlot(c.ctx, slot.id, { now: at("10:00", 1) });
    await handleInbound({ businessId: c.business.id, channel: "sms", identity: "+971504440021", text: "yes", contact: { phone: "+971504440021" } }, { now: at("10:05", 1) });

    const s = await revenueSummary(c.ctx);
    const slots = s.workers.find((x) => x.worker === "slot")!;
    expect(slots.identified).toEqual({ count: 1, valueCents: 30000 });
    expect(slots.influenced).toEqual({ count: 1, valueCents: 30000 });

    // A second freed slot filled directly by the team: identified, not influenced.
    const b = await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("16:00", 3), customerId: leaver.id, source: "staff" });
    await cancelAppointment(c.ctx, b.appointment.id);
    await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("16:00", 3), staffId: c.staff.omar.id, customerId: w.id, source: "staff" });
    const s2 = await revenueSummary(c.ctx);
    expect(s2.workers.find((x) => x.worker === "slot")).toMatchObject({ identified: { count: 2 }, influenced: { count: 1 } });
  });

  it("is tenant-scoped and limited to people who may see analytics", async () => {
    const a = await createClinic("A");
    const b = await createClinic("B");
    await missedCall(a, "+971504440030");
    expect((await revenueSummary(b.ctx)).identified.count).toBe(0);
    const staffCtx: Ctx = { businessId: a.business.id, actor: { type: "user", userId: a.user.id, name: "Staff", role: "staff" } };
    await expect(revenueSummary(staffCtx)).rejects.toThrow();
    await expect(revenueFeed(staffCtx)).rejects.toThrow();
  });
});

describe("prioritized feed", () => {
  it("lists only what needs a person, most valuable first, with the right approval action", async () => {
    const c = await createClinic();
    // A person waiting in chat (needs_human), a missed call (no SMS → call back), an opted-out caller, an empty slot.
    const handed = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "Can I speak to a person please?" });
    expect(handed.aiActive).toBe(false);
    await missedCall(c, "+971504440040");
    const { customer: out } = await createCustomer(c.ctx, { phone: "+971504440041" });
    await updateCustomer(c.ctx, out.id, { optedOut: true });
    await missedCall(c, "+971504440041");
    const { customer: leaver } = await createCustomer(c.ctx, { phone: "+971504440042" });
    const a = await bookAppointment(c.ctx, { serviceId: c.services.whitening.id, startsAt: at("11:00", 1), customerId: leaver.id, source: "staff" });
    await cancelAppointment(c.ctx, a.appointment.id);

    const feed = await revenueFeed(c.ctx);
    const kinds = feed.map((f) => `${f.type}:${f.worker}:${f.action}`);
    expect(kinds[0]).toBe("opportunity:needs_human:open_conversation");
    expect(kinds).toContain("slot:slot:recover_slot");
    expect(kinds).toContain("opportunity:missed_call:let_ai_handle");
    expect(feed.find((f) => f.who === "+971504440041")?.action).toBeNull();
    // The cancelled customer's own rebooking opportunity is offered too.
    expect(kinds).toContain("opportunity:rebooking:offer_rebooking");
    const slot = feed.find((f) => f.type === "slot")!;
    expect(slot.why).toMatch(/48 hours/);
    for (let i = 1; i < feed.length; i++) {
      const [p, q] = [feed[i - 1]!, feed[i]!];
      expect(p.tier > q.tier || (p.tier === q.tier && p.priority >= q.priority)).toBe(true);
    }
  });
});
