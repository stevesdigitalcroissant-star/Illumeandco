/**
 * Import a whole website into the knowledge base.
 *
 * Pages are discovered from the site's sitemap.xml and from links on the
 * pages themselves, staying on the same site (www. and bare domain are the
 * same site). The most useful pages for a receptionist — services, prices,
 * about, team, FAQ, contact, policies — are fetched first. Every request goes
 * through the same public-address checks as single-page imports.
 *
 * Each page becomes its own "url" source, so it can be re-fetched or removed
 * on its own; importing again updates the pages already there instead of
 * duplicating them. Bounded by a page cap and a time budget.
 */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { knowledgeSources } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, type Ctx } from "../context";
import { fetchPage, indexSource } from "./knowledge";

export const MAX_SITE_PAGES = 25;
const CONCURRENCY = 4;
const MIN_TEXT = 80;

const SKIP =
  /\/(wp-admin|wp-login|wp-json|wp-content|cart|checkout|basket|my-account|account|login|log-in|signin|sign-in|signup|register|feed|rss|tag|tags|author|search|cdn-cgi|xmlrpc)(\/|$)|\.(jpe?g|png|gif|webp|avif|svg|ico|pdf|zip|mp4|mov|mp3|css|js|json|xml|txt|docx?|xlsx?)$/i;
const USEFUL = /(service|treatment|procedure|price|pricing|fees|cost|menu|offer|package|about|team|doctor|dentist|staff|stylist|therapist|faq|question|contact|location|find-us|hour|opening|policy|policies|insurance|payment|book|appointment|aftercare|new-patient|first-visit)/i;

const siteKey = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** Canonical form for de-duplication: no fragment, no query, no trailing slash (except the root). */
export function normalizePageUrl(raw: string, base?: URL): URL | null {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(u.protocol)) return null;
  u.hash = "";
  u.search = "";
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  return u;
}

export function extractLinks(html: string, base: URL): URL[] {
  const out: URL[] = [];
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"'#][^"']*)["']/gi)) {
    const u = normalizePageUrl(m[1]!.replace(/&amp;/g, "&"), base);
    if (u) out.push(u);
  }
  return out;
}

export function parseSitemap(xml: string) {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.replace(/&amp;/g, "&"));
  return { isIndex: /<sitemapindex/i.test(xml), locs };
}

/** Lower is fetched sooner: the start page, then pages a receptionist needs, then shallow pages. */
function priority(u: URL, start: URL) {
  if (u.pathname === start.pathname) return -1;
  const depth = u.pathname.split("/").filter(Boolean).length;
  return (USEFUL.test(u.pathname) ? 0 : 10) + depth;
}

async function sitemapUrls(origin: URL, deadline: number): Promise<string[]> {
  const urls: string[] = [];
  const queue = [new URL("/sitemap.xml", origin).toString()];
  for (let i = 0; i < queue.length && i < 4 && Date.now() < deadline; i++) {
    try {
      const page = await fetchPage(queue[i]!, { xml: true });
      const map = parseSitemap(page.body);
      if (map.isIndex) queue.push(...map.locs.slice(0, 3));
      else urls.push(...map.locs);
    } catch {
      // No sitemap (or an unreadable one): links on the pages will do.
    }
  }
  return urls;
}

export type ImportedPage = { url: string; title: string; result: "added" | "updated" | "failed"; error?: string };

export async function importWebsite(ctx: Ctx, rawUrl: string, opts: { maxPages?: number; budgetMs?: number } = {}) {
  assertCan(ctx, "business.manage");
  const maxPages = Math.min(opts.maxPages ?? MAX_SITE_PAGES, MAX_SITE_PAGES);
  const deadline = Date.now() + (opts.budgetMs ?? 40_000);

  const start = normalizePageUrl(rawUrl.trim());
  if (!start) throw invalid("Please enter a valid website address.");
  const first = await fetchPage(start.toString()); // fails loudly if the site itself can't be reached
  if (!first.html) throw invalid("That address isn't a web page.");
  const home = normalizePageUrl(first.url.toString())!;
  const site = siteKey(home.hostname);
  const onSite = (u: URL) => siteKey(u.hostname) === site && !SKIP.test(u.pathname);

  const seen = new Set<string>([home.toString()]);
  const queue: URL[] = [];
  const enqueue = (u: URL | null) => {
    if (!u || !onSite(u)) return;
    const key = u.toString();
    if (seen.has(key)) return;
    seen.add(key);
    queue.push(u);
  };

  const pages: { url: string; title: string; text: string }[] = [];
  const texts = new Set<string>();
  const keep = (url: URL, title: string | undefined, text: string) => {
    const hash = createHash("sha1").update(text).digest("hex");
    if (text.length < MIN_TEXT || texts.has(hash) || pages.length >= maxPages) return;
    texts.add(hash);
    pages.push({ url: url.toString(), title: (title || url.pathname).slice(0, 200), text });
  };

  keep(home, first.title, first.text);
  for (const l of extractLinks(first.html, first.url)) enqueue(l);
  for (const s of await sitemapUrls(home, deadline)) enqueue(normalizePageUrl(s));

  while (queue.length && pages.length < maxPages && Date.now() < deadline) {
    queue.sort((a, b) => priority(a, home) - priority(b, home));
    const batch = queue.splice(0, CONCURRENCY);
    const fetched = await Promise.all(batch.map((u) => fetchPage(u.toString()).catch(() => null)));
    for (const page of fetched) {
      if (!page?.html) continue;
      const final = normalizePageUrl(page.url.toString());
      if (!final || !onSite(final)) continue; // redirected off-site
      keep(final, page.title, page.text);
      for (const l of extractLinks(page.html, page.url)) enqueue(l);
    }
  }
  if (!pages.length) throw invalid("No readable pages were found on that website.");

  // Save: one source per page; pages imported before are updated, not duplicated.
  const db = dbOf(ctx);
  const existing = await db
    .select({ id: knowledgeSources.id, url: knowledgeSources.url })
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.businessId, ctx.businessId), eq(knowledgeSources.kind, "url")));
  const byUrl = new Map(existing.map((e) => [e.url && normalizePageUrl(e.url)?.toString(), e.id]));

  const results: ImportedPage[] = [];
  for (const p of pages) {
    let id = byUrl.get(p.url);
    const result: ImportedPage["result"] = id ? "updated" : "added";
    if (!id) {
      const [row] = await db.insert(knowledgeSources).values({ businessId: ctx.businessId, kind: "url", title: p.title, url: p.url }).returning({ id: knowledgeSources.id });
      id = row!.id;
    }
    const s = await indexSource(ctx, id, { text: p.text, title: p.title });
    results.push(s.status === "indexed" ? { url: p.url, title: s.title, result } : { url: p.url, title: s.title, result: "failed", error: s.error ?? undefined });
  }

  const count = (r: ImportedPage["result"]) => results.filter((x) => x.result === r).length;
  const summary = { added: count("added"), updated: count("updated"), failed: count("failed"), more: queue.length > 0 };
  await audit(ctx, { action: "knowledge.updated", summary: `Website ${home.hostname} imported: ${summary.added} pages added, ${summary.updated} updated`, entityType: "knowledge_source" });
  return { site: home.hostname, pages: results, ...summary };
}
