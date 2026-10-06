/**
 * Inbound SMS / WhatsApp via Twilio. Twilio POSTs form-encoded messages to
 * /api/channels/twilio/<business public key>; we verify X-Twilio-Signature
 * (HMAC-SHA1 of the full URL + sorted params with the auth token) before
 * trusting anything.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function verifyTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | null) {
  if (!signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function twiml(message: string | null) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${esc(message)}</Message>` : ""}</Response>`;
}
