/**
 * Staff alerts. Things that only a person can do (call a missed caller back,
 * reach a new lead, book an accepted slot, answer a handed-off customer)
 * must reach the team even when nobody is looking at the dashboard.
 *
 * - Every alert is an in-app notification (the bell), deduplicated by key.
 * - Urgent ones are also texted/emailed to the team's alert recipients,
 *   between 07:00 and 22:00 business time (later ones wait for the morning).
 * - A morning digest summarises what needs the team and what was recovered.
 *
 * Alerts are sent from the business's own number via the same channel
 * adapters, never claimed as sent unless a channel accepted them, and are
 * retried by the background tick when they couldn't go out immediately.
 */
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db as rootDb } from "@/db";
import { aiSettings, notifications, type AlertsConfig } from "@/db/schema";
import { toE164 } from "@/lib/countries";
import { formatMoney } from "@/lib/utils";
import { audit } from "../audit";
import { channelsFor, getChannel } from "../channels/registry";
import { assertCan, dbOf, invalid, type Ctx } from "../context";
import { getAiSettings, getBusiness } from "./business";

const ALERT_HOURS = { from: 7, to: 22 };
/** Urgent alerts older than this are no longer worth a text — they stay in the bell. */
const STALE_MS = 18 * 3600_000;

export type StaffNotice = { kind: string; title: string; body?: string | null; link?: string | null; dedupeKey?: string | null; urgent?: boolean };

/**
 * Record a notification and, if urgent and possible right now, alert the team.
 * Inside a transaction the outside alert is left for the tick (a text can't be rolled back).
 */
export async function notifyStaff(ctx: Ctx, n: StaffNotice, now = new Date()) {
  const [row] = await dbOf(ctx)
    .insert(notifications)
    .values({ businessId: ctx.businessId, kind: n.kind, title: n.title.slice(0, 200), body: n.body?.slice(0, 1000) ?? null, link: n.link ?? null, dedupeKey: n.dedupeKey ?? null, urgent: Boolean(n.urgent), createdAt: now })
    .onConflictDoNothing()
    .returning();
  if (row && row.urgent && !ctx.tx) await sendAlert(row.id, now).catch((e) => console.error("[alerts] send failed", e));
  return row ?? null;
}

function withinAlertHours(now: Date, tz: string) {
  const h = DateTime.fromJSDate(now).setZone(tz).hour;
  return h >= ALERT_HOURS.from && h < ALERT_HOURS.to;
}

const appUrl = () => (process.env.APP_URL ?? "").replace(/\/$/, "");

/** Send one pending urgent alert to the team. Idempotent: claims the row first. */
export async function sendAlert(notificationId: string, now = new Date()) {
  const n = await rootDb.query.notifications.findFirst({ where: eq(notifications.id, notificationId) });
  if (!n || !n.urgent || n.alertedAt) return null;
  const ctx: Ctx = { businessId: n.businessId, actor: { type: "system", name: "Staff alerts" } };
  const business = await getBusiness(ctx);
  const settings = await getAiSettings(ctx);
  const cfg = settings.alerts;
  const finish = async (result: string) => {
    await rootDb.update(notifications).set({ alertedAt: now, alertResult: result }).where(eq(notifications.id, n.id));
    return result;
  };
  if (!cfg.instant) return finish("Instant alerts are off");
  if (!cfg.smsTo.length && !cfg.emailTo.length) return finish("No alert recipients set (Settings → Team → Staff alerts)");
  if (now.getTime() - n.createdAt.getTime() > STALE_MS) return finish("Too old to alert — shown in the dashboard only");
  if (!withinAlertHours(now, business.timezone)) return null; // the tick sends it in the morning

  // Claim before sending so a concurrent tick can't text the team twice.
  const [claimed] = await rootDb
    .update(notifications)
    .set({ alertedAt: now, alertResult: "sending" })
    .where(and(eq(notifications.id, n.id), isNull(notifications.alertedAt)))
    .returning();
  if (!claimed) return null;

  const link = n.link && appUrl() ? ` ${appUrl()}${n.link}` : "";
  const text = `${business.name}: ${n.title}${n.body ? ` — ${n.body}` : ""}.${link}`.slice(0, 600);
  const result = await deliverToTeam(business, cfg, { text, subject: n.title });
  await rootDb.update(notifications).set({ alertResult: result }).where(eq(notifications.id, n.id));
  return result;
}

type BusinessRow = Awaited<ReturnType<typeof getBusiness>>;

async function deliverToTeam(business: BusinessRow, cfg: AlertsConfig, msg: { text: string; subject: string }) {
  const channels = channelsFor(business);
  const sms = channels.get("sms");
  const email = channels.get("email");
  let ok = 0;
  const problems: string[] = [];
  if (cfg.smsTo.length && !sms) problems.push("SMS isn't configured (configuration required)");
  if (cfg.emailTo.length && !email) problems.push("email isn't configured (configuration required)");
  if (sms)
    for (const phone of cfg.smsTo) {
      const r = await getChannel("sms").send({ businessId: business.id, businessName: business.name, to: { name: null, email: null, phone }, text: msg.text, from: sms.from });
      if (r.ok) ok++;
      else problems.push(`${phone}: ${r.detail}`);
    }
  if (email)
    for (const address of cfg.emailTo) {
      const r = await getChannel("email").send({ businessId: business.id, businessName: business.name, to: { name: null, email: address, phone: null }, text: msg.text, subject: msg.subject });
      if (r.ok) ok++;
      else problems.push(`${address}: ${r.detail}`);
    }
  if (!ok) return `Not sent — ${problems.join("; ") || "no channel"}`;
  return `Sent to ${ok}${problems.length ? ` (${problems.length} failed)` : ""}`;
}

/** Background: urgent alerts that couldn't go out yet (inside a transaction, or outside alert hours). */
export async function deliverPendingAlerts(now = new Date(), businessId?: string) {
  const rows = await rootDb
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.urgent, true),
        isNull(notifications.alertedAt),
        gte(notifications.createdAt, new Date(now.getTime() - 2 * STALE_MS)),
        businessId ? eq(notifications.businessId, businessId) : undefined,
      ),
    )
    .limit(200);
  let sent = 0;
  for (const r of rows) if ((await sendAlert(r.id, now))?.startsWith("Sent")) sent++;
  return sent;
}

// ─── Morning digest ───────────────────────────────────────────────────
export async function sendDigests(now = new Date(), businessId?: string) {
  const rows = await rootDb
    .select({ businessId: aiSettings.businessId, alerts: aiSettings.alerts })
    .from(aiSettings)
    .where(and(sql`(${aiSettings.alerts}->>'digest')::boolean`, businessId ? eq(aiSettings.businessId, businessId) : undefined));
  let sent = 0;
  for (const r of rows) {
    if (!r.alerts.smsTo.length && !r.alerts.emailTo.length) continue;
    const ctx: Ctx = { businessId: r.businessId, actor: { type: "system", name: "Morning summary" } };
    const business = await getBusiness(ctx);
    const local = DateTime.fromJSDate(now).setZone(business.timezone);
    if (local.hour < r.alerts.digestHour || local.hour >= ALERT_HOURS.to) continue;
    const key = `digest:${local.toISODate()}`;
    const [claimed] = await rootDb
      .insert(notifications)
      .values({ businessId: business.id, kind: "digest", title: `Morning summary — ${local.toFormat("ccc d LLL")}`, dedupeKey: key, alertedAt: now, alertResult: "sending" })
      .onConflictDoNothing()
      .returning();
    if (!claimed) continue; // already sent today
    const text = await composeDigest(ctx, business, now);
    const result = await deliverToTeam(business, r.alerts, { text, subject: claimed.title });
    await rootDb.update(notifications).set({ body: text.slice(0, 1000), alertResult: result, link: "/app/revenue" }).where(eq(notifications.id, claimed.id));
    if (result.startsWith("Sent")) sent++;
  }
  return sent;
}

export async function composeDigest(ctx: Ctx, business: BusinessRow, now: Date) {
  const { revenueFeed } = await import("../recovery/revenue");
  const feed = await revenueFeed(ctx, { now, limit: 50 });
  const since = new Date(now.getTime() - 24 * 3600_000);
  const [y] = (
    await dbOf(ctx).execute<{ n: string; v: string | null }>(sql`
      select count(*) as n, sum(recovered_value_cents) as v from opportunities
      where business_id = ${ctx.businessId} and recovered and closed_at >= ${since}`)
  ).rows;
  const [s] = (
    await dbOf(ctx).execute<{ n: string; v: string | null }>(sql`
      select count(*) as n, sum(filled_value_cents) as v from slot_recoveries
      where business_id = ${ctx.businessId} and status = 'filled' and filled_by is not null and closed_at >= ${since}`)
  ).rows;
  const count = Number(y?.n ?? 0) + Number(s?.n ?? 0);
  const value = Number(y?.v ?? 0) + Number(s?.v ?? 0);
  const lines = [
    `Good morning from ${business.name}'s front office.`,
    count ? `Last 24h: ${count} booking${count === 1 ? "" : "s"} after an AI action (${formatMoney(value, business.currency)}).` : "Last 24h: no bookings recovered yet.",
    feed.length ? `${feed.length} thing${feed.length === 1 ? "" : "s"} need${feed.length === 1 ? "s" : ""} you:` : "Nothing needs you right now.",
    ...feed.slice(0, 5).map((f) => `• ${f.who ? `${f.who} — ` : ""}${f.title}`),
  ];
  if (appUrl()) lines.push(`${appUrl()}/app/revenue`);
  return lines.join("\n");
}

// ─── Settings ─────────────────────────────────────────────────────────
const E164 = /^\+[1-9]\d{6,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateAlertsConfig(ctx: Ctx, input: { instant: boolean; digest: boolean; digestHour: number; smsTo: string; emailTo: string }) {
  assertCan(ctx, "business.manage");
  const split = (v: string, norm: (x: string) => string) => [...new Set(v.split(/[,;\n]/).map((x) => norm(x.trim())).filter(Boolean))];
  const country = (await getBusiness(ctx)).countryCode;
  const smsTo = split(input.smsTo, (p) => (p ? (toE164(p, country) ?? p.replace(/[\s()-]/g, "")) : ""));
  const emailTo = split(input.emailTo, (e) => e.toLowerCase());
  const badPhone = smsTo.find((p) => !E164.test(p));
  if (badPhone) throw invalid(`"${badPhone}" isn't a valid phone number. Include the country code if it's from another country, e.g. +1 512 555 0142.`);
  const badEmail = emailTo.find((e) => !EMAIL.test(e));
  if (badEmail) throw invalid(`"${badEmail}" isn't a valid email address.`);
  if (smsTo.length + emailTo.length > 10) throw invalid("At most 10 alert recipients.");
  if (!Number.isInteger(input.digestHour) || input.digestHour < 5 || input.digestHour > 12) throw invalid("Send the morning summary between 05:00 and 12:00.");
  const alerts: AlertsConfig = { instant: Boolean(input.instant), digest: Boolean(input.digest), digestHour: input.digestHour, smsTo, emailTo };
  await dbOf(ctx).update(aiSettings).set({ alerts }).where(eq(aiSettings.businessId, ctx.businessId));
  await audit(ctx, { action: "ai.settings_updated", summary: `Staff alerts: ${smsTo.length + emailTo.length} recipient(s), instant ${alerts.instant ? "on" : "off"}, morning summary ${alerts.digest ? `at ${alerts.digestHour}:00` : "off"}`, entityType: "ai_settings", entityId: ctx.businessId });
  return alerts;
}
