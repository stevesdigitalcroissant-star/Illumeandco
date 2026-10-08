/**
 * AI usage and cost per business. Every paid AI turn records the tokens the
 * API reported; cost is an estimate at Anthropic's list prices (per million
 * tokens), so a business's margin can be watched. Override or extend the
 * table with AI_PRICING='{"model-id":{"input":4,"output":20,"cacheRead":0.2}}'.
 *
 * Notes: `input_tokens` from the API excludes cached tokens, which are
 * reported separately; a cache write costs 1.25× input (5-minute cache).
 * After a server-side fallback the turn is priced at the model that served
 * it — the declined attempt is not itemised, so this can under-count slightly.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { aiUsage } from "@/db/schema";
import { assertCan, dbOf, type Ctx } from "../context";

export type Price = { input: number; output: number; cacheRead: number; cacheWrite?: number };

/** $ per million tokens — Anthropic first-party list prices (checked 2026-10-08). */
const LIST_PRICES: Record<string, Price> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};

export function priceFor(model: string): Price | null {
  let overrides: Record<string, Price> = {};
  try {
    overrides = process.env.AI_PRICING ? (JSON.parse(process.env.AI_PRICING) as Record<string, Price>) : {};
  } catch {
    console.warn("[ai-usage] AI_PRICING is not valid JSON — using list prices");
  }
  return overrides[model] ?? LIST_PRICES[model] ?? null;
}

export type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };

/** Estimated cost in micro-USD, or null if the model's price is unknown. */
export function costMicroUsd(model: string, u: Usage) {
  const p = priceFor(model);
  if (!p) return null;
  const cacheWrite = p.cacheWrite ?? p.input * 1.25;
  // $/MTok × tokens = micro-dollars.
  return Math.round(u.inputTokens * p.input + u.outputTokens * p.output + (u.cacheReadTokens ?? 0) * p.cacheRead + (u.cacheWriteTokens ?? 0) * cacheWrite);
}

export async function recordUsage(ctx: Ctx, input: { conversationId: string | null; provider: string; model: string; usage: Usage }) {
  const u = input.usage;
  if (!u.inputTokens && !u.outputTokens && !u.cacheReadTokens && !u.cacheWriteTokens) return;
  await dbOf(ctx).insert(aiUsage).values({
    businessId: ctx.businessId,
    conversationId: input.conversationId,
    provider: input.provider,
    model: input.model,
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheReadTokens: u.cacheReadTokens ?? 0,
    cacheWriteTokens: u.cacheWriteTokens ?? 0,
    costMicroUsd: costMicroUsd(input.model, u),
  });
}

export async function usageSummary(ctx: Ctx, opts: { days?: number; now?: Date } = {}) {
  assertCan(ctx, "billing.manage");
  const now = opts.now ?? new Date();
  const days = opts.days ?? 30;
  const since = new Date(now.getTime() - days * 86400_000);
  const where = and(eq(aiUsage.businessId, ctx.businessId), gte(aiUsage.createdAt, since));
  const [t] = await dbOf(ctx)
    .select({
      turns: sql<number>`count(*)::int`,
      conversations: sql<number>`count(distinct ${aiUsage.conversationId})::int`,
      input: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::bigint`,
      output: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::bigint`,
      cacheRead: sql<number>`coalesce(sum(${aiUsage.cacheReadTokens}),0)::bigint`,
      cacheWrite: sql<number>`coalesce(sum(${aiUsage.cacheWriteTokens}),0)::bigint`,
      cost: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}),0)::bigint`,
      unpriced: sql<number>`count(*) filter (where ${aiUsage.costMicroUsd} is null)::int`,
    })
    .from(aiUsage)
    .where(where);
  const byModel = await dbOf(ctx)
    .select({ model: aiUsage.model, turns: sql<number>`count(*)::int`, cost: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}),0)::bigint` })
    .from(aiUsage)
    .where(where)
    .groupBy(aiUsage.model)
    .orderBy(desc(sql`count(*)`));
  const n = (v: unknown) => Number(v ?? 0);
  const costUsd = n(t?.cost) / 1e6;
  const input = n(t?.input);
  const cacheRead = n(t?.cacheRead);
  return {
    days,
    turns: n(t?.turns),
    conversations: n(t?.conversations),
    tokens: { input, output: n(t?.output), cacheRead, cacheWrite: n(t?.cacheWrite) },
    /** Share of prompt tokens served from cache — higher is cheaper. */
    cacheHitRate: input + cacheRead ? cacheRead / (input + cacheRead) : null,
    costUsd,
    costPerConversationUsd: n(t?.conversations) ? costUsd / n(t?.conversations) : null,
    unpricedTurns: n(t?.unpriced),
    byModel: byModel.map((m) => ({ model: m.model, turns: n(m.turns), costUsd: n(m.cost) / 1e6 })),
  };
}
