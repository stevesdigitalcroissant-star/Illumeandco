import { clientIp, rateLimit } from "@/lib/rate-limit";
import { widgetBusiness } from "@/server/channels/web-chat";
import { webhookSecretFor, WEBHOOK_PROVIDER } from "@/server/integrations/connectors";
import { verifyWebhookSignature } from "@/server/integrations/crypto";
import { webhookEnvelope } from "@/server/integrations/events";
import { ingestEvent } from "@/server/integrations/ingest";

export const maxDuration = 60;
const MAX_BODY = 64 * 1024;

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * Universal signed webhook: POST /api/integrations/webhook/<business public key>
 *
 *   X-AFO-Timestamp: <unix seconds>
 *   X-AFO-Signature: hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
 *   { "id": "your-event-id", "type": "call.missed", "occurredAt": "…", "data": { "from": "+1512…" } }
 *
 * The business is identified by the URL; the signature proves the sender
 * holds that business's secret. Duplicate ids are acknowledged, not re-run.
 */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!(await rateLimit(`hook:${key}:${clientIp(req.headers)}`, 120, 60_000)).ok) return json({ error: "Too many requests" }, 429);
  const business = await widgetBusiness(key);
  if (!business) return json({ error: "Unknown business" }, 404);
  const secret = await webhookSecretFor(business.id);
  if (!secret) return json({ error: "Webhook not configured for this business (configuration required)" }, 503);

  const body = await req.text();
  if (body.length > MAX_BODY) return json({ error: "Payload too large" }, 413);
  const check = verifyWebhookSignature(secret, { timestamp: req.headers.get("x-afo-timestamp"), signature: req.headers.get("x-afo-signature"), body });
  if (!check.ok) return json({ error: check.reason }, 401);

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const env = webhookEnvelope.safeParse(raw);
  if (!env.success) return json({ error: "Invalid envelope", issues: env.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);

  const r = await ingestEvent(business.id, {
    connector: WEBHOOK_PROVIDER,
    externalId: env.data.id,
    type: env.data.type,
    occurredAt: env.data.occurredAt ? new Date(env.data.occurredAt) : undefined,
    payload: env.data.data,
  });
  return json({ duplicate: r.duplicate, status: r.event.status, result: r.event.result });
}
