/**
 * Connectors: how events from a business's existing systems reach us.
 *
 * We sit on top of the tools a business already uses — we don't replace
 * their phone system, CRM or booking software. Each connector either works
 * today (and says what it needs) or is honestly marked as not available.
 */
import { and, eq } from "drizzle-orm";
import { db as rootDb } from "@/db";
import { integrations } from "@/db/schema";
import { audit } from "../audit";
import { randomToken } from "../auth";
import { assertCan, dbOf, invalid, type Ctx } from "../context";
import { decryptSecret, ENCRYPTION_HINT, encryptionConfigured, encryptSecret } from "./crypto";

export type ConnectorStatus = "active" | "ready" | "config" | "na";

export type ConnectorInfo = {
  key: string;
  name: string;
  description: string;
  status: ConnectorStatus;
  hint?: string;
  events: string[];
};

export const WEBHOOK_PROVIDER = "webhook";
export const TWILIO_VOICE_PROVIDER = "twilio_voice";

export async function webhookState(ctx: Ctx) {
  const row = await dbOf(ctx).query.integrations.findFirst({
    where: and(eq(integrations.businessId, ctx.businessId), eq(integrations.provider, WEBHOOK_PROVIDER)),
  });
  return { encryption: encryptionConfigured(), hasSecret: Boolean(row?.secretCiphertext), lastEventAt: row?.lastEventAt ?? null, connectedAt: row?.connectedAt ?? null };
}

export async function listConnectors(ctx: Ctx): Promise<ConnectorInfo[]> {
  const hook = await webhookState(ctx);
  const twilio = Boolean(process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_ACCOUNT_SID);
  const voice = await dbOf(ctx).query.integrations.findFirst({
    where: and(eq(integrations.businessId, ctx.businessId), eq(integrations.provider, TWILIO_VOICE_PROVIDER)),
  });
  return [
    {
      key: WEBHOOK_PROVIDER,
      name: "Universal webhook",
      description: "Any phone system, form tool or automation platform (Zapier, Make, n8n, RingCentral, Aircall, 3CX…) can send signed events.",
      status: !hook.encryption ? "config" : hook.lastEventAt ? "active" : hook.hasSecret ? "ready" : "config",
      hint: !hook.encryption ? ENCRYPTION_HINT : hook.hasSecret ? undefined : "Generate a signing secret below to start receiving events.",
      events: ["call.missed", "call.completed", "lead.created", "slot.opened"],
    },
    {
      key: TWILIO_VOICE_PROVIDER,
      name: "Twilio Voice",
      description: "Forward your Twilio number to your phone; unanswered calls are detected automatically.",
      status: !twilio ? "config" : voice?.lastEventAt ? "active" : "ready",
      hint: twilio ? undefined : "Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
      events: ["call.missed", "call.completed"],
    },
    { key: "booking_systems", name: "Booking & practice software", description: "Read-only sync with Fresha, Jane, Mindbody, Dentrix and others.", status: "na", hint: "Not available yet — each requires a partner API.", events: [] },
  ];
}

/** Create or rotate the webhook signing secret. Returned once; only the encrypted form is stored. */
export async function rotateWebhookSecret(ctx: Ctx) {
  assertCan(ctx, "business.manage");
  if (!encryptionConfigured()) throw invalid(`Configuration required: ${ENCRYPTION_HINT}`);
  const secret = `whsec_${randomToken(24)}`;
  const ciphertext = encryptSecret(secret);
  const now = new Date();
  const existing = await webhookState(ctx);
  await dbOf(ctx)
    .insert(integrations)
    .values({ businessId: ctx.businessId, provider: WEBHOOK_PROVIDER, status: "connected", secretCiphertext: ciphertext, connectedAt: now })
    .onConflictDoUpdate({ target: [integrations.businessId, integrations.provider], set: { secretCiphertext: ciphertext, status: "connected", connectedAt: now } });
  await audit(ctx, {
    action: "integration.updated",
    summary: existing.hasSecret ? "Webhook signing secret rotated — the old secret stopped working" : "Webhook signing secret created",
    entityType: "integration",
    entityId: WEBHOOK_PROVIDER,
  });
  return secret;
}

/** The plain secret for verifying an incoming request, or null when not set up. Server-side only. */
export async function webhookSecretFor(businessId: string) {
  const row = await rootDb.query.integrations.findFirst({
    where: and(eq(integrations.businessId, businessId), eq(integrations.provider, WEBHOOK_PROVIDER)),
  });
  return row?.secretCiphertext ? decryptSecret(row.secretCiphertext) : null;
}

/** Record that the Twilio Voice connector is in use (no secret: Twilio requests are verified with TWILIO_AUTH_TOKEN). */
export async function touchTwilioVoice(businessId: string) {
  const now = new Date();
  await rootDb
    .insert(integrations)
    .values({ businessId, provider: TWILIO_VOICE_PROVIDER, status: "connected", connectedAt: now, lastEventAt: now })
    .onConflictDoUpdate({ target: [integrations.businessId, integrations.provider], set: { lastEventAt: now } });
}
