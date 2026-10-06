/**
 * Missed opportunities — computed live from real activity:
 *   - lead asked about a service but never booked / was never followed up
 *   - customer viewed availability but abandoned the booking
 *   - appointment cancelled without rebooking
 *   - regular customer hasn't returned in N days
 *   - customer waiting for a human with nobody assigned
 */
import { eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { opportunityDismissals } from "@/db/schema";
import { assertCan, dbOf, invalid, type Ctx } from "../context";
import { getAiSettings } from "./business";
import { processFollowUp, scheduleFollowUp } from "./followups";

export type OpportunityType = "stale_lead" | "abandoned_booking" | "cancelled_no_rebook" | "lapsed_customer" | "waiting_for_human";

export type Opportunity = {
  key: string;
  type: OpportunityType;
  customerId: string;
  customerName: string | null;
  title: string;
  detail: string;
  at: string;
  leadId: string | null;
  conversationId: string | null;
  canFollowUp: boolean;
};

const ago = (d: Date | string, now: Date) => DateTime.fromJSDate(new Date(d)).toRelative({ base: DateTime.fromJSDate(now) }) ?? "";

export async function listOpportunities(ctx: Ctx, now = new Date()): Promise<Opportunity[]> {
  assertCan(ctx, "leads.manage");
  const db = dbOf(ctx);
  const settings = await getAiSettings(ctx);
  const staleCutoff = new Date(now.getTime() - settings.missedOpportunities.staleLeadHours * 3600_000);
  const lapsedCutoff = new Date(now.getTime() - settings.missedOpportunities.noReturnDays * 86400_000);
  const b = ctx.businessId;
  const out: Opportunity[] = [];

  const stale = await db.execute<{ lead_id: string; customer_id: string; name: string | null; interest: string | null; last: string; conversation_id: string | null; opted_out: boolean }>(sql`
    select l.id as lead_id, c.id as customer_id, c.name, coalesce(s.name, l.service_interest) as interest,
           coalesce(l.last_contact_at, l.created_at) as last, l.conversation_id, c.opted_out
    from leads l join customers c on c.id = l.customer_id left join services s on s.id = l.service_id
    where l.business_id = ${b} and l.status in ('new','contacted','qualified')
      and coalesce(l.last_contact_at, l.created_at) < ${staleCutoff}
      and not exists (select 1 from follow_ups f where f.lead_id = l.id and f.status = 'scheduled')
      and not exists (select 1 from appointments a where a.customer_id = c.id and a.status in ('booked','confirmed') and a.starts_at > ${now})
    order by last desc limit 50`);
  for (const r of stale.rows)
    out.push({
      key: `stale_lead:${r.lead_id}`,
      type: "stale_lead",
      customerId: r.customer_id,
      customerName: r.name,
      title: `${r.name ?? "A visitor"} asked about ${r.interest ?? "your services"} ${ago(r.last, now)} but never booked`,
      detail: "No follow-up is scheduled.",
      at: new Date(r.last).toISOString(),
      leadId: r.lead_id,
      conversationId: r.conversation_id,
      canFollowUp: !r.opted_out,
    });

  const abandoned = await db.execute<{ conversation_id: string; customer_id: string; name: string | null; at: string; opted_out: boolean }>(sql`
    select cv.id as conversation_id, c.id as customer_id, c.name, max(aa.created_at) as at, c.opted_out
    from ai_actions aa join conversations cv on cv.id = aa.conversation_id join customers c on c.id = cv.customer_id
    where aa.business_id = ${b} and aa.tool = 'get_available_appointments' and aa.status = 'success'
      and aa.created_at < ${new Date(now.getTime() - 2 * 3600_000)} and aa.created_at > ${new Date(now.getTime() - 14 * 86400_000)}
      and not exists (select 1 from ai_actions bb where bb.conversation_id = cv.id and bb.tool in ('book_appointment','reschedule_appointment') and bb.status = 'success')
      and not exists (select 1 from appointments a where a.customer_id = c.id and a.status in ('booked','confirmed') and a.starts_at > ${now})
      and cv.owner = 'ai'
    group by cv.id, c.id, c.name, c.opted_out order by at desc limit 50`);
  for (const r of abandoned.rows) {
    if (out.some((o) => o.customerId === r.customer_id)) continue;
    out.push({
      key: `abandoned:${r.conversation_id}`,
      type: "abandoned_booking",
      customerId: r.customer_id,
      customerName: r.name,
      title: `${r.name ?? "A visitor"} checked availability ${ago(r.at, now)} but didn't book`,
      detail: "They were shown real open times in chat.",
      at: new Date(r.at).toISOString(),
      leadId: null,
      conversationId: r.conversation_id,
      canFollowUp: !r.opted_out,
    });
  }

  const cancelled = await db.execute<{ appointment_id: string; customer_id: string; name: string | null; service: string; at: string; opted_out: boolean }>(sql`
    select a.id as appointment_id, c.id as customer_id, c.name, s.name as service, a.cancelled_at as at, c.opted_out
    from appointments a join customers c on c.id = a.customer_id join services s on s.id = a.service_id
    where a.business_id = ${b} and a.status = 'cancelled' and a.cancelled_at > ${new Date(now.getTime() - 30 * 86400_000)}
      and not exists (select 1 from appointments a2 where a2.customer_id = c.id and a2.status in ('booked','confirmed','completed') and a2.created_at > a.cancelled_at)
    order by a.cancelled_at desc limit 50`);
  for (const r of cancelled.rows)
    out.push({
      key: `cancelled:${r.appointment_id}`,
      type: "cancelled_no_rebook",
      customerId: r.customer_id,
      customerName: r.name,
      title: `${r.name ?? "A customer"} cancelled their ${r.service} ${ago(r.at, now)} and hasn't rebooked`,
      detail: "Offer them a new time.",
      at: new Date(r.at).toISOString(),
      leadId: null,
      conversationId: null,
      canFollowUp: !r.opted_out,
    });

  const lapsed = await db.execute<{ customer_id: string; name: string | null; last: string; opted_out: boolean }>(sql`
    select c.id as customer_id, c.name, max(a.starts_at) as last, c.opted_out
    from customers c join appointments a on a.customer_id = c.id and a.status = 'completed'
    where c.business_id = ${b}
      and not exists (select 1 from appointments a2 where a2.customer_id = c.id and a2.status in ('booked','confirmed') and a2.starts_at > ${now})
    group by c.id, c.name, c.opted_out having max(a.starts_at) < ${lapsedCutoff} order by last desc limit 50`);
  for (const r of lapsed.rows)
    out.push({
      key: `lapsed:${r.customer_id}:${DateTime.fromJSDate(new Date(r.last)).toISODate()}`,
      type: "lapsed_customer",
      customerId: r.customer_id,
      customerName: r.name,
      title: `${r.name ?? "A customer"} hasn't been back since ${DateTime.fromJSDate(new Date(r.last)).toFormat("d LLL yyyy")}`,
      detail: `No visit in over ${settings.missedOpportunities.noReturnDays} days.`,
      at: new Date(r.last).toISOString(),
      leadId: null,
      conversationId: null,
      canFollowUp: !r.opted_out,
    });

  const waiting = await db.execute<{ conversation_id: string; customer_id: string; name: string | null; at: string; reason: string | null }>(sql`
    select cv.id as conversation_id, c.id as customer_id, c.name, cv.handoff_requested_at as at, cv.handoff_reason as reason
    from conversations cv join customers c on c.id = cv.customer_id
    where cv.business_id = ${b} and cv.owner = 'human' and cv.handoff_requested_at is not null and cv.assigned_user_id is null
      and cv.status <> 'resolved' and cv.handoff_requested_at < ${new Date(now.getTime() - 30 * 60_000)}
    order by at limit 50`);
  for (const r of waiting.rows)
    out.push({
      key: `waiting:${r.conversation_id}:${new Date(r.at).getTime()}`,
      type: "waiting_for_human",
      customerId: r.customer_id,
      customerName: r.name,
      title: `${r.name ?? "A customer"} has been waiting for a person since ${ago(r.at, now)}`,
      detail: r.reason ?? "Handoff requested",
      at: new Date(r.at).toISOString(),
      leadId: null,
      conversationId: r.conversation_id,
      canFollowUp: false,
    });

  const dismissed = new Set(
    (await db.select({ key: opportunityDismissals.key }).from(opportunityDismissals).where(eq(opportunityDismissals.businessId, b))).map((d) => d.key),
  );
  return out.filter((o) => !dismissed.has(o.key));
}

export async function dismissOpportunity(ctx: Ctx, key: string) {
  assertCan(ctx, "leads.manage");
  await dbOf(ctx)
    .insert(opportunityDismissals)
    .values({ businessId: ctx.businessId, key, userId: ctx.actor.type === "user" ? ctx.actor.userId : null })
    .onConflictDoNothing();
}

/** "Follow up" button: send a follow-up now, through the same stop conditions as automated ones. */
export async function followUpNow(ctx: Ctx, key: string, now = new Date()) {
  assertCan(ctx, "leads.manage");
  const opp = (await listOpportunities(ctx, now)).find((o) => o.key === key);
  if (!opp) throw invalid("This opportunity is no longer open.");
  if (!opp.canFollowUp) throw invalid("This customer can't be followed up automatically.");
  const message =
    opp.type === "cancelled_no_rebook"
      ? `Hi ${opp.customerName?.split(" ")[0] ?? "there"}, we noticed you had to cancel recently — would you like me to find you a new time?`
      : opp.type === "lapsed_customer"
        ? `Hi ${opp.customerName?.split(" ")[0] ?? "there"}, it's been a while! Would you like me to find you a time for your next visit?`
        : null;
  const f = await scheduleFollowUp(ctx, {
    customerId: opp.customerId,
    leadId: opp.leadId,
    conversationId: opp.conversationId,
    scheduledFor: now,
    message,
    reason: opp.title,
  });
  const result = await processFollowUp(ctx, { ...f });
  return result;
}

export async function opportunityCounts(ctx: Ctx, now = new Date()) {
  const list = await listOpportunities(ctx, now);
  return { total: list.length };
}
