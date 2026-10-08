import { verifyTwilioSignature } from "@/server/channels/twilio";
import { widgetBusiness } from "@/server/channels/web-chat";
import { touchTwilioVoice, TWILIO_VOICE_PROVIDER } from "@/server/integrations/connectors";
import { ingestEvent } from "@/server/integrations/ingest";
import { emptyTwiml, normalizeTwilioCall, voicePublicUrl } from "@/server/integrations/twilio-voice";

export const maxDuration = 60;

/** <Dial action> / status callback: the call's outcome → call.missed or call.completed. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return new Response("Twilio is not configured", { status: 503 });
  const fields = Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]));
  if (!verifyTwilioSignature(token, voicePublicUrl(new URL(req.url).origin, key, "status"), fields, req.headers.get("x-twilio-signature")))
    return new Response("Invalid signature", { status: 403 });
  const business = await widgetBusiness(key);
  if (!business) return new Response("Unknown business", { status: 404 });
  await touchTwilioVoice(business.id);
  const ev = normalizeTwilioCall(fields);
  if (ev) await ingestEvent(business.id, { connector: TWILIO_VOICE_PROVIDER, externalId: ev.externalId, type: ev.type, payload: ev.payload });
  // End the call quietly — we don't promise the caller a text we may not be able to send.
  return new Response(emptyTwiml(), { headers: { "Content-Type": "text/xml" } });
}
