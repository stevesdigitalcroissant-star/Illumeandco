/** Monthly allowances: AI conversations and automated texts per plan, enforced only when billing is on. */
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, conversations, notifications, organizations, plans, subscriptions } from "@/db/schema";
import { handleInbound } from "@/server/ai/orchestrator";
import type { ModelProvider } from "@/server/ai/providers/types";
import { aiConversationAllowed, allowanceFor, automatedTextAllowed, monthlyUsage, periodStart } from "@/server/services/allowance";
import { DEFAULT_PLANS, seedPlans, TRIAL_ALLOWANCE } from "@/server/services/billing";
import { createCustomer } from "@/server/services/customers";
import { deliverToCustomer } from "@/server/services/messaging";
import { updateSenders } from "@/server/services/senders";
import { createClinic, visitor } from "./helpers";

const TINY = "test-tiny";
const paid: ModelProvider = {
  id: "anthropic",
  label: "test",
  isConfigured: () => true,
  async run() {
    return { text: "We're open 9 to 6.", stopReason: "end_turn", model: "claude-opus-5-5", usage: { inputTokens: 100, outputTokens: 50 } };
  },
};
const number = () => `+9715${String(randomBytes(4).readUInt32BE() % 100_000_000).padStart(8, "0")}`;

let sent: URLSearchParams[] = [];
beforeAll(async () => {
  await seedPlans();
  await db
    .insert(plans)
    .values({ id: TINY, name: "Tiny (test)", priceMonthlyCents: 100, currency: "USD", features: [], entitlements: { maxLocations: 1, maxStaff: 1, followUps: true, advancedAnalytics: false, channels: [], voice: false, aiConversationsPerMonth: 2, textsPerMonth: 1 }, active: false })
    .onConflictDoNothing();
});
beforeEach(() => {
  for (const k of ["TWILIO_SMS_FROM", "TWILIO_WHATSAPP_FROM", "RESEND_API_KEY", "EMAIL_FROM", "TWILIO_ALERT_FROM"]) vi.stubEnv(k, "");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-token");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_allowance");
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => (sent.push(new URLSearchParams(String(init.body))), new Response("{}", { status: 201 }))));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function subscribe(organizationId: string, planId: string, status = "active") {
  await db.insert(subscriptions).values({ organizationId, planId, status }).onConflictDoUpdate({ target: subscriptions.organizationId, set: { planId, status } });
}

describe("plans", () => {
  it("are in USD, and each plan's allowance fits its price at cautious costs ($0.10/conversation, $0.05/text) with ≥60% margin", () => {
    for (const p of DEFAULT_PLANS) {
      expect(p.currency).toBe("USD");
      const cost = p.entitlements.aiConversationsPerMonth! * 10 + p.entitlements.textsPerMonth! * 5; // cents
      expect(cost / p.priceMonthlyCents).toBeLessThanOrEqual(0.4);
    }
  });
});

describe("allowance", () => {
  it("is unlimited when billing is off; trial for new accounts; the plan's once subscribed; none when lapsed", async () => {
    const c = await createClinic();
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(await allowanceFor(c.ctx)).toMatchObject({ source: "unlimited", aiConversations: null, texts: null });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_allowance");
    expect(await allowanceFor(c.ctx)).toMatchObject({ source: "trial", aiConversations: TRIAL_ALLOWANCE.aiConversationsPerMonth, texts: TRIAL_ALLOWANCE.textsPerMonth });
    // The no-card trial ends 14 days after sign-up.
    expect(await allowanceFor(c.ctx, new Date(Date.now() + 15 * 86_400_000))).toMatchObject({ source: "none", aiConversations: 0, texts: 0 });
    await subscribe(c.organization.id, "growth", "trialing");
    expect(await allowanceFor(c.ctx)).toMatchObject({ source: "trial", plan: "growth", aiConversations: TRIAL_ALLOWANCE.aiConversationsPerMonth });
    await subscribe(c.organization.id, "growth");
    expect(await allowanceFor(c.ctx)).toMatchObject({ source: "plan", plan: "growth", aiConversations: 450, texts: 250 });
    await subscribe(c.organization.id, "growth", "canceled");
    expect(await allowanceFor(c.ctx)).toMatchObject({ source: "none", aiConversations: 0 });
  });

  it("the month starts on the 1st in the business's time zone", () => {
    expect(periodStart(new Date("2026-10-31T21:00:00Z"), "Asia/Dubai").toISOString()).toBe("2026-10-31T20:00:00.000Z"); // 1 Nov, 00:00 Dubai
    expect(periodStart(new Date("2026-10-15T12:00:00Z"), "Asia/Dubai").toISOString()).toBe("2026-09-30T20:00:00.000Z");
  });

  it("at the AI limit, new conversations go to the team; ongoing ones continue; the owner is told once", async () => {
    const c = await createClinic();
    await subscribe(c.organization.id, TINY);
    const first = visitor();
    const r1 = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: first, text: "When are you open?" }, { provider: paid });
    await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "Parking?" }, { provider: paid });
    expect((await monthlyUsage(c.ctx)).aiConversations).toBe(2);

    // Third conversation: handed to the team with an honest reply, no AI cost.
    const r3 = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "Hi" }, { provider: paid });
    expect(r3.turn?.provider).toBe("allowance");
    expect(r3.turn?.handedOff).toBe(true);
    expect(r3.reply).toMatch(/someone will reply/);
    expect(r3.aiActive).toBe(false);
    expect((await monthlyUsage(c.ctx)).aiConversations).toBe(2);

    // A conversation already counted this month keeps its AI.
    const again = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: first, text: "And Saturday?" }, { provider: paid });
    expect(again.conversationId).toBe(r1.conversationId);
    expect(again.turn?.provider).toBe("anthropic");

    await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "Hello" }, { provider: paid });
    const notes = await db.select().from(notifications).where(and(eq(notifications.businessId, c.business.id), eq(notifications.kind, "allowance")));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.title).toMatch(/AI conversation allowance/);
  });

  it("the free rules engine is never limited", async () => {
    const c = await createClinic();
    await subscribe(c.organization.id, TINY);
    await db.insert(aiUsage).values([randomUUID(), randomUUID()].map((conversationId) => ({ businessId: c.business.id, conversationId, provider: "anthropic", model: "claude-opus-5-5", inputTokens: 1 })));
    const r = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "Do you have parking?" });
    expect(r.turn?.provider).toBe("rules");
  });

  it("automated texts stop at the limit and fall back to another channel; the owner is told once", async () => {
    const c = await createClinic();
    await subscribe(c.organization.id, TINY);
    await updateSenders(c.ctx, { smsFrom: number() });
    const a = (await createCustomer(c.ctx, { phone: number() })).customer;
    const b = (await createCustomer(c.ctx, { phone: number(), email: `b-${randomUUID()}@test.dev` })).customer;
    expect((await deliverToCustomer(c.ctx, { customerId: a.id, text: "Following up" })).channel).toBe("sms");
    expect((await automatedTextAllowed(c.ctx)).ok).toBe(false);

    const blocked = await deliverToCustomer(c.ctx, { customerId: a.id, text: "Following up again" });
    expect(blocked.ok).toBe(false);
    expect(blocked.detail).toMatch(/Monthly text allowance reached/);
    await deliverToCustomer(c.ctx, { customerId: b.id, text: "Hi" });
    expect(sent.filter((s) => s.get("Body")?.startsWith("Following") || s.get("Body") === "Hi")).toHaveLength(1);
    const notes = await db.select().from(notifications).where(and(eq(notifications.businessId, c.business.id), eq(notifications.kind, "allowance")));
    expect(notes.map((n) => n.title)).toEqual(["Monthly text allowance reached"]);

    // A team member's own message is never blocked.
    expect((await deliverToCustomer(c.ctx, { customerId: a.id, text: "From Olivia", role: "human" })).channel).toBe("sms");
  });

  it("usage is counted per organization — another business's usage never counts against you", async () => {
    const a = await createClinic("A");
    const b = await createClinic("B");
    await subscribe(a.organization.id, TINY);
    await subscribe(b.organization.id, TINY);
    await db.insert(aiUsage).values([randomUUID(), randomUUID()].map((conversationId) => ({ businessId: a.business.id, conversationId, provider: "anthropic", model: "claude-opus-5-5", inputTokens: 1 })));
    expect((await aiConversationAllowed(a.ctx, randomUUID())).ok).toBe(false);
    expect((await aiConversationAllowed(b.ctx, randomUUID())).ok).toBe(true);
    expect((await monthlyUsage(b.ctx)).aiConversations).toBe(0);
    // Sanity: the org rows exist and are distinct.
    expect((await db.select().from(organizations).where(eq(organizations.id, a.organization.id))).length).toBe(1);
    expect((await db.select().from(conversations).where(eq(conversations.businessId, b.business.id))).length).toBe(0);
  });
});
