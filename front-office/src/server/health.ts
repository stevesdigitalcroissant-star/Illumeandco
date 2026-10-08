/**
 * Health check: is the database reachable and migrated, is the background
 * job running, and which integrations are configured (booleans only — never
 * values). Used by uptime monitors and the operator.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { heartbeats } from "@/db/schema";
import { emailConfigured } from "./account";
import { twilioCredentials } from "./channels/adapters";
import { encryptionConfigured } from "./integrations/crypto";
import { sharedRateLimitConfigured } from "@/lib/rate-limit";

/** A tick older than this means cron isn't running (it's scheduled every 5 minutes). */
const TICK_STALE_MS = 20 * 60_000;

export async function recordHeartbeat(name: string, detail: Record<string, unknown> = {}, at = new Date()) {
  await db.insert(heartbeats).values({ name, at, detail }).onConflictDoUpdate({ target: heartbeats.name, set: { at, detail } });
}

function expectedMigrations() {
  try {
    const journal = JSON.parse(readFileSync(path.join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as { entries: unknown[] };
    return journal.entries.length;
  } catch {
    return null;
  }
}

export async function healthReport(now = new Date()) {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  try {
    await db.execute(sql`select 1`);
    checks.database = { ok: true };
  } catch (e) {
    return { status: "down" as const, checks: { database: { ok: false, detail: (e as Error).message.slice(0, 200) } }, config: null };
  }
  try {
    const [m] = (await db.execute<{ n: string }>(sql`select count(*) as n from drizzle.__drizzle_migrations`)).rows;
    const applied = Number(m?.n ?? 0);
    const expected = expectedMigrations();
    checks.migrations = { ok: expected === null || applied >= expected, detail: `${applied} applied${expected === null ? "" : ` of ${expected}`}` };
  } catch {
    checks.migrations = { ok: false, detail: "Migration table not found — run npm run db:migrate" };
  }
  const tick = await db.query.heartbeats.findFirst({ where: (h, { eq }) => eq(h.name, "tick") });
  checks.backgroundJobs = !tick
    ? { ok: false, detail: "The background job has never run — schedule /api/cron/tick (CRON_SECRET)" }
    : { ok: now.getTime() - tick.at.getTime() < TICK_STALE_MS, detail: `Last ran ${Math.round((now.getTime() - tick.at.getTime()) / 60_000)} min ago` };

  const config = {
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    sms: twilioCredentials(),
    email: emailConfigured(),
    encryptionKey: encryptionConfigured(),
    sharedRateLimit: sharedRateLimitConfigured(),
    cronSecret: Boolean(process.env.CRON_SECRET),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    appUrl: Boolean(process.env.APP_URL),
  };
  const status = Object.values(checks).every((c) => c.ok) ? ("ok" as const) : ("degraded" as const);
  return { status, checks, config };
}
