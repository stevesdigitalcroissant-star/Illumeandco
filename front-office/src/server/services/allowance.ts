/**
 * Monthly allowances: AI conversations and outbound texts per organization
 * (a plan covers all of an organization's locations).
 *
 * - An AI conversation counts once per calendar month, the first time a paid
 *   AI model answers in it (turns answered by the built-in rules engine are free).
 * - Texts are outbound SMS/WhatsApp messages. Automated messages (follow-ups,
 *   text-backs, offers, reminders) stop at the limit; replies to a customer
 *   who wrote to you are never blocked.
 * - At the AI limit, new conversations go to the team instead — the customer
 *   is told a person will reply, never left unanswered — and the owner is
 *   alerted once per month.
 * - Limits apply only when billing is on (Stripe configured): the plan's
 *   allowance; the smaller trial allowance during a free trial (14 days from
 *   sign-up, or a Stripe trial); nothing automated without an active plan.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db as rootDb } from "@/db";
import { aiUsage, businesses, conversations, messages, organizations } from "@/db/schema";
import type { Ctx } from "../context";
import { notifyStaff } from "./alerts";
import { entitlementsFor, getSubscription, TRIAL_ALLOWANCE, TRIAL_DAYS } from "./billing";

export type Allowance = {
  aiConversations: number | null;
  texts: number | null;
  /** unlimited = billing off; trial = free trial (no card, or a Stripe trial); plan = paid plan; none = no active plan. */
  source: "plan" | "trial" | "unlimited" | "none";
  plan: string | null;
};

async function orgAndTz(businessId: string) {
  const b = await rootDb.query.businesses.findFirst({ where: eq(businesses.id, businessId) });
  return { organizationId: b!.organizationId, tz: b!.timezone };
}

export async function allowanceFor(ctx: Ctx, now = new Date()): Promise<Allowance> {
  const { organizationId } = await orgAndTz(ctx.businessId);
  const ent = await entitlementsFor(organizationId);
  if (!ent.enforced) return { aiConversations: null, texts: null, source: "unlimited", plan: null };
  const trial = (plan: string | null): Allowance => ({ aiConversations: TRIAL_ALLOWANCE.aiConversationsPerMonth, texts: TRIAL_ALLOWANCE.textsPerMonth, source: "trial", plan });
  const sub = await getSubscription(organizationId);
  if (ent.plan && sub?.status === "trialing") return trial(ent.plan);
  if (ent.plan && ent.entitlements)
    return { aiConversations: ent.entitlements.aiConversationsPerMonth ?? null, texts: ent.entitlements.textsPerMonth ?? null, source: "plan", plan: ent.plan };
  // Never subscribed: the free trial runs from sign-up. A lapsed or cancelled subscription gets nothing automated.
  if (!sub) {
    const org = await rootDb.query.organizations.findFirst({ where: eq(organizations.id, organizationId) });
    if (org && now.getTime() - org.createdAt.getTime() < TRIAL_DAYS * 86_400_000) return trial(null);
  }
  return { aiConversations: 0, texts: 0, source: "none", plan: null };
}

export function periodStart(now: Date, tz: string) {
  return DateTime.fromJSDate(now).setZone(tz).startOf("month").toJSDate();
}

async function orgBusinessIds(organizationId: string) {
  return (await rootDb.select({ id: businesses.id }).from(businesses).where(eq(businesses.organizationId, organizationId))).map((b) => b.id);
}

export async function monthlyUsage(ctx: Ctx, now = new Date()) {
  const { organizationId, tz } = await orgAndTz(ctx.businessId);
  const ids = await orgBusinessIds(organizationId);
  const since = periodStart(now, tz);
  const [ai] = await rootDb
    .select({ n: sql<number>`count(distinct ${aiUsage.conversationId})::int` })
    .from(aiUsage)
    .where(and(inArray(aiUsage.businessId, ids), gte(aiUsage.createdAt, since)));
  const [texts] = await rootDb
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(inArray(messages.businessId, ids), inArray(conversations.channel, ["sms", "whatsapp"]), inArray(messages.role, ["ai", "human"]), gte(messages.createdAt, since)));
  return { aiConversations: Number(ai?.n ?? 0), texts: Number(texts?.n ?? 0), periodStart: since };
}

/** May a paid AI model answer in this conversation? (Already-counted conversations always continue.) */
export async function aiConversationAllowed(ctx: Ctx, conversationId: string, now = new Date()) {
  const a = await allowanceFor(ctx, now);
  if (a.aiConversations === null) return { ok: true as const, allowance: a };
  const { tz } = await orgAndTz(ctx.businessId);
  const [counted] = await rootDb
    .select({ id: aiUsage.id })
    .from(aiUsage)
    .where(and(eq(aiUsage.businessId, ctx.businessId), eq(aiUsage.conversationId, conversationId), gte(aiUsage.createdAt, periodStart(now, tz))))
    .limit(1);
  if (counted) return { ok: true as const, allowance: a };
  const usage = await monthlyUsage(ctx, now);
  return usage.aiConversations < a.aiConversations ? { ok: true as const, allowance: a } : { ok: false as const, allowance: a, used: usage.aiConversations };
}

/** May an automated (proactive) text go out? */
export async function automatedTextAllowed(ctx: Ctx, now = new Date()) {
  const a = await allowanceFor(ctx, now);
  if (a.texts === null) return { ok: true as const, allowance: a };
  const usage = await monthlyUsage(ctx, now);
  return usage.texts < a.texts ? { ok: true as const, allowance: a } : { ok: false as const, allowance: a, used: usage.texts };
}

/** Tell the owner once per month (per location) that an allowance ran out. */
export async function notifyLimitReached(ctx: Ctx, kind: "ai" | "texts", a: Allowance, now = new Date()) {
  const { tz } = await orgAndTz(ctx.businessId);
  const month = DateTime.fromJSDate(now).setZone(tz).toFormat("yyyy-LL");
  const what = kind === "ai" ? `${a.aiConversations} AI conversations` : `${a.texts} texts`;
  const used = a.source === "none" ? "You don't have an active plan." : `You've used all ${what} ${a.source === "trial" ? "in your trial" : "on your plan"} this month.`;
  const effect =
    kind === "ai"
      ? "New conversations now go to your team (customers are told a person will reply)."
      : "Automated texts (follow-ups, text-backs, offers, reminders) are paused; email and website chat still work.";
  await notifyStaff(
    ctx,
    {
      kind: "allowance",
      title: a.source === "none" ? "No active plan — automation paused" : kind === "ai" ? "Monthly AI conversation allowance reached" : "Monthly text allowance reached",
      body: `${used} ${effect} ${a.source === "none" ? "Choose a plan" : "Upgrade"} to keep everything automatic.`,
      link: "/app/settings/billing",
      dedupeKey: `limit:${kind}:${month}`,
      urgent: true,
    },
    now,
  ).catch((e) => console.error("[allowance] owner not notified", e));
}
