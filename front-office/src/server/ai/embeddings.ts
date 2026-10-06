/**
 * Embedding provider for semantic knowledge search (optional).
 * Uses Voyage AI when VOYAGE_API_KEY is set; otherwise retrieval uses
 * Postgres full-text + trigram search only.
 */
import { EMBEDDING_DIMENSIONS } from "@/db/schema";

export const embeddingsEnabled = () => Boolean(process.env.VOYAGE_API_KEY);

export async function embedTexts(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  if (!embeddingsEnabled()) throw new Error("Embeddings are not configured");
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64);
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: batch,
        model: process.env.VOYAGE_MODEL ?? "voyage-3.5",
        input_type: inputType,
        output_dimension: EMBEDDING_DIMENSIONS,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Embedding provider returned ${res.status}`);
    const body = (await res.json()) as { data: { embedding: number[] }[] };
    out.push(...body.data.map((d) => d.embedding));
  }
  return out;
}
