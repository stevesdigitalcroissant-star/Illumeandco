/**
 * Knowledge base: sources (text, FAQs, documents, website URLs) → chunks →
 * hybrid retrieval (Postgres full-text + trigram, plus pgvector semantic
 * search when an embedding provider is configured), fused with reciprocal
 * rank fusion. Everything is scoped to one business.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { db as rootDb, type Tx } from "@/db";
import { knowledgeChunks, knowledgeSources } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, notFound, type Ctx } from "../context";
import { embeddingsEnabled, embedTexts } from "../ai/embeddings";

export type KnowledgeSource = typeof knowledgeSources.$inferSelect;

const MAX_SOURCE_CHARS = 200_000;
const CHUNK_TARGET = 900;

// ─── Chunking ────────────────────────────────────────────────────────
export function parseFaqs(content: string) {
  const pairs: { q: string; a: string }[] = [];
  const re = /Q:\s*([\s\S]*?)\n\s*A:\s*([\s\S]*?)(?=\n\s*Q:|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) pairs.push({ q: m[1]!.trim(), a: m[2]!.trim() });
  return pairs.filter((p) => p.q && p.a);
}

export function formatFaqs(pairs: { q: string; a: string }[]) {
  return pairs.map((p) => `Q: ${p.q.trim()}\nA: ${p.a.trim()}`).join("\n\n");
}

export function chunkText(text: string, title?: string): string[] {
  const clean = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paras = clean.split(/\n\n+/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (p.length > CHUNK_TARGET * 1.5) {
      // Split very long paragraphs on sentence boundaries.
      for (const sentence of p.split(/(?<=[.!?])\s+/)) {
        if ((cur + " " + sentence).length > CHUNK_TARGET && cur) {
          chunks.push(cur.trim());
          cur = "";
        }
        cur += (cur ? " " : "") + sentence;
      }
      continue;
    }
    if ((cur + "\n\n" + p).length > CHUNK_TARGET && cur) {
      chunks.push(cur.trim());
      cur = "";
    }
    cur += (cur ? "\n\n" : "") + p;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return title ? chunks.map((c) => `${title}\n${c}`) : chunks;
}

export function chunkSource(kind: KnowledgeSource["kind"], title: string, content: string) {
  if (kind === "faq") {
    const pairs = parseFaqs(content);
    if (pairs.length) return pairs.map((p) => `Q: ${p.q}\nA: ${p.a}`);
  }
  return chunkText(content, title);
}

// ─── Website import (with SSRF protection) ───────────────────────────
function isPrivateAddress(ip: string) {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v === "::" || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

export async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid("Please enter a valid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw invalid("Only http(s) URLs are supported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw invalid("That website could not be reached.");
  if (addrs.some((a) => isPrivateAddress(a.address))) throw invalid("That address is not allowed.");
  return url;
}

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchUrlText(raw: string) {
  let url = await assertPublicUrl(raw);
  // Follow redirects manually so every hop is re-checked.
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "AIFrontOfficeBot/1.0 (+knowledge import)" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    if (!res.ok) throw invalid(`The website returned ${res.status}.`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/(html|plain)/.test(type)) throw invalid("Only HTML or plain-text pages can be imported.");
    const body = (await res.text()).slice(0, 2_000_000);
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]?.trim();
    return { text: type.includes("html") ? htmlToText(body) : body, title };
  }
  throw invalid("Too many redirects.");
}

// ─── Sources ─────────────────────────────────────────────────────────
export async function listSources(ctx: Ctx) {
  return dbOf(ctx)
    .select()
    .from(knowledgeSources)
    .where(eq(knowledgeSources.businessId, ctx.businessId))
    .orderBy(desc(knowledgeSources.updatedAt));
}

export async function getSource(ctx: Ctx, id: string) {
  const s = await dbOf(ctx).query.knowledgeSources.findFirst({
    where: and(eq(knowledgeSources.businessId, ctx.businessId), eq(knowledgeSources.id, id)),
  });
  if (!s) throw notFound("Knowledge source");
  return s;
}

export async function addSource(
  ctx: Ctx,
  input: { kind: KnowledgeSource["kind"]; title: string; content?: string; url?: string },
) {
  assertCan(ctx, "business.manage");
  const title = input.title.trim() || (input.url ?? "Untitled");
  if (input.kind === "url") {
    if (!input.url) throw invalid("A URL is required.");
    await assertPublicUrl(input.url);
  } else {
    if (!input.content?.trim()) throw invalid("Content is required.");
    if (input.content.length > MAX_SOURCE_CHARS) throw invalid("That document is too large (max 200,000 characters).");
    if (input.kind === "faq" && !parseFaqs(input.content).length) throw invalid('FAQs must be written as "Q: … A: …" pairs.');
  }
  const [s] = await dbOf(ctx)
    .insert(knowledgeSources)
    .values({ businessId: ctx.businessId, kind: input.kind, title, content: input.content ?? null, url: input.url ?? null })
    .returning();
  await audit(ctx, { action: "knowledge.updated", summary: `Knowledge source "${title}" added`, entityType: "knowledge_source", entityId: s!.id });
  return indexSource(ctx, s!.id);
}

export async function updateSourceContent(ctx: Ctx, id: string, input: { title?: string; content?: string }) {
  assertCan(ctx, "business.manage");
  const s = await getSource(ctx, id);
  if (input.content !== undefined && input.content.length > MAX_SOURCE_CHARS) throw invalid("That document is too large.");
  await dbOf(ctx)
    .update(knowledgeSources)
    .set({ title: input.title ?? s.title, content: input.content ?? s.content, status: "pending" })
    .where(eq(knowledgeSources.id, id));
  await audit(ctx, { action: "knowledge.updated", summary: `Knowledge source "${input.title ?? s.title}" updated`, entityType: "knowledge_source", entityId: id });
  return indexSource(ctx, id);
}

export async function deleteSource(ctx: Ctx, id: string) {
  assertCan(ctx, "business.manage");
  const s = await getSource(ctx, id);
  await dbOf(ctx).delete(knowledgeSources).where(and(eq(knowledgeSources.businessId, ctx.businessId), eq(knowledgeSources.id, id)));
  await audit(ctx, { action: "knowledge.updated", summary: `Knowledge source "${s.title}" removed`, entityType: "knowledge_source", entityId: id });
}

/** (Re)build chunks for a source. URL sources are re-fetched. */
export async function indexSource(ctx: Ctx, id: string) {
  const s = await getSource(ctx, id);
  try {
    let content = s.content ?? "";
    let title = s.title;
    if (s.kind === "url" && s.url) {
      const page = await fetchUrlText(s.url);
      content = page.text;
      if (page.title && (!s.title || s.title === s.url)) title = page.title;
    }
    const chunks = chunkSource(s.kind, title, content.slice(0, MAX_SOURCE_CHARS));
    if (!chunks.length) throw invalid("No readable text was found.");
    const embeddings = embeddingsEnabled() ? await embedTexts(chunks, "document") : null;
    const run = async (tx: Tx) => {
      await tx.delete(knowledgeChunks).where(and(eq(knowledgeChunks.businessId, ctx.businessId), eq(knowledgeChunks.sourceId, id)));
      await tx.insert(knowledgeChunks).values(
        chunks.map((content, position) => ({
          businessId: ctx.businessId,
          sourceId: id,
          position,
          content,
          embedding: embeddings?.[position] ?? null,
        })),
      );
      await tx
        .update(knowledgeSources)
        .set({ status: "indexed", error: null, chunkCount: chunks.length, lastIndexedAt: new Date(), title, content: s.kind === "url" ? content : s.content })
        .where(eq(knowledgeSources.id, id));
    };
    if (ctx.tx) await run(ctx.tx);
    else await rootDb.transaction(run);
  } catch (e) {
    await dbOf(ctx)
      .update(knowledgeSources)
      .set({ status: "failed", error: (e as Error).message.slice(0, 300) })
      .where(eq(knowledgeSources.id, id));
  }
  return getSource(ctx, id);
}

// ─── Retrieval ───────────────────────────────────────────────────────
const STOPWORDS = new Set(
  "a an and are as at be but by can could do does for from have how i if in is it its me my of on or our please so that the their there this to us was we what when where which who why will with would you your hi hello hey much many tell know about any".split(
    " ",
  ),
);

export function queryTerms(q: string) {
  return [...new Set(q.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/))]
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .slice(0, 12);
}

export type KnowledgeHit = { chunkId: string; sourceId: string; sourceTitle: string; content: string; score: number };

export async function searchKnowledge(ctx: Ctx, query: string, limit = 5): Promise<KnowledgeHit[]> {
  const db = dbOf(ctx);
  const terms = queryTerms(query);
  const ranked = new Map<string, { hit: KnowledgeHit; rrf: number }>();
  const add = (rows: KnowledgeHit[]) =>
    rows.forEach((hit, i) => {
      const cur = ranked.get(hit.chunkId);
      const rrf = 1 / (60 + i);
      if (cur) cur.rrf += rrf;
      else ranked.set(hit.chunkId, { hit, rrf });
    });

  if (terms.length) {
    const tsq = terms.map((t) => `${t.replace(/'/g, "")}:*`).join(" | ");
    const fts = await db.execute<{ chunk_id: string; source_id: string; title: string; content: string; score: number }>(sql`
      select c.id as chunk_id, c.source_id, s.title, c.content, ts_rank(c.tsv, to_tsquery('simple', ${tsq})) as score
      from ${knowledgeChunks} c join ${knowledgeSources} s on s.id = c.source_id
      where c.business_id = ${ctx.businessId} and c.tsv @@ to_tsquery('simple', ${tsq})
      order by score desc limit 10`);
    add(fts.rows.map((r) => ({ chunkId: r.chunk_id, sourceId: r.source_id, sourceTitle: r.title, content: r.content, score: Number(r.score) })));

    const trg = await db.execute<{ chunk_id: string; source_id: string; title: string; content: string; score: number }>(sql`
      select c.id as chunk_id, c.source_id, s.title, c.content, word_similarity(${terms.join(" ")}, c.content) as score
      from ${knowledgeChunks} c join ${knowledgeSources} s on s.id = c.source_id
      where c.business_id = ${ctx.businessId} and word_similarity(${terms.join(" ")}, c.content) > 0.3
      order by score desc limit 10`);
    add(trg.rows.map((r) => ({ chunkId: r.chunk_id, sourceId: r.source_id, sourceTitle: r.title, content: r.content, score: Number(r.score) })));
  }

  if (embeddingsEnabled()) {
    try {
      const [vec] = await embedTexts([query], "query");
      if (vec) {
        const literal = `[${vec.join(",")}]`;
        const sem = await db.execute<{ chunk_id: string; source_id: string; title: string; content: string; score: number }>(sql`
          select c.id as chunk_id, c.source_id, s.title, c.content, 1 - (c.embedding <=> ${literal}::vector) as score
          from ${knowledgeChunks} c join ${knowledgeSources} s on s.id = c.source_id
          where c.business_id = ${ctx.businessId} and c.embedding is not null
          order by c.embedding <=> ${literal}::vector limit 10`);
        add(sem.rows.filter((r) => Number(r.score) > 0.3).map((r) => ({ chunkId: r.chunk_id, sourceId: r.source_id, sourceTitle: r.title, content: r.content, score: Number(r.score) })));
      }
    } catch {
      // Semantic search is an enhancement; keyword search results still stand.
    }
  }

  return [...ranked.values()]
    .sort((a, b) => b.rrf - a.rrf)
    .slice(0, limit)
    .map((r) => r.hit);
}

export async function knowledgeStats(ctx: Ctx) {
  const [r] = await dbOf(ctx)
    .select({
      sources: sql<number>`count(*)::int`,
      indexed: sql<number>`count(*) filter (where ${knowledgeSources.status} = 'indexed')::int`,
      chunks: sql<number>`coalesce(sum(${knowledgeSources.chunkCount}),0)::int`,
    })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.businessId, ctx.businessId));
  return r!;
}
