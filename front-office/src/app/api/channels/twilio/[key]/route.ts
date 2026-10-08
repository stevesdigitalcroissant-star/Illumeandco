import { handleInbound } from "@/server/ai/orchestrator";
import { verifyTwilioSignature, twiml } from "@/server/channels/twilio";
import { widgetBusiness } from "@/server/channels/web-chat";
import { ownsNumber } from "@/server/services/senders";

export const maxDuration = 60;

/** Twilio messaging webhook (SMS and WhatsApp) → the same AI orchestrator as website chat. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return new Response("Twilio is not configured", { status: 503 });
  const form = await req.formData();
  const fields = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const publicUrl = `${process.env.APP_URL ?? new URL(req.url).origin}/api/channels/twilio/${key}`;
  if (!verifyTwilioSignature(token, publicUrl, fields, req.headers.get("x-twilio-signature")))
    return new Response("Invalid signature", { status: 403 });
  const business = await widgetBusiness(key);
  if (!business) return new Response("Unknown business", { status: 404 });

  const from = fields.From ?? "";
  const whatsapp = from.startsWith("whatsapp:");
  const phone = from.replace(/^whatsapp:/, "");
  const body = (fields.Body ?? "").trim();
  if (!phone || !body) return new Response(twiml(null), { headers: { "Content-Type": "text/xml" } });
  // The number messaged must be this business's own number (when it has one) — never route another business's replies here.
  if (fields.To && !ownsNumber(business, fields.To, whatsapp)) {
    console.warn(`[twilio] message to ${fields.To} reached business ${business.id}, which doesn't own that number — ignored`);
    return new Response(twiml(null), { headers: { "Content-Type": "text/xml" } });
  }

  const result = await handleInbound({
    businessId: business.id,
    channel: whatsapp ? "whatsapp" : "sms",
    identity: phone,
    text: body,
    contact: { phone },
  });
  return new Response(twiml(result.reply), { headers: { "Content-Type": "text/xml" } });
}
