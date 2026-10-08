/**
 * Integration event pipeline: store once → claim → normalize → route to a
 * revenue worker → record the outcome.
 *
 * - Idempotent: (business, connector, external id) is unique, so a webhook
 *   delivered twice is stored and processed once.
 * - At-most-once side effects: an event is claimed (status → processing)
 *   before work starts; workers themselves are idempotent (one open
 *   opportunity per key, one text-back per caller per day), so a retry after
 *   a crash cannot double-text anyone.
 * - Not wrapped in one transaction on purpose: a message accepted by a
 *   provider can't be rolled back, so its follow-up row must survive.
 */
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db as rootDb } from "@/db";
import { integrationEvents, integrations } from "@/db/schema";
import { assertCan, type Ctx } from "../context";
import { onCallCompleted, onMissedCall } from "../recovery/missed-calls";
import { normalizedEvent, SUPPORTED_EVENT_TYPES } from "./events";

export type IntegrationEvent = typeof integrationEvents.$inferSelect;
const MAX_ATTEMPTS = 5;

export async function ingestEvent(
  businessId: string,
  input: { connector: string; externalId: string; type: string; occurredAt?: Date; payload: Record<string, unknown> },
  now = new Date(),
) {
  const [inserted] = await rootDb
    .insert(integrationEvents)
    .values({
      businessId,
      connector: input.connector,
      externalId: input.externalId,
      type: input.type,
      occurredAt: input.occurredAt ?? now,
      payload: input.payload,
    })
    .onConflictDoNothing({ target: [integrationEvents.businessId, integrationEvents.connector, integrationEvents.externalId] })
    .returning();
  await rootDb
    .update(integrations)
    .set({ lastEventAt: now })
    .where(and(eq(integrations.businessId, businessId), eq(integrations.provider, input.connector)));
  if (!inserted) {
    const existing = await rootDb.query.integrationEvents.findFirst({
      where: and(eq(integrationEvents.businessId, businessId), eq(integrationEvents.connector, input.connector), eq(integrationEvents.externalId, input.externalId)),
    });
    return { duplicate: true, event: existing! };
  }
  return { duplicate: false, event: await processEvent(inserted.id, now) };
}

/** Claim and process one event. Returns the final row (or the current one if another worker holds it). */
export async function processEvent(eventId: string, now = new Date()): Promise<IntegrationEvent> {
  const [claimed] = await rootDb
    .update(integrationEvents)
    .set({ status: "processing", attempts: sql`${integrationEvents.attempts} + 1` })
    .where(
      and(
        eq(integrationEvents.id, eventId),
        or(
          inArray(integrationEvents.status, ["received", "failed"]),
          // A worker that died mid-way leaves "processing" behind; reclaim after 10 minutes.
          and(eq(integrationEvents.status, "processing"), lt(integrationEvents.updatedAt, new Date(now.getTime() - 10 * 60_000))),
        ),
        lt(integrationEvents.attempts, MAX_ATTEMPTS),
      ),
    )
    .returning();
  if (!claimed) return (await rootDb.query.integrationEvents.findFirst({ where: eq(integrationEvents.id, eventId) }))!;

  const finish = async (patch: Partial<IntegrationEvent>) =>
    (await rootDb.update(integrationEvents).set({ processedAt: new Date(), ...patch }).where(eq(integrationEvents.id, eventId)).returning())[0]!;

  if (!(SUPPORTED_EVENT_TYPES as readonly string[]).includes(claimed.type))
    return finish({ status: "ignored", result: `Event type "${claimed.type}" isn't used yet — stored for later.` });
  const parsed = normalizedEvent.safeParse({ ...claimed.payload, type: claimed.type });
  if (!parsed.success)
    return finish({ status: "ignored", result: `Invalid payload: ${parsed.error.issues.map((i) => `${i.path.join(".") || "data"} ${i.message}`).join("; ").slice(0, 400)}` });

  const ctx: Ctx = { businessId: claimed.businessId, actor: { type: "system", name: "Missed call recovery" } };
  try {
    const ev = parsed.data;
    const r =
      ev.type === "call.missed"
        ? await onMissedCall(ctx, { from: ev.from, callerName: ev.callerName, reason: ev.reason, voicemailTranscript: ev.voicemailTranscript, occurredAt: claimed.occurredAt }, now)
        : await onCallCompleted(ctx, { customer: ev.customer, direction: ev.direction, occurredAt: claimed.occurredAt });
    if (!r.handled) return finish({ status: "ignored", result: r.detail });
    return finish({ status: "processed", result: r.detail, customerId: r.customerId, opportunityId: r.opportunityId });
  } catch (e) {
    console.error(`[integrations] event ${eventId} failed`, e);
    return finish({ status: "failed", result: (e as Error).message.slice(0, 400), processedAt: null });
  }
}

/** Background retry: failed events (with backoff), and events stranded before processing. */
export async function retryPendingEvents(now = new Date(), businessId?: string) {
  const rows = await rootDb
    .select({ id: integrationEvents.id, status: integrationEvents.status, attempts: integrationEvents.attempts, updatedAt: integrationEvents.updatedAt })
    .from(integrationEvents)
    .where(
      and(
        businessId ? eq(integrationEvents.businessId, businessId) : undefined,
        inArray(integrationEvents.status, ["received", "failed", "processing"]),
        lt(integrationEvents.attempts, MAX_ATTEMPTS),
        lt(integrationEvents.updatedAt, new Date(now.getTime() - 60_000)),
      ),
    )
    .limit(100);
  let n = 0;
  for (const r of rows) {
    const backoff = r.status === "failed" ? 2 ** r.attempts * 60_000 : 0;
    if (now.getTime() - r.updatedAt.getTime() < backoff) continue;
    await processEvent(r.id, now);
    n++;
  }
  return n;
}

export async function listRecentEvents(ctx: Ctx, limit = 20) {
  assertCan(ctx, "business.manage");
  return rootDb
    .select()
    .from(integrationEvents)
    .where(eq(integrationEvents.businessId, ctx.businessId))
    .orderBy(desc(integrationEvents.createdAt))
    .limit(limit);
}
