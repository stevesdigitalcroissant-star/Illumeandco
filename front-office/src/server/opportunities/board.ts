/** Read side and staff actions for the Opportunity Engine (dashboard). */
import { and, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { customers, opportunities, services } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, notFound, type Ctx } from "../context";
import { processFollowUp, scheduleFollowUp } from "../services/followups";
import { evaluateLead } from "./engine";

export type OpportunityRow = Awaited<ReturnType<typeof listBoard>>[number];
type Kind = (typeof opportunities.$inferSelect)["kind"];

export async function listBoard(ctx: Ctx, opts: { status?: "open" | "closed"; kind?: Kind; limit?: number } = {}) {
  assertCan(ctx, "leads.manage");
  const conds: SQL[] = [eq(opportunities.businessId, ctx.businessId)];
  if (opts.status === "closed") conds.push(inArray(opportunities.status, ["won", "lost", "dismissed"]));
  else conds.push(eq(opportunities.status, "open"));
  if (opts.kind) conds.push(eq(opportunities.kind, opts.kind));
  return dbOf(ctx)
    .select({
      opportunity: opportunities,
      customer: { id: customers.id, name: customers.name, phone: customers.phone, email: customers.email, optedOut: customers.optedOut },
      serviceName: services.name,
    })
    .from(opportunities)
    .innerJoin(customers, eq(customers.id, opportunities.customerId))
    .leftJoin(services, eq(services.id, opportunities.serviceId))
    .where(and(...conds))
    .orderBy(
      // People who need a person first, then due actions, then highest intent.
      sql`case when ${opportunities.kind} = 'needs_human' then 0 when ${opportunities.nextActionBy} = 'human' and ${opportunities.nextAction} <> 'none' then 1 else 2 end`,
      sql`${opportunities.nextActionAt} asc nulls last`,
      desc(opportunities.intentScore),
    )
    .limit(opts.limit ?? 300);
}

/** Headline numbers. Values are estimates (service price at the time) and are labelled as such in the UI. */
export async function boardSummary(ctx: Ctx, now = new Date(), days = 30) {
  const since = new Date(now.getTime() - days * 86400_000);
  const b = ctx.businessId;
  const [r] = (
    await dbOf(ctx).execute<Record<string, string | number | null>>(sql`
    select
      count(*) filter (where status = 'open') as open,
      count(*) filter (where status = 'open' and (kind = 'needs_human' or (next_action_by = 'human' and next_action <> 'none'))) as needs_you,
      count(*) filter (where status = 'open' and next_action_by = 'ai' and next_action <> 'none') as ai_handling,
      count(*) filter (where status = 'open' and kind = 'lead' and stage in ('high_intent','booking_in_progress')) as high_intent,
      coalesce(sum(estimated_value_cents) filter (where status = 'open' and kind in ('lead','cancellation','no_show','reactivation')), 0) as open_value,
      count(*) filter (where status = 'won' and closed_at >= ${since} and kind <> 'needs_human') as won,
      count(*) filter (where recovered and closed_at >= ${since}) as recovered,
      coalesce(sum(recovered_value_cents) filter (where recovered and closed_at >= ${since}), 0) as recovered_value,
      count(*) filter (where status = 'lost' and closed_at >= ${since}) as lost
    from opportunities where business_id = ${b}`)
  ).rows;
  const n = (k: string) => Number(r?.[k] ?? 0);
  return {
    open: n("open"),
    needsYou: n("needs_you"),
    aiHandling: n("ai_handling"),
    highIntent: n("high_intent"),
    openEstimatedValueCents: n("open_value"),
    won: n("won"),
    recovered: n("recovered"),
    recoveredValueCents: n("recovered_value"),
    lost: n("lost"),
    days,
  };
}

async function getOpen(ctx: Ctx, id: string) {
  const o = await dbOf(ctx).query.opportunities.findFirst({ where: and(eq(opportunities.businessId, ctx.businessId), eq(opportunities.id, id)) });
  if (!o) throw notFound("Opportunity");
  if (o.status !== "open") throw invalid("This opportunity is already closed.");
  return o;
}

const OUTREACH: Partial<Record<Kind, (first: string, service: string) => string>> = {
  cancellation: (n, s) => `Hi ${n}, we noticed you had to cancel your ${s}. Would you like me to find you a new time?`,
  no_show: (n, s) => `Hi ${n}, we missed you at your ${s} appointment. Would you like me to find you a new time?`,
  reactivation: (n) => `Hi ${n}, it's been a while! Would you like me to find you a time for your next visit?`,
};

/** "Follow up now": sends through the same follow-up path as automation (opt-outs, bookings, human takeover all checked). */
export async function followUpNow(ctx: Ctx, opportunityId: string) {
  assertCan(ctx, "leads.manage");
  const o = await getOpen(ctx, opportunityId);
  if (o.kind === "needs_human") throw invalid("Reply to this customer in the inbox.");
  const customer = await dbOf(ctx).query.customers.findFirst({ where: eq(customers.id, o.customerId) });
  const service = o.serviceId ? await dbOf(ctx).query.services.findFirst({ where: eq(services.id, o.serviceId) }) : null;
  const tpl = OUTREACH[o.kind];
  const f = await scheduleFollowUp(ctx, {
    customerId: o.customerId,
    leadId: o.leadId,
    conversationId: o.conversationId,
    scheduledFor: new Date(),
    message: tpl ? tpl(customer?.name?.split(" ")[0] ?? "there", service?.name.toLowerCase() ?? "appointment") : null,
    reason: o.title,
  });
  const result = await processFollowUp(ctx, f);
  if (result.sent)
    await dbOf(ctx)
      .update(opportunities)
      .set({ nextActionLabel: "Followed up — waiting for a reply", nextActionAt: null, followUpId: f.id, lastActivityAt: new Date() })
      .where(eq(opportunities.id, o.id));
  return result;
}

export async function closeOpportunity(ctx: Ctx, opportunityId: string, status: "lost" | "dismissed", reason?: string) {
  assertCan(ctx, "leads.manage");
  const o = await getOpen(ctx, opportunityId);
  const label = reason?.trim().slice(0, 300) || (status === "lost" ? "Marked lost by the team" : "Dismissed by the team");
  await dbOf(ctx)
    .update(opportunities)
    .set({ status, stage: status === "lost" ? "lost" : o.stage, closedReason: label, closedAt: new Date(), nextAction: "none", nextActionAt: null })
    .where(and(eq(opportunities.id, o.id), eq(opportunities.status, "open")));
  if (status === "lost")
    await audit(ctx, { action: "opportunity.lost", summary: `${o.title}: ${label}`, entityType: "opportunity", entityId: o.id });
}

/** Re-run the engine for one customer (e.g. after staff edits). */
export async function reevaluate(ctx: Ctx, opportunityId: string) {
  assertCan(ctx, "leads.manage");
  const o = await dbOf(ctx).query.opportunities.findFirst({ where: and(eq(opportunities.businessId, ctx.businessId), eq(opportunities.id, opportunityId)) });
  if (!o) throw notFound("Opportunity");
  if (o.kind === "lead") await evaluateLead(ctx, o.customerId);
}

export async function recentClosed(ctx: Ctx, days = 30, now = new Date()) {
  assertCan(ctx, "leads.manage");
  return dbOf(ctx)
    .select({ opportunity: opportunities, customerName: customers.name })
    .from(opportunities)
    .innerJoin(customers, eq(customers.id, opportunities.customerId))
    .where(
      and(
        eq(opportunities.businessId, ctx.businessId),
        inArray(opportunities.status, ["won", "lost"]),
        gte(opportunities.closedAt, new Date(now.getTime() - days * 86400_000)),
      ),
    )
    .orderBy(desc(opportunities.closedAt))
    .limit(30);
}
