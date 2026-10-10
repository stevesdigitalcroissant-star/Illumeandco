/**
 * Knowledge gaps: questions the AI couldn't answer from the business's own
 * information. Recorded automatically (empty knowledge search, or the AI
 * noting it couldn't answer); the owner answers each once — the answer goes
 * into the knowledge base so the AI uses it from then on — or dismisses it.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { knowledgeGaps, knowledgeSources } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, notFound, type Ctx } from "../context";
import { addSource, formatFaqs, parseFaqs, updateSourceContent } from "./knowledge";

export const ANSWERS_SOURCE_TITLE = "Answers to customer questions";

export function normalizeQuestion(q: string) {
  return q.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Record (or count again) a question the AI couldn't answer. Answered questions asked again are reopened. */
export async function recordGap(ctx: Ctx, question: string, now = new Date()) {
  const q = question.replace(/\s+/g, " ").trim().slice(0, 300);
  const normalized = normalizeQuestion(q);
  if (normalized.length < 6) return null;
  const [row] = await dbOf(ctx)
    .insert(knowledgeGaps)
    .values({ businessId: ctx.businessId, question: q, normalized, firstAskedAt: now, lastAskedAt: now })
    .onConflictDoUpdate({
      target: [knowledgeGaps.businessId, knowledgeGaps.normalized],
      set: {
        timesAsked: sql`${knowledgeGaps.timesAsked} + 1`,
        lastAskedAt: now,
        status: sql`case when ${knowledgeGaps.status} = 'answered' then 'open' else ${knowledgeGaps.status} end`,
      },
    })
    .returning();
  return row ?? null;
}

export async function listOpenGaps(ctx: Ctx, limit = 20) {
  return dbOf(ctx)
    .select()
    .from(knowledgeGaps)
    .where(and(eq(knowledgeGaps.businessId, ctx.businessId), eq(knowledgeGaps.status, "open")))
    .orderBy(desc(knowledgeGaps.timesAsked), desc(knowledgeGaps.lastAskedAt))
    .limit(limit);
}

async function getGap(ctx: Ctx, id: string) {
  const g = await dbOf(ctx).query.knowledgeGaps.findFirst({ where: and(eq(knowledgeGaps.businessId, ctx.businessId), eq(knowledgeGaps.id, id)) });
  if (!g) throw notFound("Question");
  return g;
}

/** Answer a gap: the Q&A is added to the business's "Answers to customer questions" FAQ and re-indexed. */
export async function answerGap(ctx: Ctx, id: string, input: { answer: string; question?: string }, now = new Date()) {
  assertCan(ctx, "business.manage");
  const gap = await getGap(ctx, id);
  const answer = input.answer.trim();
  const question = (input.question?.trim() || gap.question).slice(0, 300);
  if (answer.length < 2) throw invalid("Write an answer first.");
  if (answer.length > 2000) throw invalid("Keep the answer under 2,000 characters.");

  const [existing] = await dbOf(ctx)
    .select()
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.businessId, ctx.businessId), eq(knowledgeSources.kind, "faq"), eq(knowledgeSources.title, ANSWERS_SOURCE_TITLE)))
    .limit(1);
  const pair = { q: question, a: answer };
  const source = existing
    ? await updateSourceContent(ctx, existing.id, { content: formatFaqs([...parseFaqs(existing.content ?? ""), pair]) })
    : await addSource(ctx, { kind: "faq", title: ANSWERS_SOURCE_TITLE, content: formatFaqs([pair]) });
  if (source.status !== "indexed") throw invalid(`The answer was saved but couldn't be indexed: ${source.error ?? "unknown error"}`);

  await dbOf(ctx).update(knowledgeGaps).set({ status: "answered", resolvedAt: now }).where(and(eq(knowledgeGaps.businessId, ctx.businessId), eq(knowledgeGaps.id, id)));
  await audit(ctx, { action: "knowledge.updated", summary: `Answered a customer question: "${question.slice(0, 80)}"`, entityType: "knowledge_source", entityId: source.id });
  return source;
}

export async function dismissGap(ctx: Ctx, id: string, now = new Date()) {
  assertCan(ctx, "business.manage");
  await getGap(ctx, id);
  await dbOf(ctx).update(knowledgeGaps).set({ status: "dismissed", resolvedAt: now }).where(and(eq(knowledgeGaps.businessId, ctx.businessId), eq(knowledgeGaps.id, id)));
}
