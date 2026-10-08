/**
 * Revenue Recovery — Slot Recovery.
 * Freed slots are ranked against the waitlist, offered to the best fits, and
 * the first YES wins (the database guarantees no double booking).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db";
import { aiSettings, appointments, followUps, slotOffers, slotRecoveries, waitlistEntries } from "@/db/schema";
import { handleInbound } from "@/server/ai/orchestrator";
import { TOOLS } from "@/server/ai/tools/definitions";
import { executeTool, type ToolContext } from "@/server/ai/tools/registry";
import { ingestEvent } from "@/server/integrations/ingest";
import { addToWaitlist, confirmSlotBooked, offerSlot, rankCandidates, sweepSlots } from "@/server/recovery/slots";
import { bookAppointment, cancelAppointment, rescheduleAppointment, setAppointmentOutcome } from "@/server/services/appointments";
import { getAgent, getAiSettings } from "@/server/services/business";
import { createConversation } from "@/server/services/conversations";
import { createCustomer, updateCustomer } from "@/server/services/customers";
import { at, createClinic, localDate, setPermissions, TZ } from "./helpers";

type Clinic = Awaited<ReturnType<typeof createClinic>>;
const MORNING = () => at("10:00", 1); // "now" for offers: tomorrow 10:00 local (messaging hours)

function smsConfigured() {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-token");
  vi.stubEnv("TWILIO_SMS_FROM", "+15550001111");
  const sent: URLSearchParams[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(new URLSearchParams(String(init.body)));
      return new Response(JSON.stringify({ sid: `SM${sent.length}` }), { status: 201 });
    }),
  );
  return sent;
}

beforeEach(() => {
  for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM", "RESEND_API_KEY", "EMAIL_FROM"]) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** A cleaning with Dr. Omar 3 days out at 14:00 is cancelled → a freed afternoon slot. */
async function freedSlot(c: Clinic) {
  const { customer: leaver } = await createCustomer(c.ctx, { name: "Leaver", phone: "+971503330000" });
  const booked = await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("14:00", 3), customerId: leaver.id, source: "staff" });
  await cancelAppointment(c.ctx, booked.appointment.id, "Travelling");
  const slot = await db.query.slotRecoveries.findFirst({ where: and(eq(slotRecoveries.businessId, c.business.id), eq(slotRecoveries.sourceAppointmentId, booked.appointment.id)) });
  return { slot: slot!, leaver, appointment: booked.appointment };
}

async function waitlisted(c: Clinic, name: string, phone: string, opts: { service?: string; dayparts?: ("morning" | "afternoon" | "evening")[]; latest?: string; daysAgo?: number } = {}) {
  const { customer } = await createCustomer(c.ctx, { name, phone });
  const entry = await addToWaitlist(c.ctx, {
    customerId: customer.id,
    serviceId: opts.service ?? c.services.consultation.id,
    earliestDate: localDate(0),
    latestDate: opts.latest ?? null,
    dayparts: opts.dayparts ?? [],
    source: "staff",
  });
  if (opts.daysAgo) await db.update(waitlistEntries).set({ createdAt: new Date(Date.now() - opts.daysAgo * 86400_000) }).where(eq(waitlistEntries.id, entry.id));
  return { customer, entry };
}

const reply = (c: Clinic, phone: string, text: string, now = new Date(MORNING().getTime() + 5 * 60_000)) =>
  handleInbound({ businessId: c.business.id, channel: "sms", identity: phone, text, contact: { phone } }, { now });

describe("Slot Recovery — freed slots and ranking", () => {
  it("a cancellation or reschedule records the freed time", async () => {
    const c = await createClinic();
    const { slot } = await freedSlot(c);
    expect(slot).toMatchObject({ source: "cancellation", status: "open", staffId: c.staff.omar.id, lostValueCents: 30000 });

    const { customer } = await createCustomer(c.ctx, { name: "Mover", phone: "+971503330001" });
    const a = await bookAppointment(c.ctx, { serviceId: c.services.consultation.id, startsAt: at("09:00", 4), customerId: customer.id, source: "staff" });
    await rescheduleAppointment(c.ctx, a.appointment.id, { startsAt: at("11:00", 4) });
    const moved = await db.query.slotRecoveries.findFirst({ where: and(eq(slotRecoveries.sourceAppointmentId, a.appointment.id), eq(slotRecoveries.source, "reschedule")) });
    expect(moved?.startsAt.getTime()).toBe(at("09:00", 4).getTime());

  });

  it("ranks by fit, value, waiting time and reliability — with hard eligibility rules", async () => {
    const c = await createClinic();
    const { slot, leaver } = await freedSlot(c);
    const loyal = await waitlisted(c, "Loyal", "+971503330010", { daysAgo: 6, dayparts: ["afternoon"] });
    const fresh = await waitlisted(c, "Fresh", "+971503330011");
    const flaky = await waitlisted(c, "Flaky", "+971503330012"); // same wait as Fresh, but a no-show
    // Flaky didn't show up last time.
    const past = await bookAppointment(c.ctx, { serviceId: c.services.consultation.id, startsAt: at("09:30", 2), customerId: flaky.customer.id, source: "staff" });
    await setAppointmentOutcome(c.ctx, past.appointment.id, "no_show");
    const morningOnly = await waitlisted(c, "Morning", "+971503330013", { dayparts: ["morning"] });
    const whitening = await waitlisted(c, "Whitening", "+971503330014", { service: c.services.whitening.id }); // Amira only — slot is Omar's
    const tooEarly = await waitlisted(c, "Early", "+971503330015", { latest: localDate(1) });
    const optedOut = await waitlisted(c, "Out", "+971503330016");
    await updateCustomer(c.ctx, optedOut.customer.id, { optedOut: true });
    await addToWaitlist(c.ctx, { customerId: leaver.id, serviceId: c.services.consultation.id, earliestDate: localDate(0), source: "staff" });

    smsConfigured();
    const ranked = await rankCandidates(c.ctx, slot);
    const by = (id: string) => ranked.find((r) => r.customer.id === id)!;
    expect(ranked.filter((r) => !r.blocked).map((r) => r.customer.name)).toEqual(["Loyal", "Fresh", "Flaky"]);
    expect(by(loyal.customer.id).reasons.join(" ")).toMatch(/Asked for afternoons/);
    expect(by(flaky.customer.id).reasons.join(" ")).toMatch(/1 no-show/);
    expect(by(morningOnly.customer.id).blocked).toMatch(/Wants morning/);
    expect(by(whitening.customer.id).blocked).toMatch(/doesn't fit/);
    expect(by(tooEarly.customer.id).blocked).toBe("Outside their dates");
    expect(by(optedOut.customer.id).blocked).toBe("Opted out of messages");
    expect(by(leaver.id).blocked).toBe("They gave up this slot");
    expect(by(fresh.customer.id).blocked).toBeNull();
  });

  it("checks calendar fit once per service, and only as far as needed", async () => {
    smsConfigured();
    const c = await createClinic();
    const { slot } = await freedSlot(c);
    // 12 people for the same service + 2 for a service Dr. Omar doesn't do.
    for (let i = 0; i < 12; i++) await waitlisted(c, `Consult ${i}`, `+9715033301${String(i).padStart(2, "0")}`, { daysAgo: i });
    for (let i = 0; i < 2; i++) await waitlisted(c, `Whiten ${i}`, `+9715033302${i}0`, { service: c.services.whitening.id });

    const availability = await import("@/server/services/availability");
    const spy = vi.spyOn(availability, "findSlot");
    const full = await rankCandidates(c.ctx, slot);
    expect(spy).toHaveBeenCalledTimes(2); // one per distinct service, not 14
    expect(full.filter((x) => !x.blocked)).toHaveLength(12);

    spy.mockClear();
    const top = await rankCandidates(c.ctx, slot, undefined, { need: 3 });
    expect(spy).toHaveBeenCalledTimes(1);
    // Same order as the full ranking for the people it returns.
    expect(top.filter((x) => !x.blocked).map((x) => x.customer.id)).toEqual(full.filter((x) => !x.blocked).slice(0, 3).map((x) => x.customer.id));
    spy.mockRestore();
  });

  it("without a channel nobody is offered anything — and the reason is honest", async () => {
    const c = await createClinic();
    const { slot } = await freedSlot(c);
    await waitlisted(c, "Nadia", "+971503330020");
    const r = await offerSlot(c.ctx, slot.id, { now: MORNING() });
    expect(r).toMatchObject({ sent: 0 });
    expect(r.detail).toMatch(/configuration required/);
    expect(await db.select().from(slotOffers).where(eq(slotOffers.slotId, slot.id))).toHaveLength(0);
  });
});

describe("Slot Recovery — offers and replies", () => {
  it("offers the top candidates; first YES is booked by the AI, the second is told it's taken", async () => {
    const sent = smsConfigured();
    const c = await createClinic();
    const { slot } = await freedSlot(c);
    const s = await getAiSettings(c.ctx);
    await db.update(aiSettings).set({ recovery: { ...s.recovery, slots: { ...s.recovery.slots, batchSize: 2 } } }).where(eq(aiSettings.businessId, c.business.id));
    const a = await waitlisted(c, "Amal", "+971503330030", { daysAgo: 5 });
    const b = await waitlisted(c, "Bilal", "+971503330031", { daysAgo: 2 });
    const third = await waitlisted(c, "Carla", "+971503330032");

    expect(await offerSlot(c.ctx, slot.id, { now: at("21:00", 1) }).catch((e) => e.message)).toMatch(/between 09:00 and 20:00/);
    const r = await offerSlot(c.ctx, slot.id, { now: MORNING() });
    expect(r.sent).toBe(2);
    expect(sent.map((p) => p.get("To"))).toEqual(["+971503330030", "+971503330031"]);
    expect(sent[0]!.get("Body")).toMatch(/consultation appointment just opened up at Dubai Smile Clinic: .* at 2:00 PM\. Reply YES/);
    const offers = await db.select().from(slotOffers).where(eq(slotOffers.slotId, slot.id));
    expect(offers.map((o) => o.status)).toEqual(["sent", "sent"]);
    expect(await db.select().from(followUps).where(and(eq(followUps.customerId, third.customer.id), eq(followUps.purpose, "slot_offer")))).toHaveLength(0);

    const win = await reply(c, "+971503330031", "Yes please!");
    expect(win.reply).toMatch(/^You're booked! Dental consultation on .* at 2:00 PM with Dr\. Omar Khalid/);
    const lose = await reply(c, "+971503330030", "yes");
    expect(lose.reply).toMatch(/no longer available.*still on the waitlist/);

    const filled = await db.query.slotRecoveries.findFirst({ where: eq(slotRecoveries.id, slot.id) });
    expect(filled).toMatchObject({ status: "filled", filledBy: "ai", filledCustomerId: b.customer.id, filledValueCents: 25000 });
    const appts = await db.select().from(appointments).where(and(eq(appointments.businessId, c.business.id), eq(appointments.startsAt, slot.startsAt), eq(appointments.status, "booked")));
    expect(appts).toHaveLength(1);
    expect(appts[0]!.customerId).toBe(b.customer.id);
    expect((await db.query.waitlistEntries.findFirst({ where: eq(waitlistEntries.id, b.entry.id) }))?.status).toBe("booked");
    expect((await db.query.waitlistEntries.findFirst({ where: eq(waitlistEntries.id, a.entry.id) }))?.status).toBe("active");
  });

  it("NO declines; other messages go to the AI as usual", async () => {
    smsConfigured();
    const c = await createClinic();
    const { slot } = await freedSlot(c);
    const n = await waitlisted(c, "Noor", "+971503330040");
    await offerSlot(c.ctx, slot.id, { now: MORNING() });
    const q = await reply(c, "+971503330040", "How much is a cleaning?");
    expect(q.turn).not.toBeNull(); // the AI answered
    expect(q.reply).toMatch(/AED 300/);
    // The offer is no longer the last thing we said, so a later "yes" isn't taken as accepting it.
    const later = await reply(c, "+971503330040", "yes");
    expect(later.reply ?? "").not.toMatch(/You're booked/);
    expect((await db.query.slotRecoveries.findFirst({ where: eq(slotRecoveries.id, slot.id) }))?.status).toBe("offering");

    const c2 = await createClinic();
    const { slot: s2 } = await freedSlot(c2);
    await waitlisted(c2, "Omar", "+971503330041");
    await offerSlot(c2.ctx, s2.id, { now: MORNING() });
    const no = await reply(c2, "+971503330041", "No thanks");
    expect(no.reply).toMatch(/still on the waitlist/);
    const [o] = await db.select().from(slotOffers).where(eq(slotOffers.slotId, s2.id));
    expect(o?.status).toBe("declined");
    expect(n.entry.status).toBe("active");
  });

  it("when the AI may not book, an accepted slot goes to the team — and the customer isn't told it's booked", async () => {
    smsConfigured();
    const c = await createClinic();
    await setPermissions(c.business.id, { book_appointments: false });
    const { slot } = await freedSlot(c);
    const w = await waitlisted(c, "Huda", "+971503330050");
    await offerSlot(c.ctx, slot.id, { now: MORNING() });
    const r = await reply(c, "+971503330050", "YES");
    expect(r.reply).toMatch(/passed this to the team to confirm/);
    expect(r.reply).not.toMatch(/booked/i);
    expect((await db.query.slotRecoveries.findFirst({ where: eq(slotRecoveries.id, slot.id) }))?.status).toBe("pending_staff");
    const done = await confirmSlotBooked(c.ctx, slot.id);
    expect(done).toMatchObject({ status: "filled", filledBy: "staff", filledValueCents: 30000 });
    expect((await db.query.waitlistEntries.findFirst({ where: eq(waitlistEntries.id, w.entry.id) }))?.status).toBe("booked");
  });

  it("slot.opened from an external booking system: offered, accepted, handed to the team", async () => {
    smsConfigured();
    const c = await createClinic();
    const startsAt = DateTime.fromJSDate(at("15:00", 3)).setZone(TZ).toISO()!;
    const ev = await ingestEvent(c.business.id, { connector: "webhook", externalId: "fresha-991", type: "slot.opened", payload: { startsAt, durationMinutes: 45, service: "Cleaning", staff: "Dr. Omar" } });
    expect(ev.event.status).toBe("processed");
    const dup = await ingestEvent(c.business.id, { connector: "webhook", externalId: "fresha-991", type: "slot.opened", payload: { startsAt } });
    expect(dup.duplicate).toBe(true);
    const slot = (await db.query.slotRecoveries.findFirst({ where: and(eq(slotRecoveries.businessId, c.business.id), eq(slotRecoveries.source, "external")) }))!;
    expect(slot).toMatchObject({ serviceId: c.services.cleaning.id, label: "Dr. Omar" });
    await waitlisted(c, "Wrong service", "+971503330060");
    await waitlisted(c, "Rana", "+971503330061", { service: c.services.cleaning.id });
    const r = await offerSlot(c.ctx, slot.id, { now: MORNING() });
    expect(r.sent).toBe(1);
    const yes = await reply(c, "+971503330061", "yes");
    expect(yes.reply).toMatch(/passed this to the team/);
    expect((await db.query.slotRecoveries.findFirst({ where: eq(slotRecoveries.id, slot.id) }))?.status).toBe("pending_staff");
  });

  it("sweep: lapsed offers reopen the slot, auto-offer sends the next batch, passed slots expire", async () => {
    const sent = smsConfigured();
    const c = await createClinic();
    const s = await getAiSettings(c.ctx);
    await db.update(aiSettings).set({ recovery: { ...s.recovery, slots: { ...s.recovery.slots, autoOffer: true, batchSize: 1, offerMinutes: 30 } } }).where(eq(aiSettings.businessId, c.business.id));
    const { slot } = await freedSlot(c);
    await waitlisted(c, "First", "+971503330070", { daysAgo: 3 });
    await waitlisted(c, "Second", "+971503330071");

    await sweepSlots(c.ctx, MORNING());
    expect(sent.map((p) => p.get("To"))).toEqual(["+971503330070"]);
    // 40 minutes later the first offer lapsed → next person.
    await sweepSlots(c.ctx, new Date(MORNING().getTime() + 40 * 60_000));
    expect(sent.map((p) => p.get("To"))).toEqual(["+971503330070", "+971503330071"]);
    const offers = await db.select().from(slotOffers).where(eq(slotOffers.slotId, slot.id));
    expect(offers.map((o) => o.status).sort()).toEqual(["expired", "sent"]);
    // After the slot's time it expires.
    await sweepSlots(c.ctx, new Date(slot.startsAt.getTime() + 60_000));
    expect((await db.query.slotRecoveries.findFirst({ where: eq(slotRecoveries.id, slot.id) }))?.status).toBe("expired");
  });

  it("a slot the team fills directly is closed but not credited as recovered", async () => {
    const c = await createClinic();
    const { slot } = await freedSlot(c);
    const { customer } = await createCustomer(c.ctx, { name: "Walk-in", phone: "+971503330080" });
    await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: slot.startsAt, staffId: c.staff.omar.id, customerId: customer.id, source: "staff" });
    const s = await db.query.slotRecoveries.findFirst({ where: eq(slotRecoveries.id, slot.id) });
    expect(s).toMatchObject({ status: "filled", filledBy: null });
  });

  it("tenant isolation: another business can't offer, rank or confirm this slot", async () => {
    const a = await createClinic("A");
    const b = await createClinic("B");
    const { slot } = await freedSlot(a);
    await expect(offerSlot(b.ctx, slot.id, { now: MORNING() })).rejects.toThrow(/not found/i);
    await expect(confirmSlotBooked(b.ctx, slot.id)).rejects.toThrow(/not found/i);
    const { customer } = await createCustomer(a.ctx, { phone: "+971503330090" });
    await expect(addToWaitlist(b.ctx, { customerId: customer.id, serviceId: b.services.consultation.id, earliestDate: localDate(0), source: "staff" })).rejects.toThrow(/not found/i);
  });

  it("the AI can add a customer to the waitlist (and needs contact details first)", async () => {
    const c = await createClinic();
    const { customer: anon } = await createCustomer(c.ctx, { name: "No contact" });
    const { customer } = await createCustomer(c.ctx, { name: "Lina", phone: "+971503330095" });
    const settings = await getAiSettings(c.ctx);
    const agent = await getAgent(c.ctx);
    const tc = async (customerId: string): Promise<ToolContext> => ({
      ctx: { businessId: c.business.id, actor: { type: "ai", agentId: agent.id, name: "AI" } },
      conversationId: (await createConversation(c.ctx, { customerId, channel: "web_chat" })).id,
      customerId,
      channel: "web_chat",
      business: c.business,
      settings,
      agentId: agent.id,
      now: new Date(),
      state: {} as ToolContext["state"],
      events: [],
      handedOff: false,
    });
    const denied = await executeTool(TOOLS, await tc(anon.id), "add_to_waitlist", { service: "whitening", earliest_date: localDate(1) });
    expect(denied).toMatchObject({ ok: false });
    const ok = await executeTool(TOOLS, await tc(customer.id), "add_to_waitlist", { service: "whitening", earliest_date: localDate(1), times_of_day: ["morning"] });
    expect(ok).toMatchObject({ ok: true, data: { waitlisted: true, service: "Teeth whitening" } });
    const [entry] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.customerId, customer.id));
    expect(entry).toMatchObject({ createdBy: "ai", dayparts: ["morning"], serviceId: c.services.whitening.id });
  });
});
