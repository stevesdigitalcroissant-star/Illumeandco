/**
 * Revenue Recovery — Lead Recovery.
 * Leads from forms/ads/tools become pipeline leads; the first message goes out
 * in seconds only when allowed and possible; the engine takes over after.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, followUps, leads, opportunities } from "@/db/schema";
import { handleInbound } from "@/server/ai/orchestrator";
import { ingestEvent } from "@/server/integrations/ingest";
import { matchService } from "@/server/recovery/leads";
import { bookAppointment } from "@/server/services/appointments";
import { createCustomer, updateCustomer } from "@/server/services/customers";
import { at, createClinic, setPermissions } from "./helpers";

type Clinic = Awaited<ReturnType<typeof createClinic>>;
let seq = 0;
const lead = (c: Clinic, data: Record<string, unknown>, occurredAt = new Date(), now = new Date()) =>
  ingestEvent(c.business.id, { connector: "webhook", externalId: `lead-${Date.now()}-${seq++}`, type: "lead.created", occurredAt, payload: { source: "website form", ...data } }, now);
const leadOpp = (c: Clinic, customerId: string) =>
  db.query.opportunities.findFirst({ where: and(eq(opportunities.businessId, c.business.id), eq(opportunities.key, `lead:${customerId}`), eq(opportunities.status, "open")) });
const byEmail = (c: Clinic, email: string) => db.query.customers.findFirst({ where: and(eq(customers.businessId, c.business.id), eq(customers.email, email)) });
const touches = (customerId: string) => db.select().from(followUps).where(and(eq(followUps.customerId, customerId), eq(followUps.purpose, "first_touch")));

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

describe("Lead Recovery", () => {
  it("matches services by name, conservatively", async () => {
    const c = await createClinic();
    expect((await matchService(c.ctx, "teeth whitening"))?.id).toBe(c.services.whitening.id);
    expect((await matchService(c.ctx, "Whitening"))?.id).toBe(c.services.whitening.id);
    expect(await matchService(c.ctx, "Invisalign")).toBeNull();
    expect(await matchService(c.ctx, "%")).toBeNull();
  });

  it("without a channel: lead + opportunity recorded, the team is asked to reach out, nothing claimed as sent", async () => {
    const c = await createClinic();
    const r = await lead(c, { name: "Sara Ahmed", email: "sara@example.com", service: "Teeth whitening", message: "Is whitening safe for sensitive teeth?" });
    expect(r.event.status).toBe("processed");
    expect(r.event.result).toMatch(/No first message: .*configuration required/);
    const customer = (await byEmail(c, "sara@example.com"))!;
    expect(customer.name).toBe("Sara Ahmed");
    const l = await db.query.leads.findFirst({ where: eq(leads.customerId, customer.id) });
    expect(l).toMatchObject({ source: "website form", serviceId: c.services.whitening.id, status: "new" });
    expect(l!.notes).toContain("sensitive teeth");
    const o = (await leadOpp(c, customer.id))!;
    expect(o).toMatchObject({ kind: "lead", nextActionBy: "human", nextAction: "human_review", estimatedValueCents: 65000 });
    expect(o.nextActionLabel).toMatch(/haven't heard from you/);
    expect(o.evidence.some((e) => e.kind === "lead_source" && e.detail.includes("sensitive teeth"))).toBe(true);
    expect(r.event.opportunityId).toBe(o.id);
    expect(await touches(customer.id)).toHaveLength(0);
  });

  it("speed to lead: first SMS in seconds, then the engine follows up; the reply goes to the AI and books", async () => {
    const sent = smsConfigured();
    const c = await createClinic();
    const r = await lead(c, { name: "Maya", phone: "+971502220001", email: "maya@example.com", service: "cleaning" });
    expect(r.event.result).toBe("First message sent via sms");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.get("Body")).toMatch(/^Hi Maya, thanks for your enquiry about cleaning at Dubai Smile Clinic!/);

    const customer = (await byEmail(c, "maya@example.com"))!;
    const [t] = await touches(customer.id);
    expect(t).toMatchObject({ status: "sent", attempt: 1 });
    expect((await db.query.leads.findFirst({ where: eq(leads.customerId, customer.id) }))?.status).toBe("contacted");

    // The engine queued a lead follow-up (doesn't count the first touch as an attempt).
    const o = (await leadOpp(c, customer.id))!;
    expect(o.nextActionBy).toBe("ai");
    const pending = await db.select().from(followUps).where(and(eq(followUps.customerId, customer.id), eq(followUps.status, "scheduled")));
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ purpose: "lead", attempt: 1 });

    // Their SMS reply lands in the same thread; the follow-up is cancelled because they replied.
    const reply = await handleInbound({ businessId: c.business.id, channel: "sms", identity: "+971502220001", text: "How much is it?", contact: { phone: "+971502220001" } });
    expect(reply.conversationId).toBe(o.conversationId);
    expect(reply.reply).toMatch(/AED 300/);
  });

  it("deduplicates: same person twice → one customer, one lead, one first message", async () => {
    const sent = smsConfigured();
    const c = await createClinic();
    const { customer: existing } = await createCustomer(c.ctx, { phone: "+971502220002" });
    await lead(c, { name: "Ali", phone: "+971 50 222 0002", email: "ali@example.com" });
    await lead(c, { name: "Ali", phone: "+971502220002", service: "consultation" });
    const rows = await db.select().from(customers).where(and(eq(customers.businessId, c.business.id), eq(customers.phone, "+971502220002")));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: existing.id, name: "Ali", email: "ali@example.com" }); // gaps filled
    expect(await db.select().from(leads).where(eq(leads.customerId, existing.id))).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("guardrails: opted out, already booked, no permission, first message off, person owns the conversation", async () => {
    smsConfigured();
    const c = await createClinic();
    const { customer: out } = await createCustomer(c.ctx, { phone: "+971502220010" });
    await updateCustomer(c.ctx, out.id, { optedOut: true });
    expect((await lead(c, { phone: "+971502220010" })).event.result).toMatch(/opted out/);

    const { customer: booked } = await createCustomer(c.ctx, { phone: "+971502220011" });
    await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("11:00", 3), customerId: booked.id, source: "staff" });
    expect((await lead(c, { phone: "+971502220011" })).event.result).toMatch(/already have an appointment/);

    await setPermissions(c.business.id, { send_messages: false });
    expect((await lead(c, { phone: "+971502220012" })).event.result).toMatch(/isn't allowed to send/);
    await setPermissions(c.business.id, { send_messages: true });

    const { aiSettings } = await import("@/db/schema");
    const s = await db.query.aiSettings.findFirst({ where: eq(aiSettings.businessId, c.business.id) });
    await db.update(aiSettings).set({ recovery: { ...s!.recovery, leads: { ...s!.recovery.leads, firstTouch: false } } }).where(eq(aiSettings.businessId, c.business.id));
    expect((await lead(c, { phone: "+971502220013" })).event.result).toMatch(/turned off/);
    await db.update(aiSettings).set({ recovery: { ...s!.recovery, leads: { ...s!.recovery.leads, enabled: false } } }).where(eq(aiSettings.businessId, c.business.id));
    expect((await lead(c, { phone: "+971502220014" })).event.status).toBe("ignored");

    const all = await db.select().from(followUps).where(and(eq(followUps.businessId, c.business.id), eq(followUps.purpose, "first_touch")));
    expect(all).toHaveLength(0);
  });

  it("a lead reported late at night is answered in messaging hours", async () => {
    smsConfigured();
    const c = await createClinic();
    const now = at("23:30", 1);
    const r = await lead(c, { phone: "+971502220020", email: "late@example.com" }, new Date(now.getTime() - 3 * 3600_000), now);
    expect(r.event.result).toMatch(/queued/);
    const customer = (await byEmail(c, "late@example.com"))!;
    const o = (await leadOpp(c, customer.id))!;
    expect(o.nextActionBy).toBe("ai");
    expect(o.nextActionLabel).toMatch(/AI sends the first message/);
  });

  it("rejects leads with no way to reach them", async () => {
    const c = await createClinic();
    const r = await ingestEvent(c.business.id, { connector: "webhook", externalId: "nocontact", type: "lead.created", payload: { name: "Ghost" } });
    expect(r.event.status).toBe("ignored");
    expect(r.event.result).toMatch(/email or phone/);
  });
});
