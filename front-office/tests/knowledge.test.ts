import { describe, expect, it } from "vitest";
import { addSource, assertPublicUrl, chunkText, deleteSource, htmlToText, parseFaqs, searchKnowledge } from "@/server/services/knowledge";
import { createClinic } from "./helpers";

describe("knowledge base", () => {
  it("parses FAQs and chunks long documents", () => {
    expect(parseFaqs("Q: A?\nA: yes\n\nQ: B?\nA: no")).toEqual([{ q: "A?", a: "yes" }, { q: "B?", a: "no" }]);
    const long = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${"lorem ipsum ".repeat(20)}`).join("\n\n");
    const chunks = chunkText(long);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.length < 1500)).toBe(true);
    expect(htmlToText("<p>Hello <b>there</b></p><script>evil()</script>")).toBe("Hello there");
  });

  it("indexes sources and retrieves the relevant answer", async () => {
    const c = await createClinic();
    const doc = await addSource(c.ctx, { kind: "text", title: "Aftercare", content: "After whitening, avoid coffee, tea and red wine for 48 hours." });
    expect(doc.status).toBe("indexed");
    expect(doc.chunkCount).toBe(1);
    const hits = await searchKnowledge(c.ctx, "Can I drink coffee after whitening?");
    expect(hits[0]?.content).toMatch(/avoid coffee/);
    await deleteSource(c.ctx, doc.id);
    expect((await searchKnowledge(c.ctx, "coffee after whitening")).some((h) => h.content.includes("avoid coffee"))).toBe(false);
  });

  it("rejects malformed FAQs and private/internal URLs (SSRF)", async () => {
    const c = await createClinic();
    await expect(addSource(c.ctx, { kind: "faq", title: "Bad", content: "just text" })).rejects.toThrow(/Q:/);
    for (const url of ["http://localhost:3000/admin", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data", "http://10.0.0.5/", "file:///etc/passwd"])
      await expect(assertPublicUrl(url)).rejects.toThrow();
  });
});
