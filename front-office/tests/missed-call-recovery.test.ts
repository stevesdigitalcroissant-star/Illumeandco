/**
 * Revenue Recovery — integration layer + Missed Call Recovery.
 * Signed, idempotent event ingestion; the caller becomes an opportunity;
 * the AI texts back only when allowed and possible; honest outcomes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiSettings, conversations, customers, followUps, integrationEvents, opportunities } from "@/db/schema";
import { POST as webhookPOST } from "@/app/api/integrations/webhook/[key]/route";
import { POST as twilioStatusPOST } from "@/app/api/integrations/twilio-voice/[key]/status/route";
import { handleInbound } from "@/server/ai/orchestrator";
import { identityHash } from "@/server/channels/identity";
import { twilioSignature } from "@/server/channels/twilio";
import { rotateWebhookSecret } from "@/server/integrations/connectors";
import { decryptSecret, encryptSecret, verifyWebhookSignature, webhookSignature } from "@/server/integrations/crypto";
import { ingestEvent, retryPendingEvents } from "@/server/integrations/ingest";
import { normalizeTwilioCall } from "@/server/integrations/twilio-voice";
import { advanceMissedCalls, missedCallKey } from "@/server/recovery/missed-calls";
import { bookAppointment } from "@/server/services/appointments";
import { createConversation, takeOver } from "@/server/services/conversations";
import { createCustomer, updateCustomer } from "@/server/services/customers";
import { at, createClinic, setPermissions } from "./helpers";

const KEY = "a".repeat(64);
const HOUR = 3600_000;
type Clinic = Awaited<ReturnType<typeof createClinic>>;

let phoneSeq = 0;
const newPhone = () => `+9715${10_000_000 + phoneSeq++}`;

const openMissed = async (c: Clinic, customerId: string) =>
  db.query.opportunities.findFirst({ where: and(eq(opportunities.businessId, c.business.id), eq(opportunities.key, missedCallKey(customerId)), eq(opportunities.status, "open")) });
const customerByPhone = async (c: Clinic, phone: string) =>
  db.query.customers.findFirst({ where: and(eq(customers.businessId, c.business.id), eq(customers.phone, phone)) });
const textBacks = (customerId: string) => db.select().from(followUps).where(and(eq(followUps.customerId, customerId), eq(followUps.purpose, "missed_call")));

let seq = 0;
const missed = (c: Clinic, from: string, extra: Record<string, unknown> = {}, occurredAt = new Date()) =>
  ingestEvent(c.business.id, { connector: "webhook", externalId: `call-${Date.now()}-${seq++}`, type: "call.missed", occurredAt, payload: { from, ...extra } });

function signedRequest(key: string, secret: string, body: unknown, opts: { ts?: number; signature?: string } = {}) {
  const raw = JSON.stringify(body);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  return webhookPOST(
    new Request(`http://localhost/api/integrations/webhook/${key}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-afo-timestamp": ts, "x-afo-signature": opts.signature ?? webhookSignature(secret, ts, raw) },
      body: raw,
    }),
    { params: Promise.resolve({ key }) },
  );
}

/** Twilio SMS "configured" with the HTTP call mocked; returns the captured requests. */
function smsConfigured() {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-token");
  vi.stubEnv("TWILIO_SMS_FROM", "+15550001111");
  vi.stubEnv("TWILIO_WHATSAPP_FROM", "");
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
  vi.stubEnv("APP_ENCRYPTION_KEY", KEY);
  vi.stubEnv("TWILIO_ACCOUNT_SID", "");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "");
  vi.stubEnv("TWILIO_SMS_FROM", "");
  vi.stubEnv("TWILIO_WHATSAPP_FROM", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("integration security", () => {
  it("encrypts secrets at rest and refuses without a key", () => {
    const ct = encryptSecret("whsec_abc");
    expect(ct).not.toContain("whsec_abc");
    expect(decryptSecret(ct)).toBe("whsec_abc");
    vi.stubEnv("APP_ENCRYPTION_KEY", "b".repeat(64));
    expect(decryptSecret(ct)).toBeNull(); // a different key can't read it
    vi.stubEnv("APP_ENCRYPTION_KEY", "");
    expect(() => encryptSecret("x")).toThrow(/not configured/);
  });

  it("verifies webhook signatures with a replay window", () => {
    const now = Date.now();
    const ts = String(Math.floor(now / 1000));
    const sig = webhookSignature("s3cret", ts, "{}");
    expect(verifyWebhookSignature("s3cret", { timestamp: ts, signature: sig, body: "{}" }, now).ok).toBe(true);
    expect(verifyWebhookSignature("s3cret", { timestamp: ts, signature: `sha256=${sig}`, body: "{}" }, now).ok).toBe(true);
    expect(verifyWebhookSignature("s3cret", { timestamp: ts, signature: sig, body: '{"x":1}' }, now).ok).toBe(false);
    expect(verifyWebhookSignature("other", { timestamp: ts, signature: sig, body: "{}" }, now).ok).toBe(false);
    expect(verifyWebhookSignature("s3cret", { timestamp: ts, signature: sig, body: "{}" }, now + 6 * 60_000).ok).toBe(false);
    expect(verifyWebhookSignature("s3cret", { timestamp: null, signature: sig, body: "{}" }, now).ok).toBe(false);
  });

  it("webhook: configuration required, then signed + idempotent, and tenant-bound", async () => {
    const a = await createClinic("Clinic A");
    const b = await createClinic("Clinic B");
    const body = { id: "evt-1", type: "call.missed", data: { from: "+971501230001" } };

    const unconfigured = await signedRequest(a.business.publicKey, "anything", body);
    expect(unconfigured.status).toBe(503);

    const secretA = await rotateWebhookSecret(a.ctx);
    const secretB = await rotateWebhookSecret(b.ctx);
    const row = await db.query.integrations.findFirst({ where: (t, { eq }) => eq(t.businessId, a.business.id) });
    expect(row?.secretCiphertext).not.toContain(secretA); // stored encrypted

    expect((await signedRequest(a.business.publicKey, secretA, body, { signature: "0".repeat(64) })).status).toBe(401);
    expect((await signedRequest(a.business.publicKey, secretA, body, { ts: Math.floor(Date.now() / 1000) - 600 })).status).toBe(401);
    // Business B's secret cannot post events into business A.
    expect((await signedRequest(a.business.publicKey, secretB, body)).status).toBe(401);

    const ok = await signedRequest(a.business.publicKey, secretA, body);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ duplicate: false, status: "processed" });
    const again = await signedRequest(a.business.publicKey, secretA, body);
    expect(await again.json()).toMatchObject({ duplicate: true, status: "processed" });

    const evs = await db.select().from(integrationEvents).where(eq(integrationEvents.businessId, a.business.id));
    expect(evs).toHaveLength(1);
    const caller = await customerByPhone(a, "+971501230001");
    expect(caller).toBeTruthy();
    expect(await customerByPhone(b, "+971501230001")).toBeUndefined();
    const opps = await db.select().from(opportunities).where(and(eq(opportunities.businessId, a.business.id), eq(opportunities.kind, "missed_call")));
    expect(opps).toHaveLength(1);

    // Rotating invalidates the old secret.
    await rotateWebhookSecret(a.ctx);
    expect((await signedRequest(a.business.publicKey, secretA, { ...body, id: "evt-2" })).status).toBe(401);
  });

  it("stores unsupported or malformed events without acting on them", async () => {
    const c = await createClinic();
    const u = await ingestEvent(c.business.id, { connector: "webhook", externalId: "x1", type: "invoice.paid", payload: {} });
    expect(u.event.status).toBe("ignored");
    const bad = await ingestEvent(c.business.id, { connector: "webhook", externalId: "x2", type: "call.missed", payload: { from: 42 } });
    expect(bad.event.status).toBe("ignored");
    expect(bad.event.result).toMatch(/Invalid payload/);
    const withheld = await ingestEvent(c.business.id, { connector: "webhook", externalId: "x3", type: "call.missed", payload: { from: "anonymous" } });
    expect(withheld.event.status).toBe("ignored");
    expect(await db.select().from(opportunities).where(eq(opportunities.businessId, c.business.id))).toHaveLength(0);
  });

  it("retries events stranded before processing", async () => {
    const c = await createClinic();
    const phone = newPhone();
    const [ev] = await db
      .insert(integrationEvents)
      .values({ businessId: c.business.id, connector: "webhook", externalId: "stranded", type: "call.missed", occurredAt: new Date(), payload: { from: phone }, updatedAt: new Date(Date.now() - 5 * 60_000) })
      .returning();
    expect(await retryPendingEvents(new Date(), c.business.id)).toBe(1);
    const after = await db.query.integrationEvents.findFirst({ where: eq(integrationEvents.id, ev!.id) });
    expect(after?.status).toBe("processed");
    expect(await retryPendingEvents(new Date(), c.business.id)).toBe(0);
  });
});

describe("Missed Call Recovery", () => {
  it("without SMS configured: honest — the team is asked to call back, nothing is 'sent'", async () => {
    const c = await createClinic();
    const phone = newPhone();
    const r = await missed(c, phone, { reason: "no_answer", voicemailTranscript: "Hi, I'd like to book a cleaning" });
    expect(r.event.status).toBe("processed");
    expect(r.event.result).toMatch(/configuration required/);
    const caller = (await customerByPhone(c, phone))!;
    const o = (await openMissed(c, caller.id))!;
    expect(o).toMatchObject({ kind: "missed_call", nextActionBy: "human", nextAction: "human_review" });
    expect(o.nextActionLabel).toMatch(new RegExp(`Call back \\${phone}`));
    expect(o.evidence.map((e) => e.kind)).toEqual(expect.arrayContaining(["missed_call", "voicemail", "text_back_skipped"]));
    expect(await textBacks(caller.id)).toHaveLength(0);
  });

  it("matches an existing customer by phone", async () => {
    const c = await createClinic();
    const phone = newPhone();
    const { customer } = await createCustomer(c.ctx, { name: "Sara Ali", phone });
    await missed(c, phone);
    expect((await openMissed(c, customer.id))?.customerId).toBe(customer.id);
    expect(await db.select().from(customers).where(and(eq(customers.businessId, c.business.id), eq(customers.phone, phone)))).toHaveLength(1);
  });

  it("texts back via SMS; the reply threads into the same conversation and the AI takes over", async () => {
    const sent = smsConfigured();
    const c = await createClinic();
    const phone = newPhone();
    const r = await missed(c, phone);
    expect(r.event.result).toBe("Texted back via sms");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.get("To")).toBe(phone);
    expect(sent[0]!.get("Body")).toContain("Dubai Smile Clinic");

    const caller = (await customerByPhone(c, phone))!;
    const [f] = await textBacks(caller.id);
    expect(f).toMatchObject({ status: "sent", purpose: "missed_call" });
    const o = (await openMissed(c, caller.id))!;
    expect(o).toMatchObject({ stage: "waiting", nextActionBy: "ai", nextAction: "follow_up" });
    const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, o.conversationId!) });
    expect(conv).toMatchObject({ channel: "sms", channelIdentityHash: identityHash("sms", phone) });

    // Same caller again today: recorded, but never texted twice.
    await missed(c, phone);
    expect(sent).toHaveLength(1);
    const twice = (await openMissed(c, caller.id))!;
    expect(twice.title).toBe("Missed calls (2)");
    expect(twice.id).toBe(o.id);

    // The caller replies by SMS → same thread, AI receptionist answers, opportunity updated.
    const reply = await handleInbound({ businessId: c.business.id, channel: "sms", identity: phone, text: "Hi! How much is a cleaning?", contact: { phone } });
    expect(reply.conversationId).toBe(o.conversationId);
    expect(reply.reply).toMatch(/AED 300/);
    const after = (await openMissed(c, caller.id))!;
    expect(after.nextActionLabel).toMatch(/replied/);
    expect(after.nextAction).toBe("none");
  });

  it("guardrails: opted out, AI not allowed to message, text-back off, or a person owns the conversation", async () => {
    smsConfigured();
    const c = await createClinic();

    const p1 = newPhone();
    const { customer: optedOut } = await createCustomer(c.ctx, { phone: p1 });
    await updateCustomer(c.ctx, optedOut.id, { optedOut: true });
    expect((await missed(c, p1)).event.result).toMatch(/opted out/);

    await setPermissions(c.business.id, { send_messages: false });
    const p2 = newPhone();
    expect((await missed(c, p2)).event.result).toMatch(/isn't allowed to send messages/);
    await setPermissions(c.business.id, { send_messages: true });

    const p3 = newPhone();
    const { customer: owned } = await createCustomer(c.ctx, { phone: p3 });
    const conv = await createConversation(c.ctx, { customerId: owned.id, channel: "sms" });
    await takeOver(c.ctx, conv.id);
    expect((await missed(c, p3)).event.result).toMatch(/team member owns/);

    const s = await db.query.aiSettings.findFirst({ where: eq(aiSettings.businessId, c.business.id) });
    await db.update(aiSettings).set({ recovery: { ...s!.recovery, missedCall: { ...s!.recovery.missedCall, textBack: false } } }).where(eq(aiSettings.businessId, c.business.id));
    expect((await missed(c, newPhone())).event.result).toMatch(/turned off/);

    await db.update(aiSettings).set({ recovery: { ...s!.recovery, missedCall: { ...s!.recovery.missedCall, enabled: false } } }).where(eq(aiSettings.businessId, c.business.id));
    const off = await missed(c, newPhone());
    expect(off.event.status).toBe("ignored");

    const all = await db.select().from(followUps).where(and(eq(followUps.businessId, c.business.id), eq(followUps.purpose, "missed_call")));
    expect(all).toHaveLength(0);
  });

  it("an existing booking doesn't block the text-back (they may be calling about it)", async () => {
    const sent = smsConfigured();
    const c = await createClinic();
    const phone = newPhone();
    const { customer } = await createCustomer(c.ctx, { name: "Omar", phone });
    await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("11:00", 3), customerId: customer.id, source: "staff" });
    expect((await missed(c, phone)).event.result).toBe("Texted back via sms");
    expect(sent).toHaveLength(1);
  });

  it("a delayed event outside messaging hours is queued, not sent at night", async () => {
    smsConfigured();
    const c = await createClinic();
    // Reported at 23:00 local for a call 2 hours earlier.
    const now = new Date(at("23:00", 1));
    const r = await ingestEvent(c.business.id, { connector: "webhook", externalId: "late-1", type: "call.missed", occurredAt: new Date(now.getTime() - 2 * HOUR), payload: { from: newPhone() } }, now);
    expect(r.event.result).toMatch(/queued for/);
    const [f] = await db.select().from(followUps).where(and(eq(followUps.businessId, c.business.id), eq(followUps.purpose, "missed_call")));
    expect(f?.status).toBe("scheduled");
    expect(f!.scheduledFor.getTime()).toBeGreaterThan(now.getTime());
  });

  it("no reply → the team is asked to call; booking → won and credited as recovered", async () => {
    smsConfigured();
    const c = await createClinic();
    const phone = newPhone();
    await missed(c, phone);
    const caller = (await customerByPhone(c, phone))!;

    await advanceMissedCalls(c.ctx, new Date(Date.now() + 3 * HOUR));
    const escalated = (await openMissed(c, caller.id))!;
    expect(escalated).toMatchObject({ nextActionBy: "human", nextAction: "human_review" });
    expect(escalated.nextActionLabel).toMatch(/no reply to our text/);

    const booked = await bookAppointment(c.ctx, { serviceId: c.services.whitening.id, startsAt: at("10:00", 2), customerId: caller.id, source: "staff" });
    expect(await openMissed(c, caller.id)).toBeUndefined();
    const won = await db.query.opportunities.findFirst({ where: and(eq(opportunities.key, missedCallKey(caller.id)), eq(opportunities.status, "won")) });
    expect(won).toMatchObject({ recovered: true, recoveredValueCents: 65000, wonAppointmentId: booked.appointment.id });
  });

  it("a call that connects stands the AI down", async () => {
    const c = await createClinic();
    const phone = newPhone();
    await missed(c, phone);
    const caller = (await customerByPhone(c, phone))!;
    const r = await ingestEvent(c.business.id, { connector: "webhook", externalId: "cb-1", type: "call.completed", payload: { direction: "outbound", customer: phone } });
    expect(r.event.status).toBe("processed");
    const o = (await openMissed(c, caller.id))!;
    expect(o.nextAction).toBe("none");
    expect(o.nextActionLabel).toMatch(/Your team called them back/);
  });

  it("stale missed calls close as lost after 7 days", async () => {
    const c = await createClinic();
    const phone = newPhone();
    await missed(c, phone, {}, new Date(Date.now() - 8 * 24 * HOUR));
    const caller = (await customerByPhone(c, phone))!;
    await advanceMissedCalls(c.ctx, new Date(Date.now() + 8 * 24 * HOUR));
    const lost = await db.query.opportunities.findFirst({ where: eq(opportunities.key, missedCallKey(caller.id)) });
    expect(lost).toMatchObject({ status: "lost" });
  });
});

describe("Twilio Voice connector", () => {
  it("maps call outcomes", () => {
    expect(normalizeTwilioCall({ CallSid: "CA1", From: "+971501112222", DialCallStatus: "no-answer" })).toMatchObject({ type: "call.missed", payload: { reason: "no_answer" } });
    expect(normalizeTwilioCall({ CallSid: "CA1", From: "+971501112222", DialCallStatus: "canceled" })).toMatchObject({ type: "call.missed", payload: { reason: "abandoned" } });
    expect(normalizeTwilioCall({ CallSid: "CA1", From: "+971501112222", DialCallStatus: "completed" })).toMatchObject({ type: "call.completed" });
    expect(normalizeTwilioCall({ CallSid: "CA1", From: "+971501112222", CallStatus: "ringing" })).toBeNull();
    expect(normalizeTwilioCall({ From: "+971501112222", DialCallStatus: "busy" })).toBeNull();
  });

  it("verifies Twilio's signature, then records the missed call once", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-token");
    vi.stubEnv("APP_URL", "https://front.example");
    const c = await createClinic();
    const key = c.business.publicKey;
    const fields = { CallSid: `CA${Date.now()}`, From: newPhone(), To: "+97145550123", DialCallStatus: "no-answer" };
    const call = (signature: string) =>
      twilioStatusPOST(
        new Request(`http://localhost/api/integrations/twilio-voice/${key}/status`, { method: "POST", headers: { "x-twilio-signature": signature }, body: new URLSearchParams(fields) }),
        { params: Promise.resolve({ key }) },
      );
    expect((await call("bogus")).status).toBe(403);
    const sig = twilioSignature("twilio-token", `https://front.example/api/integrations/twilio-voice/${key}/status`, fields);
    expect((await call(sig)).status).toBe(200);
    expect((await call(sig)).status).toBe(200); // Twilio retry
    const evs = await db.select().from(integrationEvents).where(eq(integrationEvents.businessId, c.business.id));
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ connector: "twilio_voice", type: "call.missed", status: "processed" });
  });
});
