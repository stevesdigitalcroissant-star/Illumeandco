/** Knowledge documents: text is extracted from PDF and Word files, checked by content, not just name. */
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractDocumentText } from "@/server/services/documents";
import { addSource, searchKnowledge } from "@/server/services/knowledge";
import { createClinic } from "./helpers";

/** A minimal, valid one-page PDF with the given lines of text. */
function makePdf(lines: string[]) {
  const stream = `BT /F1 12 Tf 50 750 Td 14 TL ${lines.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

async function makeDocx(paragraphs: string[]) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

describe("document text extraction", () => {
  it("reads PDFs", async () => {
    const r = await extractDocumentText("Price list.pdf", makePdf(["Hydrafacial treatment costs 120 dollars.", "Botox from 300 dollars per area."]));
    expect(r.format).toBe("pdf");
    expect(r.text).toContain("Hydrafacial treatment costs 120 dollars.");
    expect(r.text).toContain("Botox from 300 dollars per area.");
  });

  it("reads Word .docx files", async () => {
    const r = await extractDocumentText("Aftercare.docx", await makeDocx(["Aftercare after whitening", "Avoid coffee and red wine for 48 hours."]));
    expect(r).toMatchObject({ format: "docx" });
    expect(r.text).toContain("Avoid coffee and red wine for 48 hours.");
  });

  it("reads text and HTML; rejects scans, unsupported and oversized files", async () => {
    expect((await extractDocumentText("notes.txt", new TextEncoder().encode("Parking is free."))).text).toBe("Parking is free.");
    expect((await extractDocumentText("page.html", new TextEncoder().encode("<p>Open <b>Sundays</b></p><script>x()</script>"))).text).toBe("Open Sundays");
    await expect(extractDocumentText("scan.pdf", makePdf([]))).rejects.toThrow(/no selectable text/);
    await expect(extractDocumentText("old.doc", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).rejects.toThrow(/isn't supported/);
    await expect(extractDocumentText("sheet.xlsx", await makeDocx(["x"]))).rejects.toThrow(/Only Word/);
    await expect(extractDocumentText("big.txt", new Uint8Array(4 * 1024 * 1024 + 1).fill(65))).rejects.toThrow(/too large/);
    await expect(extractDocumentText("empty.pdf", new Uint8Array())).rejects.toThrow(/empty/);
  });

  it("an uploaded PDF becomes searchable knowledge for that business only", async () => {
    const a = await createClinic("A");
    const b = await createClinic("B");
    const { text } = await extractDocumentText("menu.pdf", makePdf(["Hydrafacial treatment costs 120 dollars."]));
    const s = await addSource(a.ctx, { kind: "document", title: "Treatment menu", content: text });
    expect(s.status).toBe("indexed");
    expect((await searchKnowledge(a.ctx, "how much is a hydrafacial"))[0]?.content).toContain("120 dollars");
    expect(await searchKnowledge(b.ctx, "how much is a hydrafacial")).toHaveLength(0);
  });
});
