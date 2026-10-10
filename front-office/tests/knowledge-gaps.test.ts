/** Unanswered questions: recorded when the AI can't answer, answered once by the owner, then used by the AI. */
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeGaps, knowledgeSources } from "@/db/schema";
import { handleInbound } from "@/server/ai/orchestrator";
import type { ModelProvider } from "@/server/ai/providers/types";
import { answerGap, ANSWERS_SOURCE_TITLE, dismissGap, listOpenGaps, normalizeQuestion, recordGap } from "@/server/services/knowledge-gaps";
import { createClinic, visitor } from "./helpers";

const QUESTION = "Is there wheelchair access";

describe("knowledge gaps", () => {
  it("groups repeats of the same question and ignores trivial ones", async () => {
    const c = await createClinic();
    expect(normalizeQuestion("Do you offer PAYMENT plans?!")).toBe("do you offer payment plans");
    await recordGap(c.ctx, "Do you offer payment plans?");
    await recordGap(c.ctx, "do you offer payment plans");
    expect(await recordGap(c.ctx, "ok?")).toBeNull();
    const open = await listOpenGaps(c.ctx);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ question: "Do you offer payment plans?", timesAsked: 2 });
  });

  it("a question the AI can't answer appears for the owner; once answered, the AI answers it", async () => {
    const c = await createClinic();
    const first = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: QUESTION });
    expect(first.reply).toMatch(/don't have that information/);
    const [gap] = await listOpenGaps(c.ctx);
    expect(gap?.question).toBe(QUESTION);

    await answerGap(c.ctx, gap!.id, { answer: "Yes — step-free entrance and a lift to every floor." });
    expect(await listOpenGaps(c.ctx)).toHaveLength(0);
    const [src] = await db.select().from(knowledgeSources).where(and(eq(knowledgeSources.businessId, c.business.id), eq(knowledgeSources.title, ANSWERS_SOURCE_TITLE)));
    expect(src?.status).toBe("indexed");

    const again = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: QUESTION });
    expect(again.reply).toContain("step-free entrance");

    // A second answer is added to the same FAQ source, not a new one.
    await recordGap(c.ctx, "Do you treat children under five");
    const [g2] = await listOpenGaps(c.ctx);
    await answerGap(c.ctx, g2!.id, { question: "Do you treat young children?", answer: "Yes, from age three." });
    const sources = await db.select().from(knowledgeSources).where(and(eq(knowledgeSources.businessId, c.business.id), eq(knowledgeSources.title, ANSWERS_SOURCE_TITLE)));
    expect(sources).toHaveLength(1);
    expect(sources[0]!.content).toContain("Q: Do you treat young children?\nA: Yes, from age three.");
  });

  it("the AI can note a question it couldn't answer even when search returned something", async () => {
    const c = await createClinic();
    const provider: ModelProvider = {
      id: "anthropic",
      label: "test",
      isConfigured: () => true,
      async run(input) {
        await input.execute("note_unanswered_question", { question: "Can I bring my dog to the appointment?" });
        return { text: "I don't have that information available, but I can have someone confirm it.", stopReason: "end_turn", model: "test-model" };
      },
    };
    await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "can i bring rex, my dog?" }, { provider });
    expect((await listOpenGaps(c.ctx)).map((g) => g.question)).toEqual(["Can I bring my dog to the appointment?"]);
  });

  it("dismissed questions stay dismissed; answered ones reopen if still asked; staff can't answer; per-business", async () => {
    const a = await createClinic("A");
    const b = await createClinic("B");
    const g = (await recordGap(a.ctx, "Do you sell gift vouchers"))!;
    await dismissGap(a.ctx, g.id);
    await recordGap(a.ctx, "Do you sell gift vouchers?");
    expect(await listOpenGaps(a.ctx)).toHaveLength(0);

    const h = (await recordGap(a.ctx, "Do you open on public holidays"))!;
    const staff = { ...a.ctx, actor: { ...a.ctx.actor, role: "staff" as const } };
    await expect(answerGap(staff, h.id, { answer: "No" })).rejects.toThrow();
    await expect(answerGap(b.ctx, h.id, { answer: "No" })).rejects.toThrow(/not found/i);
    await expect(dismissGap(b.ctx, h.id)).rejects.toThrow(/not found/i);
    expect(await listOpenGaps(b.ctx)).toHaveLength(0);

    await answerGap(a.ctx, h.id, { answer: "We're closed on public holidays." });
    await recordGap(a.ctx, "do you open on public holidays");
    const [reopened] = await db.select().from(knowledgeGaps).where(eq(knowledgeGaps.id, h.id));
    expect(reopened).toMatchObject({ status: "open", timesAsked: 2 });
  });
});
