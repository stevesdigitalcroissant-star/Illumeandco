/** WhatsApp: free text only inside the 24h window, approved templates outside it, SMS as the fallback. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleInbound } from "@/server/ai/orchestrator";
import { createCustomer } from "@/server/services/customers";
import { deliverToCustomer } from "@/server/services/messaging";
import { updateSenders } from "@/server/services/senders";
import { updateWhatsappTemplates } from "@/server/services/whatsapp-templates";
import { createClinic } from "./helpers";

const SID = "HX" + "a".repeat(32);
let sent: URLSearchParams[] = [];
let seq = 0;
beforeEach(() => {
  sent = [];
  for (const k of ["TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM", "RESEND_API_KEY", "EMAIL_FROM"]) vi.stubEnv(k, "");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-token");
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => (sent.push(new URLSearchParams(String(init.body))), new Response("{}", { status: 201 }))));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function clinic(opts: { sms?: boolean } = {}) {
  const c = await createClinic();
  const n = String(Date.now() + seq++).slice(-7);
  await updateSenders(c.ctx, { whatsappFrom: `+97155${n}`, smsFrom: opts.sms ? `+97156${n}` : null });
  return c;
}
const vars = { customer_name: "Sara", business: "Dubai Smile Clinic", service: "cleaning" };

describe("WhatsApp delivery rules", () => {
  it("inside the 24h window: free text on WhatsApp", async () => {
    const c = await clinic();
    const r = await handleInbound({ businessId: c.business.id, channel: "whatsapp", identity: "+971507770001", text: "Hi", contact: { phone: "+971507770001" } });
    sent = [];
    const d = await deliverToCustomer(c.ctx, { customerId: r.customerId, text: "Following up!", whatsapp: { purpose: "follow_up", vars } });
    expect(d).toMatchObject({ ok: true, channel: "whatsapp" });
    expect(sent[0]!.get("Body")).toBe("Following up!");
    expect(sent[0]!.get("ContentSid")).toBeNull();
    expect(sent[0]!.get("To")).toBe("whatsapp:+971507770001");
  });

  it("outside the window: the approved template, with variables in order", async () => {
    const c = await clinic();
    await updateWhatsappTemplates(c.ctx, { follow_up: { contentSid: SID, variables: "customer_name, service" } });
    const { customer } = await createCustomer(c.ctx, { name: "Sara", phone: "+971507770002" });
    const d = await deliverToCustomer(c.ctx, { customerId: customer.id, text: "Following up!", whatsapp: { purpose: "follow_up", vars } });
    expect(d).toMatchObject({ ok: true, channel: "whatsapp" });
    expect(sent[0]!.get("ContentSid")).toBe(SID);
    expect(JSON.parse(sent[0]!.get("ContentVariables")!)).toEqual({ "1": "Sara", "2": "cleaning" });
    expect(sent[0]!.get("Body")).toBeNull();
  });

  it("outside the window without a template: falls back to SMS, and says so", async () => {
    const c = await clinic({ sms: true });
    const { customer } = await createCustomer(c.ctx, { phone: "+971507770003" });
    const d = await deliverToCustomer(c.ctx, { customerId: customer.id, text: "Hello", whatsapp: { purpose: "follow_up", vars } });
    expect(d).toMatchObject({ ok: true, channel: "sms" });
    expect(d.detail).toMatch(/Fell back to SMS \(WhatsApp: Outside WhatsApp's 24-hour window/);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.get("Body")).toBe("Hello");
  });

  it("no template and no SMS: not delivered, with the real reason", async () => {
    const c = await clinic();
    const { customer } = await createCustomer(c.ctx, { phone: "+971507770004" });
    const d = await deliverToCustomer(c.ctx, { customerId: customer.id, text: "Hello" });
    expect(d).toMatchObject({ ok: false });
    expect(d.detail).toMatch(/24-hour window and no approved template/);
    expect(sent).toHaveLength(0);
  });

  it("validates templates", async () => {
    const c = await clinic();
    await expect(updateWhatsappTemplates(c.ctx, { review: { contentSid: "nope", variables: "" } })).rejects.toThrow(/Content SID/);
    await expect(updateWhatsappTemplates(c.ctx, { missed_call: { contentSid: SID, variables: "review_link" } })).rejects.toThrow(/isn't available/);
    expect(await updateWhatsappTemplates(c.ctx, { review: { contentSid: SID, variables: "customer_name, review_link" }, reminder: { contentSid: "", variables: "" } })).toEqual({
      review: { contentSid: SID, variables: ["customer_name", "review_link"] },
    });
  });
});
