import { verifyTwilioSignature } from "@/server/channels/twilio";
import { widgetBusiness } from "@/server/channels/web-chat";
import { touchTwilioVoice, TWILIO_VOICE_PROVIDER } from "@/server/integrations/connectors";
import { ingestEvent } from "@/server/integrations/ingest";
import { dialTwiml, emptyTwiml, voicePublicUrl } from "@/server/integrations/twilio-voice";

const xml = (body: string) => new Response(body, { headers: { "Content-Type": "text/xml" } });

/** Twilio "A call comes in" webhook: forward to the business phone and ask Twilio to report the outcome. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return new Response("Twilio is not configured", { status: 503 });
  const fields = Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]));
  const origin = new URL(req.url).origin;
  if (!verifyTwilioSignature(token, voicePublicUrl(origin, key, "incoming"), fields, req.headers.get("x-twilio-signature")))
    return new Response("Invalid signature", { status: 403 });
  const business = await widgetBusiness(key);
  if (!business) return new Response("Unknown business", { status: 404 });
  await touchTwilioVoice(business.id);
  if (!business.phone) {
    // Nowhere to forward to: the call can't be answered, so it is a missed call.
    if (fields.CallSid && fields.From)
      await ingestEvent(business.id, { connector: TWILIO_VOICE_PROVIDER, externalId: fields.CallSid, type: "call.missed", payload: { from: fields.From, reason: "failed" } });
    return xml(emptyTwiml());
  }
  return xml(dialTwiml(business.phone, voicePublicUrl(origin, key, "status")));
}
