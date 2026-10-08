/** Staff alerts: things only a person can do reach the team — once, at a sensible hour, honestly reported. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiSettings, notifications } from "@/db/schema";
import { handleInbound } from "@/server/ai/orchestrator";
import { ingestEvent } from "@/server/integrations/ingest";
import { composeDigest, deliverPendingAlerts, notifyStaff, sendDigests, updateAlertsConfig } from "@/server/services/alerts";
import { getBusiness } from "@/server/services/business";
import { updateSenders } from "@/server/services/senders";
import { at, createClinic, setPermissions, visitor } from "./helpers";

type Clinic = Awaited<ReturnType<typeof createClinic>>;
let sent: URLSearchParams[] = [];
function sms() {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-token");
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => (sent.push(new URLSearchParams(String(init.body))), new Response("{}", { status: 201 }))));
}
beforeEach(() => {
  sent = [];
  for (const k of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM", "RESEND_API_KEY", "EMAIL_FROM", "APP_URL"]) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function withTeam(c: Clinic, phones = "+971501110001, +971501110002") {
  await updateAlertsConfig(c.ctx, { instant: true, digest: true, digestHour: 8, smsTo: phones, emailTo: "" });
  await updateSenders(c.ctx, { smsFrom: `+9715${String(Date.now()).slice(-8)}` });
}
const notes = (c: Clinic, kind?: string) => db.select().from(notifications).where(and(eq(notifications.businessId, c.business.id), kind ? eq(notifications.kind, kind) : undefined));

describe("staff alerts", () => {
  it("texts the team from the business number, once per key", async () => {
    sms();
    const c = await createClinic();
    await withTeam(c);
    const n = { kind: "test", title: "Call back Sara", body: "No reply to our text", link: "/app/opportunities", dedupeKey: "k1", urgent: true };
    await notifyStaff(c.ctx, n, at("10:00", 1));
    await notifyStaff(c.ctx, n, at("10:01", 1));
    expect(await notes(c, "test")).toHaveLength(1);
    const from = (await getBusiness(c.ctx)).smsFrom;
    expect(sent.map((s) => [s.get("From"), s.get("To")])).toEqual([[from, "+971501110001"], [from, "+971501110002"]]);
    expect(sent[0]!.get("Body")).toBe("Dubai Smile Clinic: Call back Sara — No reply to our text.");
    expect((await notes(c, "test"))[0]).toMatchObject({ alertResult: "Sent to 2" });
  });

  it("waits for the morning outside 07:00–22:00, then the tick sends it", async () => {
    sms();
    const c = await createClinic();
    await withTeam(c, "+971501110003");
    await notifyStaff(c.ctx, { kind: "test", title: "Night alert", urgent: true, dedupeKey: "night" }, at("23:30", 1));
    expect(sent).toHaveLength(0);
    expect((await notes(c, "test"))[0]?.alertedAt).toBeNull();
    expect(await deliverPendingAlerts(at("07:30", 2), c.business.id)).toBe(1);
    expect(sent).toHaveLength(1);
    expect(await deliverPendingAlerts(at("07:35", 2), c.business.id)).toBe(0); // never twice
  });

  it("inside a transaction the text is left for the tick (it can't be rolled back)", async () => {
    sms();
    const c = await createClinic();
    await withTeam(c, "+971501110004");
    await db.transaction((tx) => notifyStaff({ ...c.ctx, tx }, { kind: "test", title: "In tx", urgent: true, dedupeKey: "tx" }, at("10:00", 1)));
    expect(sent).toHaveLength(0);
    await deliverPendingAlerts(at("10:05", 1), c.business.id);
    expect(sent).toHaveLength(1);
  });

  it("is honest when it can't alert anyone", async () => {
    const c = await createClinic();
    await notifyStaff(c.ctx, { kind: "a", title: "No recipients", urgent: true, dedupeKey: "a" }, at("10:00", 1));
    expect((await notes(c, "a"))[0]?.alertResult).toMatch(/No alert recipients/);
    await updateAlertsConfig(c.ctx, { instant: true, digest: false, digestHour: 8, smsTo: "+971501110005", emailTo: "" });
    await notifyStaff(c.ctx, { kind: "b", title: "No SMS", urgent: true, dedupeKey: "b" }, at("10:00", 1));
    expect((await notes(c, "b"))[0]?.alertResult).toMatch(/Not sent — SMS isn't configured \(configuration required\)/);
    await notifyStaff(c.ctx, { kind: "c", title: "Not urgent", dedupeKey: "c" }, at("10:00", 1));
    expect((await notes(c, "c"))[0]).toMatchObject({ urgent: false, alertResult: null });
  });

  it("missed calls, handoffs and new leads that need a person raise urgent alerts", async () => {
    const c = await createClinic();
    await ingestEvent(c.business.id, { connector: "webhook", externalId: "mc1", type: "call.missed", payload: { from: "+971502220099" } });
    const [mc] = await notes(c, "missed_call");
    expect(mc).toMatchObject({ urgent: true, link: "/app/opportunities?kind=missed_call" });
    expect(mc!.title).toMatch(/call back \+971502220099/);
    await ingestEvent(c.business.id, { connector: "webhook", externalId: "mc2", type: "call.missed", payload: { from: "+971502220099" } });
    expect(await notes(c, "missed_call")).toHaveLength(1); // same caller, same day

    await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "I want to speak to a person" });
    expect((await notes(c, "handoff"))[0]).toMatchObject({ urgent: true });

    await ingestEvent(c.business.id, { connector: "webhook", externalId: "l1", type: "lead.created", payload: { name: "Mona", email: "mona@example.com", service: "whitening" } });
    const [lead] = await notes(c, "new_lead");
    expect(lead!.title).toBe("New lead — Mona (Teeth whitening)");
  });

  it("morning summary: once a day, after the chosen hour", async () => {
    sms();
    const c = await createClinic();
    await withTeam(c, "+971501110006");
    await setPermissions(c.business.id, { send_messages: false }); // so the missed call needs a person
    await ingestEvent(c.business.id, { connector: "webhook", externalId: "mc3", type: "call.missed", payload: { from: "+971502220098" } });
    sent = [];
    expect(await sendDigests(at("07:00", 1), c.business.id)).toBe(0);
    expect(await sendDigests(at("08:10", 1), c.business.id)).toBe(1);
    expect(await sendDigests(at("09:00", 1), c.business.id)).toBe(0);
    const body = sent.at(-1)!.get("Body")!;
    expect(body).toMatch(/Good morning from Dubai Smile Clinic/);
    expect(body).toMatch(/1 thing needs you:\n• \+971502220098 — Missed call/);
    const text = await composeDigest(c.ctx, await getBusiness(c.ctx), at("08:10", 1));
    expect(text).toMatch(/no bookings recovered yet/);
  });

  it("validates recipients and is owner/manager only", async () => {
    const c = await createClinic();
    await expect(updateAlertsConfig(c.ctx, { instant: true, digest: true, digestHour: 8, smsTo: "0501234567", emailTo: "" })).rejects.toThrow(/international format/);
    await expect(updateAlertsConfig(c.ctx, { instant: true, digest: true, digestHour: 8, smsTo: "", emailTo: "not-an-email" })).rejects.toThrow(/valid email/);
    await expect(updateAlertsConfig({ ...c.ctx, actor: { ...c.ctx.actor, role: "staff" } as typeof c.ctx.actor }, { instant: true, digest: true, digestHour: 8, smsTo: "", emailTo: "" })).rejects.toThrow();
    const saved = await updateAlertsConfig(c.ctx, { instant: false, digest: true, digestHour: 7, smsTo: "+971 50 111 0007; +971501110007", emailTo: "Desk@Clinic.com" });
    expect(saved).toMatchObject({ smsTo: ["+971501110007"], emailTo: ["desk@clinic.com"], digestHour: 7 });
    expect((await db.query.aiSettings.findFirst({ where: eq(aiSettings.businessId, c.business.id) }))?.alerts.instant).toBe(false);
  });
});
