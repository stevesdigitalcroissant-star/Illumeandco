/**
 * Background automation tick — run every few minutes by cron
 * (/api/cron/tick, protected by CRON_SECRET) or manually from the dashboard.
 *
 * Processes due follow-ups, appointment reminders and review requests.
 * A Postgres advisory lock guarantees only one tick runs at a time, so
 * nothing is ever sent twice.
 */
import { getPool } from "@/db";
import type { Ctx } from "../context";
import { getAgent } from "../services/business";
import { dueFollowUps, processFollowUp } from "../services/followups";
import { dueReminders, processReminder } from "../services/reminders";
import { dueReviewRequests, processReviewRequest } from "../services/reviews";
import { sweepAll, sweepBusiness } from "../opportunities/engine";

const LOCK_KEY = 7_342_001;

export type TickReport = { ran: boolean; followUps: number; reminders: number; reviews: number; errors: string[] };

export async function runTick(opts: { now?: Date; businessId?: string } = {}): Promise<TickReport> {
  const now = opts.now ?? new Date();
  const report: TickReport = { ran: false, followUps: 0, reminders: 0, reviews: 0, errors: [] };
  const client = await getPool().connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [LOCK_KEY]);
    if (!rows[0]?.locked) return report; // another tick is running
    report.ran = true;
    try {
      const only = <T extends { businessId: string }>(xs: T[]) => (opts.businessId ? xs.filter((x) => x.businessId === opts.businessId) : xs);

      for (const f of only(await dueFollowUps(now))) {
        try {
          const agent = await getAgent({ businessId: f.businessId, actor: { type: "system", name: "System" } });
          const ctx: Ctx = { businessId: f.businessId, actor: { type: "ai", agentId: agent.id, name: `${agent.name} (AI Receptionist)` } };
          await processFollowUp(ctx, f);
          report.followUps++;
        } catch (e) {
          report.errors.push(`follow-up ${f.id}: ${(e as Error).message}`);
        }
      }
      for (const r of only(await dueReminders(now))) {
        try {
          await processReminder({ businessId: r.businessId, actor: { type: "system", name: "Reminders" } }, r);
          report.reminders++;
        } catch (e) {
          report.errors.push(`reminder ${r.id}: ${(e as Error).message}`);
        }
      }
      for (const r of only(await dueReviewRequests(now))) {
        try {
          await processReviewRequest({ businessId: r.businessId, actor: { type: "system", name: "Review requests" } }, r);
          report.reviews++;
        } catch (e) {
          report.errors.push(`review ${r.id}: ${(e as Error).message}`);
        }
      }
      // Advance and reconcile opportunities (idempotent).
      try {
        if (opts.businessId)
          await sweepBusiness({ businessId: opts.businessId, actor: { type: "system", name: "Opportunity Engine" } }, now);
        else await sweepAll(now);
      } catch (e) {
        report.errors.push(`opportunities: ${(e as Error).message}`);
      }
    } finally {
      await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
  return report;
}
