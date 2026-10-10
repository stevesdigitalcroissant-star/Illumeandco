/** Whole-website import: discovers same-site pages, skips junk, updates instead of duplicating, stays per-business. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeSources } from "@/db/schema";
import { searchKnowledge } from "@/server/services/knowledge";
import { extractLinks, importWebsite, normalizePageUrl, parseSitemap } from "@/server/services/website-import";
import { createClinic } from "./helpers";

const found = async (ctx: Parameters<typeof searchKnowledge>[0], q: string, text: string) => (await searchKnowledge(ctx, q)).some((h) => h.content.includes(text));

const SITE = "http://93.184.215.14"; // a public IP literal: no DNS lookup needed
const page = (title: string, body: string, links: string[] = []) =>
  `<html><head><title>${title}</title></head><body><nav>${links.map((l) => `<a href="${l}">x</a>`).join("")}</nav><main><p>${body}</p></main>${links.map((l) => `<a href="${l}">link</a>`).join("")}</body></html>`;
const filler = "We are a family dental clinic with friendly staff and modern equipment, open six days a week.";

let pages: Record<string, { body: string; type?: string; status?: number; location?: string }>;
let requested: string[];
beforeEach(() => {
  requested = [];
  pages = {
    "/": { body: page("Bright Dental", filler, ["/services", "/about/", "/contact#map", "/login", "/blog/tag/news", "/logo.png", "http://evil.example/steal", "mailto:hi@x.com", "/old"]) },
    "/services": { body: page("Services & prices", "Teeth whitening costs 180 dollars. Cleaning costs 85 dollars. " + filler, ["/", "/services/whitening?utm=1"]) },
    "/services/whitening": { body: page("Whitening", "Whitening takes about one hour and results last up to a year. " + filler) },
    "/about": { body: page("About us", "Dr. Amira Hassan has 15 years of experience. " + filler) },
    "/contact": { body: page("Contact", "Free parking is available under the building. " + filler) },
    "/old": { body: "", status: 301, location: "/about" },
    "/sitemap.xml": { body: `<urlset><url><loc>${SITE}/faq</loc></url><url><loc>${SITE}/services</loc></url></urlset>`, type: "application/xml" },
    "/faq": { body: page("FAQ", "Do you accept insurance? Yes, most major plans. " + filler) },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | string) => {
      const u = new URL(String(input));
      requested.push(u.pathname);
      const p = pages[u.pathname];
      if (!p) return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
      if (p.location) return new Response(null, { status: p.status, headers: { location: p.location } });
      return new Response(p.body, { status: p.status ?? 200, headers: { "content-type": p.type ?? "text/html; charset=utf-8" } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("website import helpers", () => {
  it("normalizes URLs and extracts links; reads sitemaps", () => {
    const base = new URL(`${SITE}/a/`);
    expect(normalizePageUrl("/x/?q=1#top", base)?.toString()).toBe(`${SITE}/x`);
    expect(normalizePageUrl("javascript:alert(1)", base)).toBeNull();
    expect(extractLinks(`<a class="c" href="b">x</a><a href='#top'>y</a>`, base).map(String)).toEqual([`${SITE}/a/b`]);
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://x.com/s1.xml</loc></sitemap></sitemapindex>")).toEqual({ isIndex: true, locs: ["https://x.com/s1.xml"] });
  });
});

describe("importWebsite", () => {
  it("imports the site's pages (sitemap + links), skipping logins, tags, files and other sites", async () => {
    const c = await createClinic();
    const r = await importWebsite(c.ctx, `${SITE}/`);
    expect(r.added).toBe(6);
    expect(r.failed).toBe(0);
    expect(r.pages.map((p) => new URL(p.url).pathname).sort()).toEqual(["/", "/about", "/contact", "/faq", "/services", "/services/whitening"]);
    expect(requested).not.toContain("/login");
    expect(requested).not.toContain("/logo.png");
    // /old redirects to /about: followed, but /about is stored once (checked above).
    expect(await found(c.ctx, "how much is teeth whitening", "180 dollars")).toBe(true);
    expect(await found(c.ctx, "is there parking", "Free parking is available under the building")).toBe(true);
  });

  it("importing again updates the same pages; respects the page cap; other businesses see nothing", async () => {
    const a = await createClinic("A");
    const b = await createClinic("B");
    await importWebsite(a.ctx, SITE);
    pages["/services"]!.body = page("Services & prices", "Teeth whitening costs 199 dollars. " + filler, ["/services/whitening"]);
    const again = await importWebsite(a.ctx, SITE);
    expect(again).toMatchObject({ added: 0, updated: 6 });
    const rows = await db.select().from(knowledgeSources).where(and(eq(knowledgeSources.businessId, a.business.id), eq(knowledgeSources.kind, "url")));
    expect(rows).toHaveLength(6);
    expect(await found(a.ctx, "teeth whitening price", "199 dollars")).toBe(true);
    expect(await found(a.ctx, "teeth whitening price", "180 dollars")).toBe(false);
    expect(await found(b.ctx, "teeth whitening price", "dollars")).toBe(false);

    const capped = await importWebsite(b.ctx, SITE, { maxPages: 2 });
    expect(capped.added).toBe(2);
    expect(capped.more).toBe(true);
    // The homepage and the most useful page (services/prices) come first.
    expect(capped.pages.map((p) => new URL(p.url).pathname)).toEqual(["/", "/services"]);
  });

  it("refuses private addresses and unreachable sites; staff can't import", async () => {
    const c = await createClinic();
    await expect(importWebsite(c.ctx, "http://127.0.0.1/")).rejects.toThrow(/not allowed/);
    await expect(importWebsite(c.ctx, "not a url")).rejects.toThrow(/valid website/);
    pages["/"] = { body: "", status: 500 };
    await expect(importWebsite(c.ctx, SITE)).rejects.toThrow(/returned 500/);
    const staff = { ...c.ctx, actor: { ...c.ctx.actor, role: "staff" as const } };
    await expect(importWebsite(staff, SITE)).rejects.toThrow();
  });
});
