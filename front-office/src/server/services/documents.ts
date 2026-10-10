/**
 * Text extraction for uploaded knowledge documents: PDF, Word (.docx),
 * and plain text formats. The file type is checked from its bytes, not just
 * its name. Scanned PDFs (images with no selectable text) are reported as
 * such rather than imported empty.
 */
import { invalid } from "../context";
import { htmlToText } from "./knowledge";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel functions accept request bodies up to 4.5 MB.

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

export async function extractDocumentText(name: string, bytes: Uint8Array): Promise<{ text: string; format: "pdf" | "docx" | "html" | "text" }> {
  if (!bytes.length) throw invalid("That file is empty.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw invalid("That file is too large (max 4 MB).");
  const lower = name.toLowerCase();

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) {
    // %PDF
    const { extractText, getDocumentProxy } = await import("unpdf");
    let text: string;
    try {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      text = (await extractText(pdf, { mergePages: true })).text;
    } catch {
      throw invalid("That PDF couldn't be read. It may be damaged or password-protected.");
    }
    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (text.replace(/\s/g, "").length < 20) throw invalid("That PDF has no selectable text (it looks like a scan). Paste the text into the Text tab instead.");
    return { text, format: "pdf" };
  }

  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // ZIP container — only Word .docx is supported.
    if (!lower.endsWith(".docx")) throw invalid("Only Word (.docx) files are supported from Office documents.");
    const mammoth = await import("mammoth");
    let text: string;
    try {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } catch {
      throw invalid("That Word file couldn't be read.");
    }
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    if (!text) throw invalid("That Word file has no text.");
    return { text, format: "docx" };
  }

  if (/\.(docx?|pptx?|xlsx?|rtf|pages|key|numbers)$/.test(lower))
    throw invalid("That file type isn't supported. Upload a PDF, a Word .docx or a text file — or save it as PDF first.");

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (text.includes("\u0000")) throw invalid("That file type isn't supported. Upload a PDF, a Word .docx or a text file.");
  if (/\.html?$/.test(lower)) return { text: htmlToText(text), format: "html" };
  return { text: text.trim(), format: "text" };
}
