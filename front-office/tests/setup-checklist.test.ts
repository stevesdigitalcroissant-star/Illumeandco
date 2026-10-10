/** The recovery setup checklist reflects real configuration and data. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleInbound } from "@/server/ai/orchestrator";
import { rotateWebhookSecret } from "@/server/integrations/connectors";
import { ingestEvent } from "@/server/integrations/ingest";
import { setupChecklist } from "@/server/recovery/setup";
import { addToWaitlist } from "@/server/recovery/slots";
import { updateAlertsConfig } from "@/server/services/alerts";
import { createCustomer } from "@/server/services/customers";
import { updateSenders } from "@/server/services/senders";
import { createClinic, localDate, visitor } from "./helpers";

afterEach(() => vi.unstubAllEnvs());
const state = async (c: Awaited<ReturnType<typeof createClinic>>) => Object.fromEntries((await setupChecklist(c.ctx)).map((i) => [i.key, i.done]));

describe("recovery setup checklist", () => {
  it("starts empty and ticks off as real setup happens", async () => {
    for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM", "RESEND_API_KEY", "EMAIL_FROM"]) vi.stubEnv(k, "");
    vi.stubEnv("APP_ENCRYPTION_KEY", "a".repeat(64));
    const c = await createClinic();
    await ingestEvent(c.business.id, { connector: "test", externalId: "t1", type: "call.missed", payload: { from: "+971501230770" } });
    const first = await setupChecklist(c.ctx); // test events don't count as a connected phone system
    expect(first.every((i) => !i.done)).toBe(true);
    expect(first.find((i) => i.key === "number")).toMatchObject({ needsOperator: true });
    expect(first.find((i) => i.key === "templates")).toBeUndefined(); // only when WhatsApp is available

    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "t");
    await updateSenders(c.ctx, { whatsappFrom: `+97154${String(Date.now()).slice(-7)}` });
    await rotateWebhookSecret(c.ctx);
    await ingestEvent(c.business.id, { connector: "webhook", externalId: "c1", type: "call.missed", payload: { from: "+971501230777" } });
    await ingestEvent(c.business.id, { connector: "webhook", externalId: "l1", type: "lead.created", payload: { email: "x@example.com" } });
    await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "Hi" });
    await updateAlertsConfig(c.ctx, { instant: true, digest: true, digestHour: 8, smsTo: "+971501230778", emailTo: "" });
    const { customer } = await createCustomer(c.ctx, { phone: "+971501230779" });
    await addToWaitlist(c.ctx, { customerId: customer.id, serviceId: c.services.cleaning.id, earliestDate: localDate(0), source: "staff" });

    expect(await state(c)).toEqual({ number: true, phone: true, forms: true, chat: true, alerts: true, waitlist: true, templates: false, win: false });
  });
});
