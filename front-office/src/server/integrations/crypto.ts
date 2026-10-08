/**
 * Encryption for per-business integration secrets (AES-256-GCM).
 *
 * APP_ENCRYPTION_KEY must be 32 bytes, given as 64 hex characters or base64.
 * Without it, features that need a stored secret report "configuration
 * required" — secrets are never stored in plain text.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function key(): Buffer | null {
  const raw = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

export const encryptionConfigured = () => key() !== null;
export const ENCRYPTION_HINT = "Set APP_ENCRYPTION_KEY (32 random bytes as 64 hex characters, e.g. `openssl rand -hex 32`).";

export function encryptSecret(plain: string) {
  const k = key();
  if (!k) throw new Error("APP_ENCRYPTION_KEY is not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

/** Returns null when the key is missing or the ciphertext was not made with it. */
export function decryptSecret(ciphertext: string): string | null {
  const k = key();
  const [v, iv, tag, body] = ciphertext.split(".");
  if (!k || v !== "v1" || !iv || !tag || !body) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ─── Webhook signatures ────────────────────────────────────────────────
/** Signature = hex HMAC-SHA256 of `${timestamp}.${rawBody}` with the business's webhook secret. */
export function webhookSignature(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export const SIGNATURE_TOLERANCE_MS = 5 * 60_000;

export function verifyWebhookSignature(
  secret: string,
  input: { timestamp: string | null; signature: string | null; body: string },
  now = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (!input.timestamp || !input.signature) return { ok: false, reason: "Missing X-AFO-Timestamp or X-AFO-Signature" };
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "Invalid timestamp" };
  // Seconds since epoch; reject stale or future-dated requests (replay protection).
  if (Math.abs(now - ts * 1000) > SIGNATURE_TOLERANCE_MS) return { ok: false, reason: "Timestamp outside the allowed window" };
  const expected = Buffer.from(webhookSignature(secret, input.timestamp, input.body));
  const got = Buffer.from(input.signature.replace(/^sha256=/, ""));
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, reason: "Signature mismatch" };
  return { ok: true };
}
