/**
 * Twilio Voice connector (missed-call detection for businesses whose number
 * is on Twilio). Point the number's "A call comes in" webhook at
 * /api/integrations/twilio-voice/<key>/incoming: we forward the call to the
 * business phone with <Dial>, and Twilio reports the outcome to /status.
 * Every request is verified with X-Twilio-Signature.
 */
import { twiml } from "../channels/twilio";

export function voicePublicUrl(origin: string, key: string, step: "incoming" | "status") {
  return `${process.env.APP_URL ?? origin}/api/integrations/twilio-voice/${key}/${step}`;
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Forward the call to the business; Twilio POSTs the result (DialCallStatus) to `action`. */
export function dialTwiml(forwardTo: string, action: string, timeoutSeconds = 20) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial action="${xmlEscape(action)}" method="POST" timeout="${timeoutSeconds}">${xmlEscape(forwardTo)}</Dial></Response>`;
}

export const emptyTwiml = () => twiml(null);

/**
 * Map Twilio's call outcome to a normalized event.
 * DialCallStatus (from <Dial action>) wins over CallStatus (status callback).
 */
export function normalizeTwilioCall(fields: Record<string, string>) {
  const status = (fields.DialCallStatus || fields.CallStatus || "").toLowerCase();
  const from = fields.From ?? "";
  if (!fields.CallSid || !from) return null;
  const missed: Record<string, "no_answer" | "busy" | "failed" | "abandoned"> = { "no-answer": "no_answer", busy: "busy", failed: "failed", canceled: "abandoned" };
  if (missed[status])
    return { externalId: fields.CallSid, type: "call.missed" as const, payload: { from, to: fields.To || undefined, callerName: fields.CallerName || undefined, reason: missed[status] } };
  if (status === "completed" || status === "answered")
    return {
      externalId: fields.CallSid,
      type: "call.completed" as const,
      payload: { direction: "inbound", customer: from, durationSeconds: fields.DialCallDuration ? Number(fields.DialCallDuration) : undefined },
    };
  return null; // ringing / in-progress / queued: not an outcome
}
