/** Prepaid top-ups: used only after the monthly allowance, idempotent, per organization, granted by a verified Stripe payment. */
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { notifications, organizations, plans, subscriptions, usageCredits } from "@/db/schema";
import { handleInbound } from "@/server/ai/orchestrator";
import type { ModelProvider } from "@/server/ai/providers/types";
import { DEFAULT_PLANS, handleStripeWebhook, seedPlans } from "@/server/services/billing";
import { creditBalance, CREDIT_PACKS, createCreditCheckout, grantPack, spendCredit } from "@/server/services/credits";
import { createCustomer } from "@/server/services/customers";
import { deliverToCustomer } from "@/server/services/messaging";
import { updateSenders } from "@/server/services/senders";
import { createClinic, visitor } from "./helpers";

const TINY = "test-tiny-credits";
const paid: ModelProvider = {
  id: "anthropic",
  label: "test",
  isConfigured: () => true,
  async run() {
    return { text: "We're open 9 to 6.", stopReason: "end_turn", model: "test-model", usage: { inputTokens: 100, outputTokens: 50 } };
  },
};
const number = () => `+9715${String(randomBytes(4).readUInt32BE() % 100_000_000).padStart(8, "0")}`;
const chat = (businessId: string, identity = visitor(), text = "Hi, when are you open?") => handleInbound({ businessId, channel: "web_chat", identity, text }, { provider: paid });

let sendOk = true;
beforeAll(async () => {
  await seedPlans();
  await db
    .insert(plans)
    .values({ id: TINY, name: "Tiny", priceMonthlyCents: 100, currency: "USD", features: [], entitlements: { maxLocations: 1, maxStaff: 5, followUps: true, advancedAnalytics: false, channels: ["sms"], voice: false, aiConversationsPerMonth: 1, textsPerMonth: 1 }, active: false })
    .onConflictDoNothing();
});
beforeEach(() => {
  for (const k of ["TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM", "RESEND_API_KEY", "EMAIL_FROM"]) vi.stubEnv(k, "");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-token");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_credits");
  sendOk = true;
  vi.stubGlobal("fetch", vi.fn(async () => (sendOk ? new Response("{}", { status: 201 }) : new Response('{"message":"carrier error"}', { status: 400 }))));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function onTinyPlan() {
  const c = await createClinic();
  await db.insert(subscriptions).values({ organizationId: c.organization.id, planId: TINY, status: "active" });
  return c;
}

describe("credit packs", () => {
  it("keep ≥50% margin at cautious costs, and cost more per conversation than any plan", () => {
    for (const p of CREDIT_PACKS) {
      expect((p.aiConversations * 10 + p.texts * 5) / p.priceCents).toBeLessThanOrEqual(0.5);
      for (const plan of DEFAULT_PLANS) expect(p.priceCents / p.aiConversations).toBeGreaterThan(plan.priceMonthlyCents / plan.entitlements.aiConversationsPerMonth!);
    }
  });

  it("are granted once per payment and never for an unknown pack", async () => {
    const c = await createClinic();
    await grantPack(c.organization.id, "topup_small", "cs_1");
    await grantPack(c.organization.id, "topup_small", "cs_1");
    expect(await creditBalance(c.organization.id, "ai")).toBe(100);
    expect(await creditBalance(c.organization.id, "texts")).toBe(50);
    await expect(grantPack(c.organization.id, "free_lunch", "cs_2")).rejects.toThrow(/Unknown/);
  });
});

describe("AI conversations past the allowance", () => {
  it("use one credit per new conversation; a continuing conversation doesn't spend again; then the team takes over", async () => {
    const c = await onTinyPlan();
    await chat(c.business.id); // the plan's 1 conversation
    await grantPack(c.organization.id, "topup_small", "cs_ai");
    await db.insert(usageCredits).values({ organizationId: c.organization.id, kind: "ai", delta: -99, reason: "adjustment", ref: "leave-1" });

    const id = visitor();
    const second = await chat(c.business.id, id);
    expect(second.turn?.provider).toBe("anthropic");
    await chat(c.business.id, id, "And on Saturday?");
    expect(await creditBalance(c.organization.id, "ai")).toBe(0);

    const third = await chat(c.business.id);
    expect(third.turn?.provider).toBe("allowance");
    const alerts = await db.select().from(notifications).where(and(eq(notifications.businessId, c.business.id), eq(notifications.kind, "allowance")));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.body).toMatch(/top-up/);
  });

  it("aren't usable without an active plan, and never cross organizations", async () => {
    const a = await onTinyPlan();
    const b = await onTinyPlan();
    await grantPack(a.organization.id, "topup_small", "cs_a");
    await chat(b.business.id);
    expect((await chat(b.business.id)).turn?.provider).toBe("allowance"); // B has no credits
    expect(await spendCredit(b.ctx, "ai", "x")).toBe(false);

    await db.update(subscriptions).set({ status: "canceled" }).where(eq(subscriptions.organizationId, a.organization.id));
    await db.update(organizations).set({ createdAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(organizations.id, a.organization.id));
    expect((await chat(a.business.id)).turn?.provider).toBe("allowance");
    expect(await creditBalance(a.organization.id, "ai")).toBe(100); // kept for when they resubscribe
    await expect(createCreditCheckout(a.ctx, "topup_small", { email: "o@test.dev" })).rejects.toThrow(/Choose a plan first/);
  });
});

describe("texts past the allowance", () => {
  it("use a credit only when the text is actually sent", async () => {
    const c = await onTinyPlan();
    await updateSenders(c.ctx, { smsFrom: number() });
    const cust = (await createCustomer(c.ctx, { phone: number() })).customer;
    expect((await deliverToCustomer(c.ctx, { customerId: cust.id, text: "1" })).channel).toBe("sms"); // the plan's 1 text
    expect((await deliverToCustomer(c.ctx, { customerId: cust.id, text: "2" })).ok).toBe(false);

    await grantPack(c.organization.id, "topup_small", "cs_t");
    sendOk = false;
    expect((await deliverToCustomer(c.ctx, { customerId: cust.id, text: "3" })).ok).toBe(false);
    expect(await creditBalance(c.organization.id, "texts")).toBe(50);
    sendOk = true;
    expect((await deliverToCustomer(c.ctx, { customerId: cust.id, text: "4" })).channel).toBe("sms");
    expect(await creditBalance(c.organization.id, "texts")).toBe(49);
  });
});

describe("Stripe webhook", () => {
  it("grants a paid top-up once, from a correctly signed event only", async () => {
    const c = await createClinic();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const session = (status: string, id = `cs_${randomUUID()}`) =>
      JSON.stringify({
        id: `evt_${randomUUID()}`,
        object: "event",
        type: "checkout.session.completed",
        data: { object: { id, object: "checkout.session", payment_status: status, metadata: { kind: "credit_pack", organizationId: c.organization.id, packId: "topup_large" } } },
      });
    const sign = (body: string, secret = "whsec_test") => new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload: body, secret });

    const body = session("paid", "cs_paid");
    expect(await handleStripeWebhook(body, sign(body))).toEqual({ handled: true });
    expect(await handleStripeWebhook(body, sign(body))).toEqual({ handled: true }); // retried delivery
    expect(await creditBalance(c.organization.id, "ai")).toBe(300);
    expect(await creditBalance(c.organization.id, "texts")).toBe(150);

    const unpaid = session("unpaid");
    expect(await handleStripeWebhook(unpaid, sign(unpaid))).toEqual({ handled: false });
    const forged = session("paid");
    await expect(handleStripeWebhook(forged, sign(forged, "whsec_wrong"))).rejects.toThrow();
    expect(await creditBalance(c.organization.id, "ai")).toBe(300);
  });
});
