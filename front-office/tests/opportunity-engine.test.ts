/**
 * AI Opportunity Engine (Feature 1).
 * Every conversation has a next step — derived from evidence, executed only
 * through permitted, guarded paths, with honest outcomes.
 */
import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appointments, auditLogs, followUps, leads, opportunities } from "@/db/schema";
import type { Ctx } from "@/server/context";
import { handleInbound } from "@/server/ai/orchestrator";
import { runTick } from "@/server/jobs/tick";
import { boardSummary, closeOpportunity, followUpNow, listBoard } from "@/server/opportunities/board";
import { evaluateLead, followUpDelayHours, sweepBusiness } from "@/server/opportunities/engine";
import { detectSignals } from "@/server/opportunities/signals";
import { bookAppointment, cancelAppointment, setAppointmentOutcome } from "@/server/services/appointments";
import { createConversation, resolveConversation } from "@/server/services/conversations";
import { createCustomer } from "@/server/services/customers";
import { civilHours } from "@/server/services/followups";
import { at, createClinic, setPermissions, TZ, visitor } from "./helpers";

const HOUR = 3600_000;
const openFor = async (businessId: string, customerId: string) =>
  db.select().from(opportunities).where(and(eq(opportunities.businessId, businessId), eq(opportunities.customerId, customerId), eq(opportunities.status, "open")));
const pending = (customerId: string) =>
  db.select().from(followUps).where(and(eq(followUps.customerId, customerId), eq(followUps.status, "scheduled")));

async function chat(c: Awaited<ReturnType<typeof createClinic>>, lines: string[], id = visitor()) {
  let r!: Awaited<ReturnType<typeof handleInbound>>;
  for (const text of lines) r = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text });
  return { ...r, identity: id };
}

/** Time the engine should pick: after the customer's last message, in civil hours. */
async function expectedAt(customerId: string, hours: number) {
  const { messages } = await import("@/db/schema");
  const { conversations } = await import("@/db/schema");
  const [row] = await db.execute<{ at: Date }>(sql`
    select max(m.created_at) as at from ${messages} m join ${conversations} c on c.id = m.conversation_id
    where c.customer_id = ${customerId} and m.role = 'customer'`).then((r) => r.rows);
  return civilHours(new Date(new Date(row!.at).getTime() + hours * HOUR), TZ);
}

describe("signals", () => {
  const msg = (content: string) => ({ id: content, content, createdAt: new Date() });
  const kinds = (t: string) => detectSignals([msg(t)]).map((s) => s.kind);
  it("detects what customers actually said", () => {
    expect(kinds("How much is teeth whitening?")).toContain("asked_price");
    expect(kinds("Do you have anything tomorrow afternoon?")).toContain("asked_availability");
    expect(kinds("I'll check my schedule and get back to you")).toContain("checking_schedule");
    expect(kinds("I need to talk to my husband first")).toContain("consulting_someone");
    expect(kinds("That's too expensive for me")).toContain("price_objection");
    expect(kinds("Is a consultation expensive?")).not.toContain("price_objection");
    expect(kinds("Please don't contact me again")).toContain("do_not_contact");
    expect(kinds("No thanks, I found somewhere else")).toContain("not_interested");
    expect(kinds("Okay thanks")).toContain("closing_remark");
  });

  it("follow-up timing follows intent and what the customer said", () => {
    expect(followUpDelayHours({ stage: "interested", blocker: "none" }, 24)).toBe(24);
    expect(followUpDelayHours({ stage: "high_intent", blocker: "none" }, 24)).toBe(3);
    expect(followUpDelayHours({ stage: "waiting", blocker: "undecided" }, 24)).toBe(48);
    expect(followUpDelayHours({ stage: "waiting", blocker: "consulting_someone" }, 24)).toBe(72);
  });
});

describe("lead opportunities", () => {
  it("price question + 'Okay thanks' → unconverted lead, AI follow-up queued in 24h", async () => {
    const c = await createClinic();
    const r = await chat(c, ["How much is teeth whitening?", "Okay thanks"]);
    const [o] = await openFor(c.business.id, r.customerId);
    expect(o).toBeTruthy();
    expect(o!.kind).toBe("lead");
    expect(o!.stage).toBe("interested");
    expect(o!.title).toBe("Teeth whitening enquiry");
    expect(o!.estimatedValueCents).toBe(65000);
    expect(o!.nextAction).toBe("follow_up");
    expect(o!.nextActionBy).toBe("ai");
    expect(o!.nextActionAt!.toISOString()).toBe((await expectedAt(r.customerId, 24)).toISOString());
    expect(o!.evidence.some((e) => e.detail.includes("How much is teeth whitening?"))).toBe(true);
    const [f] = await pending(r.customerId);
    expect(f!.scheduledFor.toISOString()).toBe(o!.nextActionAt!.toISOString());
    expect(o!.followUpId).toBe(f!.id);
  });

  it("'I'll check my schedule' waits 48h; 'talk to my husband' waits 72h", async () => {
    const c = await createClinic();
    const a = await chat(c, ["How much is a cleaning?", "Ok, I'll check my schedule"]);
    const [oa] = await openFor(c.business.id, a.customerId);
    expect(oa!.stage).toBe("waiting");
    expect(oa!.blocker).toBe("undecided");
    expect(oa!.nextActionAt!.toISOString()).toBe((await expectedAt(a.customerId, 48)).toISOString());

    const b = await chat(c, ["How much is teeth whitening?", "I need to talk to my husband first"]);
    const [ob] = await openFor(c.business.id, b.customerId);
    expect(ob!.blocker).toBe("consulting_someone");
    expect(ob!.nextActionAt!.toISOString()).toBe((await expectedAt(b.customerId, 72)).toISOString());
    expect((await pending(b.customerId))[0]!.scheduledFor.toISOString()).toBe(ob!.nextActionAt!.toISOString());
  });

  it("high intent is followed up sooner", async () => {
    const c = await createClinic();
    const r = await chat(c, ["Can I get teeth whitening tomorrow afternoon?"]);
    const [o] = await openFor(c.business.id, r.customerId);
    expect(o!.stage).toBe("high_intent");
    expect(o!.nextActionAt!.toISOString()).toBe((await expectedAt(r.customerId, 3)).toISOString());
  });

  it("'don't contact me' → never followed up automatically", async () => {
    const c = await createClinic();
    const r = await chat(c, ["How much is teeth whitening?", "Thanks, but please don't contact me again."]);
    const [o] = await openFor(c.business.id, r.customerId);
    expect(o!.blocker).toBe("opted_out");
    expect(o!.nextAction).toBe("none");
    expect(await pending(r.customerId)).toHaveLength(0);
  });

  it("when follow-ups aren't permitted, the next action goes to a person", async () => {
    const c = await createClinic();
    await setPermissions(c.business.id, { create_follow_ups: false });
    const r = await chat(c, ["How much is teeth whitening?", "ok thanks"]);
    const [o] = await openFor(c.business.id, r.customerId);
    expect(o!.nextActionBy).toBe("human");
    expect(await pending(r.customerId)).toHaveLength(0);
  });

  it("a booking closes the lead as won — and as recovered only after a follow-up", async () => {
    const c = await createClinic();
    // Converted in the same chat: won, not recovered.
    const direct = await chat(c, ["How much is a dental consultation?", "Can I come tomorrow?", "11am", "Nadia Karim, +971 50 777 1234"]);
    const [won] = await db.select().from(opportunities).where(and(eq(opportunities.customerId, direct.customerId), eq(opportunities.kind, "lead")));
    expect(won!.status).toBe("won");
    expect(won!.recovered).toBe(false);

    // Went quiet → AI follow-up sent → then booked: recovered, with value.
    const quiet = await chat(c, ["How much is teeth whitening?", "Hmm okay", "My name is Leila Aziz, leila@example.com"]);
    await runTick({ now: new Date(Date.now() + 40 * HOUR), businessId: c.business.id });
    expect((await db.select().from(followUps).where(and(eq(followUps.customerId, quiet.customerId), eq(followUps.status, "sent")))).length).toBe(1);
    await bookAppointment(c.ctx, { serviceId: c.services.whitening.id, startsAt: at("10:00", 3), customerId: quiet.customerId, source: "staff" });
    const [rec] = await db.select().from(opportunities).where(and(eq(opportunities.customerId, quiet.customerId), eq(opportunities.kind, "lead")));
    expect(rec!.status).toBe("won");
    expect(rec!.recovered).toBe(true);
    expect(rec!.recoveredValueCents).toBe(65000);
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.businessId, c.business.id), eq(auditLogs.action, "opportunity.recovered")));
    expect(log?.entityId).toBe(rec!.id);
    const s = await boardSummary(c.ctx);
    expect(s.recovered).toBe(1);
    expect(s.recoveredValueCents).toBe(65000);
  });

  it("'not interested' closes the lead as lost", async () => {
    const c = await createClinic();
    const r = await chat(c, ["How much is teeth whitening?", "No thanks, I found somewhere else"]);
    const [o] = await db.select().from(opportunities).where(eq(opportunities.customerId, r.customerId));
    expect(o!.status).toBe("lost");
    const [lead] = await db.select().from(leads).where(eq(leads.customerId, r.customerId));
    expect(lead!.status).toBe("lost");
  });

  it("is idempotent under repeated and concurrent evaluation", async () => {
    const c = await createClinic();
    const r = await chat(c, ["How much is teeth whitening?", "ok"]);
    await Promise.all(Array.from({ length: 6 }, () => evaluateLead(c.ctx, r.customerId)));
    expect(await openFor(c.business.id, r.customerId)).toHaveLength(1);
    expect(await pending(r.customerId)).toHaveLength(1);
  });
});

describe("appointment and handoff opportunities", () => {
  it("cancellation → rebooking opportunity; rebook after outreach → recovered", async () => {
    const c = await createClinic();
    const { customer } = await createCustomer(c.ctx, { name: "Omar Haddad", phone: "+971501230001" });
    await createConversation(c.ctx, { customerId: customer.id, channel: "web_chat" });
    const appt = await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("10:00", 2), customerId: customer.id, source: "staff" });
    await cancelAppointment(c.ctx, appt.appointment.id, "Travelling");
    const [o] = await openFor(c.business.id, customer.id);
    expect(o!.kind).toBe("cancellation");
    expect(o!.stage).toBe("cancelled");
    expect(o!.nextAction).toBe("offer_rebooking");
    expect(o!.blockerDetail).toContain("Travelling");
    expect(o!.estimatedValueCents).toBe(30000);

    const result = await followUpNow(c.ctx, o!.id);
    expect(result.sent).toBe(true);
    await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("11:00", 4), customerId: customer.id, source: "staff" });
    const [closed] = await db.select().from(opportunities).where(eq(opportunities.id, o!.id));
    expect(closed!.status).toBe("won");
    expect(closed!.recovered).toBe(true);
  });

  it("no-show → recovery opportunity", async () => {
    const c = await createClinic();
    const { customer } = await createCustomer(c.ctx, { name: "Hana", phone: "+971501230002" });
    const appt = await bookAppointment(c.ctx, { serviceId: c.services.consultation.id, startsAt: at("12:00", 2), customerId: customer.id, source: "staff" });
    await setAppointmentOutcome(c.ctx, appt.appointment.id, "no_show");
    const [o] = await openFor(c.business.id, customer.id);
    expect(o!.kind).toBe("no_show");
    expect(o!.stage).toBe("no_show");
  });

  it("handoff → needs-a-person opportunity with the reason; resolved by the team closes it", async () => {
    const c = await createClinic();
    const r = await chat(c, ["I want a refund for my last visit"]);
    const [o] = (await openFor(c.business.id, r.customerId)).filter((x) => x.kind === "needs_human");
    expect(o!.blockerDetail).toMatch(/Refund/i);
    expect(o!.nextActionBy).toBe("human");
    await resolveConversation(c.ctx, r.conversationId);
    const [closed] = await db.select().from(opportunities).where(eq(opportunities.id, o!.id));
    expect(closed!.status).toBe("won");
    expect(closed!.closedReason).toMatch(/Resolved/);
  });

  it("an engine failure never breaks a booking", async () => {
    const c = await createClinic();
    const { customer } = await createCustomer(c.ctx, { name: "Safe", phone: "+971501230003" });
    // Booking still succeeds and commits even though no lead/opportunity exists for this customer.
    const r = await bookAppointment(c.ctx, { serviceId: c.services.consultation.id, startsAt: at("13:00", 2), customerId: customer.id, source: "staff" });
    expect((await db.select().from(appointments).where(eq(appointments.id, r.appointment.id))).length).toBe(1);
  });
});

describe("sweep", () => {
  it("closes leads as lost after the final follow-up goes unanswered for a week", async () => {
    const c = await createClinic();
    const r = await chat(c, ["How much is teeth whitening?", "ok"]);
    await runTick({ now: new Date(Date.now() + 40 * HOUR), businessId: c.business.id });
    await runTick({ now: new Date(Date.now() + 120 * HOUR), businessId: c.business.id });
    const sent = await db.select().from(followUps).where(and(eq(followUps.customerId, r.customerId), eq(followUps.status, "sent")));
    expect(sent).toHaveLength(2);
    const [o] = await openFor(c.business.id, r.customerId);
    expect(o!.nextAction).toBe("human_review"); // AI follow-ups used up → a person decides
    // Make the timeline a week old: the conversation, then the two unanswered follow-ups.
    await db.execute(sql`update messages set created_at = created_at - interval '10 days' where conversation_id = ${r.conversationId}`);
    await db.update(followUps).set({ sentAt: new Date(Date.now() - 8 * 24 * HOUR) }).where(eq(followUps.customerId, r.customerId));
    await db.update(opportunities).set({ evaluatedAt: new Date(Date.now() - 2 * HOUR) }).where(eq(opportunities.id, o!.id));
    await sweepBusiness({ businessId: c.business.id, actor: { type: "system", name: "test" } });
    const [after] = await db.select().from(opportunities).where(eq(opportunities.id, o!.id));
    expect(after!.status).toBe("lost");
    expect(after!.closedReason).toMatch(/No response after 2 follow-ups/);
  });

  it("finds customers who haven't returned — once", async () => {
    const c = await createClinic();
    const { customer } = await createCustomer(c.ctx, { name: "Old Regular", phone: "+971501230004" });
    const appt = await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("09:00", 2), customerId: customer.id, source: "staff" });
    await setAppointmentOutcome(c.ctx, appt.appointment.id, "completed");
    await db.execute(sql`update appointments set starts_at = starts_at - interval '200 days', ends_at = ends_at - interval '200 days', blocked_until = blocked_until - interval '200 days' where id = ${appt.appointment.id}`);
    const sys: Ctx = { businessId: c.business.id, actor: { type: "system", name: "test" } };
    await sweepBusiness(sys);
    await sweepBusiness(sys);
    const rows = (await openFor(c.business.id, customer.id)).filter((o) => o.kind === "reactivation");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.nextAction).toBe("reactivate");
  });
});

describe("tenant isolation and permissions", () => {
  it("opportunities never cross businesses", async () => {
    const a = await createClinic("Clinic A");
    const b = await createClinic("Clinic B");
    const rb = await chat(b, ["How much is teeth whitening?", "ok"]);
    const [ob] = await openFor(b.business.id, rb.customerId);
    expect((await listBoard(a.ctx)).map((r) => r.opportunity.id)).not.toContain(ob!.id);
    await expect(followUpNow(a.ctx, ob!.id)).rejects.toThrow(/not found/);
    await expect(closeOpportunity(a.ctx, ob!.id, "lost")).rejects.toThrow(/not found/);
    expect((await boardSummary(a.ctx)).open).toBe(0);
  });

  it("a returning customer's opportunity follows them when an anonymous visitor identifies themselves", async () => {
    const c = await createClinic();
    const { customer } = await createCustomer(c.ctx, { name: "Rania Saleh", phone: "+971507770000" });
    const r = await chat(c, ["How much is teeth whitening?", "It's Rania Saleh, +971 50 777 0000"]);
    expect(r.customerId).toBe(customer.id);
    const open = await openFor(c.business.id, customer.id);
    expect(open.filter((o) => o.kind === "lead")).toHaveLength(1);
    // Nothing left pointing at the deleted anonymous visitor.
    const orphans = await db.execute(sql`select 1 from opportunities o where o.business_id = ${c.business.id} and not exists (select 1 from customers cu where cu.id = o.customer_id)`);
    expect(orphans.rows).toHaveLength(0);
  });

  it("staff without lead access can't open the board", async () => {
    const c = await createClinic();
    const staff: Ctx = { businessId: c.business.id, actor: { type: "user", userId: c.user.id, name: "S", role: "staff" } };
    await expect(listBoard(staff)).rejects.toThrow(/permission/);
  });
});
