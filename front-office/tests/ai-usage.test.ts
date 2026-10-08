/** AI usage: tokens recorded per paid turn, priced at list prices, summarised per business. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { handleInbound } from "@/server/ai/orchestrator";
import type { ModelProvider } from "@/server/ai/providers/types";
import { costMicroUsd, priceFor, usageSummary } from "@/server/ai/usage";
import { createClinic, visitor } from "./helpers";

afterEach(() => vi.unstubAllEnvs());

/** A provider that replies with fixed text and reports fixed usage, like the Anthropic provider does. */
const paid = (model: string): ModelProvider => ({
  id: "anthropic",
  label: "test",
  isConfigured: () => true,
  async run() {
    return { text: "We're open 9 to 6.", stopReason: "end_turn", model, usage: { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 8000, cacheWriteTokens: 0 } };
  },
});

describe("AI usage and cost", () => {
  it("prices tokens at list prices (input excludes cached tokens; cache write = 1.25× input)", () => {
    // Opus 5.5: $4 in, $20 out, $0.20 cache read per MTok.
    expect(costMicroUsd("claude-opus-5-5", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(4_000_000);
    expect(costMicroUsd("claude-opus-5-5", { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 8000 })).toBe(4800 + 6000 + 1600);
    expect(costMicroUsd("claude-sonnet-5-5", { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000 })).toBe(2_500_000);
    expect(costMicroUsd("some-unknown-model", { inputTokens: 10, outputTokens: 10 })).toBeNull();
    vi.stubEnv("AI_PRICING", JSON.stringify({ "some-unknown-model": { input: 1, output: 1, cacheRead: 0.1 } }));
    expect(priceFor("some-unknown-model")).toEqual({ input: 1, output: 1, cacheRead: 0.1 });
  });

  it("records each paid turn for its business and summarises it; the rules engine costs nothing", async () => {
    const a = await createClinic("A");
    const b = await createClinic("B");
    const id = visitor();
    await handleInbound({ businessId: a.business.id, channel: "web_chat", identity: id, text: "When are you open?" }, { provider: paid("claude-opus-5-5") });
    await handleInbound({ businessId: a.business.id, channel: "web_chat", identity: id, text: "Thanks" }, { provider: paid("claude-sonnet-5-5") });
    await handleInbound({ businessId: a.business.id, channel: "web_chat", identity: visitor(), text: "Do you have parking?" }); // rules engine
    const rows = await db.select().from(aiUsage).where(eq(aiUsage.businessId, a.business.id));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.model === "claude-opus-5-5")?.costMicroUsd).toBe(12400);

    const s = await usageSummary(a.ctx);
    expect(s).toMatchObject({ turns: 2, conversations: 1, unpricedTurns: 0 });
    expect(s.costUsd).toBeCloseTo((12400 + (1200 * 2 + 300 * 10 + 8000 * 0.2)) / 1e6, 8);
    expect(s.costPerConversationUsd).toBeCloseTo(s.costUsd, 8);
    expect(s.cacheHitRate).toBeCloseTo(16000 / 18400, 5);
    expect((await usageSummary(b.ctx)).turns).toBe(0);
    const manager = { ...a.ctx, actor: { ...a.ctx.actor, role: "manager" as const } };
    await expect(usageSummary(manager)).rejects.toThrow();
  });
});
