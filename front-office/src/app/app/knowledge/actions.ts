"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/action";
import { requirePermission } from "@/lib/session";
import { invalid } from "@/server/context";
import { extractDocumentText } from "@/server/services/documents";
import { importWebsite } from "@/server/services/website-import";
import { addSource, deleteSource, formatFaqs, htmlToText, indexSource, searchKnowledge, updateSourceContent } from "@/server/services/knowledge";

type Faq = { q: string; a: string };
const cleanFaqs = (faqs: Faq[] | undefined) =>
  formatFaqs((Array.isArray(faqs) ? faqs : []).map((f) => ({ q: String(f.q ?? ""), a: String(f.a ?? "") })).filter((f) => f.q.trim() && f.a.trim()));

type Kind = "text" | "faq" | "document" | "url";
const KINDS: Kind[] = ["text", "faq", "document", "url"];

export async function addSourceAction(input: { kind: Kind; title: string; content?: string; url?: string; faqs?: Faq[]; html?: boolean }) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    if (!KINDS.includes(input.kind)) throw invalid("Unknown source type.");
    let content = String(input.content ?? "");
    if (input.kind === "faq") content = cleanFaqs(input.faqs);
    if (input.kind === "document" && input.html) content = htmlToText(content);
    const s = await addSource(ctx, {
      kind: input.kind,
      title: String(input.title ?? "").slice(0, 200),
      content: input.kind === "url" ? undefined : content,
      url: input.kind === "url" ? String(input.url ?? "").trim() : undefined,
    });
    revalidatePath("/app/knowledge");
    if (s.status === "failed") throw invalid(`Saved, but indexing failed: ${s.error ?? "unknown error"}`);
    return { chunks: s.chunkCount };
  });
}

export async function updateSourceAction(id: string, input: { title: string; content?: string; faqs?: Faq[] }) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const content = input.faqs ? cleanFaqs(input.faqs) : String(input.content ?? "");
    if (!content.trim()) throw invalid(input.faqs ? "Add at least one question and answer." : "Content is required.");
    const s = await updateSourceContent(ctx, String(id), { title: String(input.title).trim().slice(0, 200) || undefined, content });
    revalidatePath("/app/knowledge");
    if (s.status === "failed") throw invalid(`Saved, but indexing failed: ${s.error ?? "unknown error"}`);
    return { chunks: s.chunkCount };
  }, "Saved and re-indexed.");
}

export async function reindexSourceAction(id: string) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const s = await indexSource(ctx, String(id));
    revalidatePath("/app/knowledge");
    if (s.status === "failed") throw invalid(`Indexing failed: ${s.error ?? "unknown error"}`);
    return { chunks: s.chunkCount };
  }, "Re-indexed.");
}

export async function deleteSourceAction(id: string) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    await deleteSource(ctx, String(id));
    revalidatePath("/app/knowledge");
  }, "Source removed.");
}

export async function testRetrievalAction(query: string) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const q = String(query ?? "").trim().slice(0, 300);
    if (!q) throw invalid("Type a question a customer might ask.");
    const hits = await searchKnowledge(ctx, q, 5);
    return hits.map((h) => ({ chunkId: h.chunkId, sourceTitle: h.sourceTitle, content: h.content }));
  });
}

/** Upload a document (PDF, Word .docx, or text). Text is extracted on the server. */
export async function uploadDocumentAction(fd: FormData) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const file = fd.get("file");
    if (!(file instanceof File)) throw invalid("Choose a file to upload.");
    const { text } = await extractDocumentText(file.name, new Uint8Array(await file.arrayBuffer()));
    const title = String(fd.get("title") ?? "").trim().slice(0, 200) || file.name.replace(/\.[^.]+$/, "").slice(0, 200);
    const s = await addSource(ctx, { kind: "document", title, content: text.slice(0, 200_000) });
    revalidatePath("/app/knowledge");
    if (s.status === "failed") throw invalid(`Saved, but indexing failed: ${s.error ?? "unknown error"}`);
    return { chunks: s.chunkCount, truncated: text.length > 200_000 };
  }, "Document added. The AI can use it now.");
}

/** Import up to 25 pages of a website (sitemap + links on the same site). */
export async function importWebsiteAction(url: string) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const r = await importWebsite(ctx, String(url ?? ""));
    revalidatePath("/app/knowledge");
    return { added: r.added, updated: r.updated, failed: r.failed, more: r.more, site: r.site };
  });
}
