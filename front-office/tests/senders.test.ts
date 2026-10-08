/** Per-business messaging numbers: each business sends from — and receives on — its own number. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { POST as twilioPOST } from "@/app/api/channels/twilio/[key]/route";
import { channelsFor } from "@/server/channels/registry";
import { twilioSignature } from "@/server/channels/twilio";
import { createCustomer } from "@/server/services/customers";
import { deliverToCustomer } from "@/server/services/messaging";
import { ownsNumber, updateSenders } from "@/server/services/senders";
import { createClinic } from "./helpers";

let sent: URLSearchParams[] = [];
beforeEach(() => {
  for (const k of ["TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM", "RESEND_API_KEY", "EMAIL_FROM"]) vi.stubEnv(k, "");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-token");
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => (sent.push(new URLSearchParams(String(init.body))), new Response("{}", { status: 201 }))));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("per-business senders", () => {
  it("each business texts from its own number", async () => {
    const a = await createClinic("A");
    const b = await createClinic("B");
    await updateSenders(a.ctx, { smsFrom: "+971 50 000 0001" });
    await updateSenders(b.ctx, { smsFrom: "+971500000002" });
    const ca = (await createCustomer(a.ctx, { phone: "+971509990001" })).customer;
    const cb = (await createCustomer(b.ctx, { phone: "+971509990002" })).customer;
    expect((await deliverToCustomer(a.ctx, { customerId: ca.id, text: "hi" })).channel).toBe("sms");
    await deliverToCustomer(b.ctx, { customerId: cb.id, text: "hi" });
    expect(sent.map((s) => s.get("From"))).toEqual(["+971500000001", "+971500000002"]);
  });

  it("falls back to the platform's shared number (flagged), and has nothing without credentials", async () => {
    const c = await createClinic();
    expect(channelsFor(c.business).size).toBe(0);
    vi.stubEnv("TWILIO_SMS_FROM", "+15550001111");
    expect(channelsFor(c.business).get("sms")).toEqual({ from: "+15550001111", shared: true });
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    expect(channelsFor({ smsFrom: "+971500000009", whatsappFrom: null }).size).toBe(0);
  });

  it("a number belongs to one business; formats are validated", async () => {
    const a = await createClinic("A");
    const b = await createClinic("B");
    await updateSenders(a.ctx, { smsFrom: "+971500000011" });
    await expect(updateSenders(b.ctx, { smsFrom: "+971500000011" })).rejects.toThrow(/another business/);
    await expect(updateSenders(b.ctx, { smsFrom: "0501234567" })).rejects.toThrow(/international format/);
    expect((await updateSenders(b.ctx, { whatsappFrom: "whatsapp:+971500000012" })).whatsappFrom).toBe("+971500000012");
    const staff = { ...a.ctx, actor: { ...a.ctx.actor, role: "staff" as const } };
    await expect(updateSenders(staff, { smsFrom: "+971500000013" })).rejects.toThrow();
  });

  it("inbound messages to a number the business doesn't own are ignored", async () => {
    vi.stubEnv("APP_URL", "https://front.example");
    const c = await createClinic();
    await updateSenders(c.ctx, { smsFrom: "+971500000021" });
    expect(ownsNumber({ smsFrom: "+971500000021", whatsappFrom: null }, "+971500000021", false)).toBe(true);
    expect(ownsNumber({ smsFrom: null, whatsappFrom: null }, "+1", false)).toBe(true);
    const post = (to: string) => {
      const fields = { From: "+971509990021", To: to, Body: "Hi, how much is a cleaning?" };
      const sig = twilioSignature("twilio-token", `https://front.example/api/channels/twilio/${c.business.publicKey}`, fields);
      return twilioPOST(new Request("http://x/api", { method: "POST", headers: { "x-twilio-signature": sig }, body: new URLSearchParams(fields) }), { params: Promise.resolve({ key: c.business.publicKey }) });
    };
    await post("+971500000099");
    expect(await db.select().from(conversations).where(and(eq(conversations.businessId, c.business.id), eq(conversations.channel, "sms")))).toHaveLength(0);
    const ok = await post("+971500000021");
    expect(await ok.text()).toMatch(/AED 300/);
  });
});
