/** Plan limits: Starter < Growth < Pro for team size, locations, WhatsApp and slot recovery — enforced only when billing is on. */
import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { organizations, subscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedPlans } from "@/server/services/billing";
import { createBusiness } from "@/server/services/business";
import { createCustomer } from "@/server/services/customers";
import { deliverToCustomer } from "@/server/services/messaging";
import { assertCanAddLocation, planLimits } from "@/server/services/plan-limits";
import { updateSenders } from "@/server/services/senders";
import { inviteNewMember } from "@/server/services/team";
import { updateSlotConfig } from "@/server/recovery/slot-config";
import { offerSlot } from "@/server/recovery/slots";
import { createClinic } from "./helpers";

const number = () => `+9715${String(randomBytes(4).readUInt32BE() % 100_000_000).padStart(8, "0")}`;
const invite = (ctx: Parameters<typeof inviteNewMember>[0]) => inviteNewMember(ctx, { name: "Team Member", email: `m-${randomBytes(5).toString("hex")}@test.dev`, role: "staff" });
const SLOTS = { enabled: true, autoOffer: true, batchSize: 3, offerMinutes: 60, template: "A slot opened {{when}} — reply YES to book it." };

async function subscribe(organizationId: string, planId: string, status = "active") {
  await db.insert(subscriptions).values({ organizationId, planId, status }).onConflictDoUpdate({ target: subscriptions.organizationId, set: { planId, status } });
}

let sent: URLSearchParams[] = [];
beforeAll(() => seedPlans());
beforeEach(() => {
  for (const k of ["TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM", "RESEND_API_KEY", "EMAIL_FROM"]) vi.stubEnv(k, "");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-token");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_limits");
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => (sent.push(new URLSearchParams(String(init.body))), new Response("{}", { status: 201 }))));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("plan limits", () => {
  it("each plan gives more than the one below it", async () => {
    const c = await createClinic();
    const limits = [];
    for (const plan of ["starter", "growth", "pro"]) {
      await subscribe(c.organization.id, plan);
      limits.push(await planLimits(c.ctx));
    }
    const [s, g, p] = limits as [Awaited<ReturnType<typeof planLimits>>, Awaited<ReturnType<typeof planLimits>>, Awaited<ReturnType<typeof planLimits>>];
    expect(s).toMatchObject({ maxStaff: 3, maxLocations: 1, whatsapp: false, slotRecovery: false });
    expect(g).toMatchObject({ maxStaff: 10, maxLocations: 1, whatsapp: true, slotRecovery: true });
    expect(p).toMatchObject({ maxStaff: null, maxLocations: 3, whatsapp: true, slotRecovery: true });
  });

  it("team members: Starter allows 3 (owner included), Growth 10; nothing is limited when billing is off", async () => {
    const c = await createClinic();
    await subscribe(c.organization.id, "starter");
    await invite(c.ctx);
    await invite(c.ctx);
    await expect(invite(c.ctx)).rejects.toThrow(/Starter plan includes up to 3 team members\. Upgrade to Growth/);
    await subscribe(c.organization.id, "growth");
    await invite(c.ctx);
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    for (let i = 0; i < 8; i++) await invite(c.ctx);
  });

  it("locations: Starter and Growth have one, Pro up to three; demo businesses don't count", async () => {
    const c = await createClinic();
    await subscribe(c.organization.id, "growth");
    await createBusiness(c.organization.id, { name: "Demo", isDemo: true });
    await expect(assertCanAddLocation(c.organization.id)).rejects.toThrow(/1 location\. Upgrade to Pro/);
    await subscribe(c.organization.id, "pro");
    await assertCanAddLocation(c.organization.id);
    await createBusiness(c.organization.id, { name: "Branch 2" });
    await createBusiness(c.organization.id, { name: "Branch 3" });
    await expect(assertCanAddLocation(c.organization.id)).rejects.toThrow(/up to 3 locations/);
    // A brand-new organization can always create its first location.
    const [org] = await db.insert(organizations).values({ name: "New" }).returning();
    await assertCanAddLocation(org!.id);
  });

  it("WhatsApp: not on Starter (setting it is refused, an existing number isn't used); available on Growth", async () => {
    const c = await createClinic();
    const wa = number();
    await updateSenders(c.ctx, { smsFrom: number(), whatsappFrom: wa }); // set during the trial
    await subscribe(c.organization.id, "starter");
    await expect(updateSenders(c.ctx, { whatsappFrom: number() })).rejects.toThrow(/WhatsApp isn't included in the Starter plan\. Upgrade to Growth/);
    const customer = (await createCustomer(c.ctx, { phone: number() })).customer;
    const r = await deliverToCustomer(c.ctx, { customerId: customer.id, text: "Hello" });
    expect(r.channel).toBe("sms");
    expect(r.detail).toMatch(/WhatsApp: Not included in your plan/);
    await subscribe(c.organization.id, "growth");
    // On Growth WhatsApp is tried (here it needs an approved template outside the 24h window, so SMS is the fallback).
    expect((await deliverToCustomer(c.ctx, { customerId: customer.id, text: "Hello again" })).detail).not.toMatch(/Not included in your plan/);
  });

  it("slot recovery: not on Starter; on Growth and during the trial", async () => {
    const c = await createClinic();
    await updateSlotConfig(c.ctx, SLOTS); // trial
    await subscribe(c.organization.id, "starter");
    await expect(updateSlotConfig(c.ctx, SLOTS)).rejects.toThrow(/Slot recovery isn't included in the Starter plan\. Upgrade to Growth/);
    await expect(updateSlotConfig(c.ctx, { ...SLOTS, enabled: false })).resolves.toMatchObject({ enabled: false });
    await expect(offerSlot(c.ctx, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/isn't included/);
    await subscribe(c.organization.id, "growth");
    await expect(updateSlotConfig(c.ctx, SLOTS)).resolves.toMatchObject({ enabled: true });
  });

  it("after the trial ends without a plan, nothing new can be added", async () => {
    const c = await createClinic();
    await db.update(organizations).set({ createdAt: new Date(Date.now() - 6 * 86_400_000) }).where(eq(organizations.id, c.organization.id));
    await expect(invite(c.ctx)).rejects.toThrow(/free trial has ended/);
    await expect(updateSlotConfig(c.ctx, SLOTS)).rejects.toThrow(/free trial has ended/);
  });
});
