/**
 * Dashboard and analytics metrics. Every number is computed from real rows in
 * this business's data — nothing is estimated or padded. Day boundaries use
 * the business's timezone.
 */
import { sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { assertCan, dbOf, type Ctx } from "../context";
import { getBusiness } from "./business";
import { listOpportunities } from "./opportunities";

type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v ?? 0);

export async function overviewMetrics(ctx: Ctx, now = new Date()) {
  const db = dbOf(ctx);
  const business = await getBusiness(ctx);
  const tz = business.timezone;
  const start = DateTime.fromJSDate(now).setZone(tz).startOf("day").toJSDate();
  const d30 = new Date(now.getTime() - 30 * 86400_000);
  const b = ctx.businessId;

  const [r] = (
    await db.execute<Row>(sql`
    select
      (select count(distinct m.conversation_id) from messages m where m.business_id = ${b} and m.role = 'customer' and m.created_at >= ${start}) as conversations_today,
      (select count(distinct m.conversation_id) from messages m where m.business_id = ${b} and m.role = 'ai' and m.created_at >= ${start}) as ai_conversations_today,
      (select count(*) from leads l where l.business_id = ${b} and l.created_at >= ${start}) as new_leads_today,
      (select count(*) from appointments a where a.business_id = ${b} and a.created_at >= ${start}) as booked_today,
      (select count(*) from appointments a where a.business_id = ${b} and a.created_at >= ${start} and a.source = 'ai') as ai_booked_today,
      (select count(*) from appointments a where a.business_id = ${b} and a.status in ('booked','confirmed') and a.starts_at >= ${now}) as upcoming,
      (select count(*) from appointments a where a.business_id = ${b} and a.status in ('booked','confirmed') and a.starts_at >= ${now} and a.starts_at < ${new Date(start.getTime() + 86400_000)}) as upcoming_today,
      (select count(*) from audit_logs x where x.business_id = ${b} and x.action = 'conversation.handoff_requested' and x.created_at >= ${start}) as handoffs_today,
      (select count(*) from conversations c where c.business_id = ${b} and c.owner = 'human' and c.handoff_requested_at is not null and c.assigned_user_id is null and c.status <> 'resolved') as waiting_for_human,
      (select count(*) from leads l where l.business_id = ${b} and l.created_at >= ${d30}) as leads_30d,
      (select count(*) from leads l where l.business_id = ${b} and l.created_at >= ${d30} and l.status in ('appointment_booked','completed')) as converted_30d
  `)
  ).rows;

  const opportunities = ctx.actor.type === "user" && ctx.actor.role === "staff" ? [] : await listOpportunities(ctx, now);
  return {
    conversationsToday: n(r?.conversations_today),
    aiConversationsToday: n(r?.ai_conversations_today),
    newLeadsToday: n(r?.new_leads_today),
    bookedToday: n(r?.booked_today),
    aiBookedToday: n(r?.ai_booked_today),
    upcoming: n(r?.upcoming),
    upcomingToday: n(r?.upcoming_today),
    handoffsToday: n(r?.handoffs_today),
    waitingForHuman: n(r?.waiting_for_human),
    missedOpportunities: opportunities.length,
    leads30d: n(r?.leads_30d),
    converted30d: n(r?.converted_30d),
    conversionRate30d: n(r?.leads_30d) ? n(r?.converted_30d) / n(r?.leads_30d) : null,
    topOpportunities: opportunities.slice(0, 4),
  };
}

export async function analytics(ctx: Ctx, days = 30, now = new Date()) {
  assertCan(ctx, "analytics.view");
  const db = dbOf(ctx);
  const business = await getBusiness(ctx);
  const tz = business.timezone;
  const b = ctx.businessId;
  const from = DateTime.fromJSDate(now).setZone(tz).startOf("day").minus({ days: days - 1 });
  const fromDate = from.toJSDate();

  // Daily series (one row per local day, zero-filled).
  const series = await db.execute<Row>(sql`
    with days as (
      select generate_series(${from.toISODate()}::date, ${DateTime.fromJSDate(now).setZone(tz).toISODate()}::date, interval '1 day')::date as day
    )
    select to_char(d.day, 'YYYY-MM-DD') as day,
      (select count(distinct m.conversation_id) from messages m where m.business_id = ${b} and m.role = 'customer' and (m.created_at at time zone ${tz})::date = d.day) as conversations,
      (select count(*) from leads l where l.business_id = ${b} and (l.created_at at time zone ${tz})::date = d.day) as leads,
      (select count(*) from appointments a where a.business_id = ${b} and a.source = 'ai' and (a.created_at at time zone ${tz})::date = d.day) as booked_ai,
      (select count(*) from appointments a where a.business_id = ${b} and a.source <> 'ai' and (a.created_at at time zone ${tz})::date = d.day) as booked_other
    from days d order by d.day`);

  const [t] = (
    await db.execute<Row>(sql`
    with conv as (
      select c.id,
        exists (select 1 from messages m where m.conversation_id = c.id and m.role = 'ai') as ai_handled,
        (c.handoff_requested_at is not null or exists (select 1 from audit_logs x where x.entity_id = c.id::text and x.action = 'conversation.handoff_requested')) as handed_off
      from conversations c
      where c.business_id = ${b} and exists (select 1 from messages m where m.conversation_id = c.id and m.role = 'customer' and m.created_at >= ${fromDate})
    ),
    responses as (
      select extract(epoch from (r.created_at - m.created_at)) as secs
      from messages m
      join lateral (
        select r.created_at from messages r
        where r.conversation_id = m.conversation_id and r.role in ('ai','human') and r.created_at >= m.created_at
        order by r.created_at limit 1
      ) r on true
      where m.business_id = ${b} and m.role = 'customer' and m.created_at >= ${fromDate}
    )
    select
      (select count(*) from conv) as conversations,
      (select count(*) from conv where ai_handled) as ai_conversations,
      (select count(*) from conv where ai_handled and not handed_off) as ai_resolved,
      (select count(*) from conv where handed_off) as handoffs,
      (select avg(secs) from responses) as avg_response_secs,
      (select percentile_cont(0.5) within group (order by secs) from responses) as median_response_secs,
      (select count(*) from leads l where l.business_id = ${b} and l.created_at >= ${fromDate}) as leads,
      (select count(*) from leads l where l.business_id = ${b} and l.created_at >= ${fromDate} and l.status in ('appointment_booked','completed')) as leads_converted,
      (select count(*) from appointments a where a.business_id = ${b} and a.created_at >= ${fromDate}) as appointments,
      (select count(*) from appointments a where a.business_id = ${b} and a.created_at >= ${fromDate} and a.source = 'ai') as appointments_ai,
      (select coalesce(sum(a.price_cents),0) from appointments a where a.business_id = ${b} and a.created_at >= ${fromDate} and a.source = 'ai' and a.status in ('booked','confirmed','completed')) as ai_revenue_booked,
      (select coalesce(sum(a.price_cents),0) from appointments a where a.business_id = ${b} and a.created_at >= ${fromDate} and a.source = 'ai' and a.status = 'completed') as ai_revenue_completed,
      (select count(*) from follow_ups f where f.business_id = ${b} and f.status = 'sent' and f.sent_at >= ${fromDate}) as follow_ups_sent,
      (select count(*) from follow_ups f where f.business_id = ${b} and f.status = 'sent' and f.sent_at >= ${fromDate}
         and exists (select 1 from appointments a where a.customer_id = f.customer_id and a.created_at between f.sent_at and f.sent_at + interval '7 days')) as follow_ups_converted,
      (select count(*) from appointments a where a.business_id = ${b} and a.status = 'cancelled' and a.cancelled_at >= ${fromDate}) as cancellations,
      (select count(*) from appointments a where a.business_id = ${b} and a.status = 'no_show' and a.starts_at >= ${fromDate}) as no_shows
  `)
  ).rows;

  const sources = await db.execute<Row>(sql`
    select coalesce(l.source, 'unknown') as source, count(*) as leads,
      count(*) filter (where l.status in ('appointment_booked','completed')) as converted
    from leads l where l.business_id = ${b} and l.created_at >= ${fromDate}
    group by 1 order by 2 desc`);

  const topServices = await db.execute<Row>(sql`
    select s.name, count(*) as bookings, coalesce(sum(a.price_cents),0) as revenue
    from appointments a join services s on s.id = a.service_id
    where a.business_id = ${b} and a.created_at >= ${fromDate} and a.status <> 'cancelled'
    group by s.name order by bookings desc limit 6`);

  const opportunities = await listOpportunities(ctx, now);
  const conversations = n(t?.conversations);
  const aiConversations = n(t?.ai_conversations);
  return {
    days,
    currency: business.currency,
    series: series.rows.map((r) => ({
      day: String(r.day),
      conversations: n(r.conversations),
      leads: n(r.leads),
      bookedAi: n(r.booked_ai),
      bookedOther: n(r.booked_other),
    })),
    totals: {
      conversations,
      aiConversations,
      aiResolutionRate: aiConversations ? n(t?.ai_resolved) / aiConversations : null,
      handoffRate: conversations ? n(t?.handoffs) / conversations : null,
      avgResponseSecs: t?.avg_response_secs == null ? null : n(t.avg_response_secs),
      medianResponseSecs: t?.median_response_secs == null ? null : n(t.median_response_secs),
      leads: n(t?.leads),
      bookingConversion: n(t?.leads) ? n(t?.leads_converted) / n(t?.leads) : null,
      appointments: n(t?.appointments),
      appointmentsAi: n(t?.appointments_ai),
      aiRevenueBookedCents: n(t?.ai_revenue_booked),
      aiRevenueCompletedCents: n(t?.ai_revenue_completed),
      followUpsSent: n(t?.follow_ups_sent),
      followUpsConverted: n(t?.follow_ups_converted),
      cancellations: n(t?.cancellations),
      noShows: n(t?.no_shows),
      missedOpportunities: opportunities.length,
    },
    sources: sources.rows.map((r) => ({ source: String(r.source), leads: n(r.leads), converted: n(r.converted) })),
    topServices: topServices.rows.map((r) => ({ name: String(r.name), bookings: n(r.bookings), revenueCents: n(r.revenue) })),
  };
}

export type Analytics = Awaited<ReturnType<typeof analytics>>;
