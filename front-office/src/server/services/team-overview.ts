/**
 * Team overview: the people under you and how they're doing.
 *
 *   Owner    → sees everyone in the organization (managers and staff).
 *   Manager  → sees the staff who report to them, plus staff with no manager yet.
 *   Staff    → no access.
 *
 * Numbers come from real activity at the current location: conversations
 * assigned to the person, replies they sent (and how fast), appointments they
 * booked, appointments they performed (when their login is linked to a
 * calendar staff member) and when they were last active.
 */
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db as rootDb } from "@/db";
import { appointments, auditLogs, businesses, conversations, customers, messages, organizationMembers, services, staff, users } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, forbidden, invalid, notFound, type Ctx, type Role } from "../context";

export type TeamPerson = {
  memberId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  reportsToMemberId: string | null;
};

export type PersonStats = {
  openConversations: number;
  waitingOnThem: number;
  replies: number;
  avgReplyMinutes: number | null;
  booked: number;
  bookedValueCents: number;
  completed: number;
  completedValueCents: number;
  noShows: number;
  lastActiveAt: Date | null;
};

async function organizationOf(ctx: Ctx) {
  const b = await rootDb.query.businesses.findFirst({ where: eq(businesses.id, ctx.businessId), columns: { organizationId: true } });
  if (!b) throw notFound("Business");
  return b.organizationId;
}

async function membersOf(organizationId: string): Promise<TeamPerson[]> {
  const rows = await rootDb
    .select({ memberId: organizationMembers.id, userId: users.id, name: users.name, email: users.email, role: organizationMembers.role, reportsToMemberId: organizationMembers.reportsToMemberId })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, organizationId))
    .orderBy(organizationMembers.createdAt);
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

/** The viewer's own membership and everyone they may see. */
export async function visibleTeam(ctx: Ctx) {
  assertCan(ctx, "team.view");
  if (ctx.actor.type !== "user") throw forbidden();
  const userId = ctx.actor.userId;
  const all = await membersOf(await organizationOf(ctx));
  const me = all.find((m) => m.userId === userId);
  if (!me) throw forbidden();
  const people =
    me.role === "owner"
      ? all.filter((m) => m.userId !== userId)
      : all.filter((m) => m.role === "staff" && (m.reportsToMemberId === me.memberId || m.reportsToMemberId === null));
  const managers = all.filter((m) => m.role === "manager");
  return { me, people, managers };
}

/** One person's scorecard at this location since `since`. */
export async function statsFor(ctx: Ctx, userIds: string[], since: Date): Promise<Map<string, PersonStats>> {
  const out = new Map<string, PersonStats>();
  for (const id of userIds)
    out.set(id, { openConversations: 0, waitingOnThem: 0, replies: 0, avgReplyMinutes: null, booked: 0, bookedValueCents: 0, completed: 0, completedValueCents: 0, noShows: 0, lastActiveAt: null });
  if (!userIds.length) return out;
  const db = dbOf(ctx);
  const biz = ctx.businessId;

  const open = await db
    .select({
      userId: conversations.assignedUserId,
      open: sql<number>`count(*)::int`,
      waiting: sql<number>`count(*) filter (where ${conversations.owner} = 'human' and ${conversations.lastCustomerMessageAt} is not null and ${conversations.lastCustomerMessageAt} >= ${conversations.lastMessageAt})::int`,
    })
    .from(conversations)
    .where(and(eq(conversations.businessId, biz), inArray(conversations.assignedUserId, userIds), ne(conversations.status, "resolved")))
    .groupBy(conversations.assignedUserId);
  for (const r of open) Object.assign(out.get(r.userId!)!, { openConversations: r.open, waitingOnThem: r.waiting });

  // Replies, and how long the customer waited for each one (from the customer's message just before it).
  const replies = await db.execute<{ user_id: string; replies: number; avg_minutes: number | null }>(sql`
    with m as (
      select author_user_id, role, created_at,
             lag(role) over (partition by conversation_id order by created_at) as prev_role,
             lag(created_at) over (partition by conversation_id order by created_at) as prev_at
      from messages
      where business_id = ${biz} and created_at >= ${since}::timestamptz - interval '2 days' and role in ('customer', 'human', 'ai')
    )
    select author_user_id as user_id, count(*)::int as replies,
           round(avg(extract(epoch from (created_at - prev_at)) / 60) filter (where prev_role = 'customer'))::int as avg_minutes
    from m
    where role = 'human' and created_at >= ${since}::timestamptz and author_user_id in (${sql.join(userIds.map((u) => sql`${u}::uuid`), sql`, `)})
    group by author_user_id`);
  for (const r of replies.rows) Object.assign(out.get(r.user_id)!, { replies: Number(r.replies), avgReplyMinutes: r.avg_minutes === null ? null : Number(r.avg_minutes) });

  const booked = await db
    .select({ userId: appointments.bookedByUserId, n: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${appointments.priceCents}), 0)::int` })
    .from(appointments)
    .where(and(eq(appointments.businessId, biz), inArray(appointments.bookedByUserId, userIds), gte(appointments.createdAt, since), ne(appointments.status, "cancelled")))
    .groupBy(appointments.bookedByUserId);
  for (const r of booked) Object.assign(out.get(r.userId!)!, { booked: r.n, bookedValueCents: r.value });

  // Appointments they performed — when their login is linked to a staff member on the calendar.
  const performed = await db
    .select({
      userId: staff.userId,
      completed: sql<number>`count(*) filter (where ${appointments.status} = 'completed')::int`,
      value: sql<number>`coalesce(sum(${appointments.priceCents}) filter (where ${appointments.status} = 'completed'), 0)::int`,
      noShows: sql<number>`count(*) filter (where ${appointments.status} = 'no_show')::int`,
    })
    .from(appointments)
    .innerJoin(staff, and(eq(staff.businessId, appointments.businessId), eq(staff.id, appointments.staffId)))
    .where(and(eq(appointments.businessId, biz), inArray(staff.userId, userIds), gte(appointments.startsAt, since), sql`${appointments.startsAt} <= now()`))
    .groupBy(staff.userId);
  for (const r of performed) Object.assign(out.get(r.userId!)!, { completed: r.completed, completedValueCents: r.value, noShows: r.noShows });

  const active = await db
    .select({ actorId: auditLogs.actorId, at: sql<Date>`max(${auditLogs.createdAt})` })
    .from(auditLogs)
    .where(and(eq(auditLogs.businessId, biz), eq(auditLogs.actorType, "user"), inArray(auditLogs.actorId, userIds)))
    .groupBy(auditLogs.actorId);
  const lastReply = await db
    .select({ userId: messages.authorUserId, at: sql<Date>`max(${messages.createdAt})` })
    .from(messages)
    .where(and(eq(messages.businessId, biz), inArray(messages.authorUserId, userIds)))
    .groupBy(messages.authorUserId);
  for (const r of [...active.map((a) => ({ id: a.actorId!, at: a.at })), ...lastReply.map((m) => ({ id: m.userId!, at: m.at }))]) {
    const s = out.get(r.id);
    const at = new Date(r.at);
    if (s && (!s.lastActiveAt || at > s.lastActiveAt)) s.lastActiveAt = at;
  }
  return out;
}

export async function teamOverview(ctx: Ctx, since: Date) {
  const { me, people, managers } = await visibleTeam(ctx);
  const stats = await statsFor(ctx, people.map((p) => p.userId), since);
  return { me, managers, people: people.map((p) => ({ ...p, stats: stats.get(p.userId)! })) };
}

/** One person in detail — only if the viewer may see them. */
export async function personDetail(ctx: Ctx, memberId: string, since: Date) {
  const { people } = await visibleTeam(ctx);
  const person = people.find((p) => p.memberId === memberId);
  if (!person) throw notFound("Team member");
  const db = dbOf(ctx);
  const biz = ctx.businessId;
  const [stats, convs, booked, performed, activity] = await Promise.all([
    statsFor(ctx, [person.userId], since),
    db
      .select({ id: conversations.id, status: conversations.status, channel: conversations.channel, lastMessageAt: conversations.lastMessageAt, preview: conversations.lastMessagePreview, customer: customers.name })
      .from(conversations)
      .innerJoin(customers, and(eq(customers.businessId, conversations.businessId), eq(customers.id, conversations.customerId)))
      .where(and(eq(conversations.businessId, biz), eq(conversations.assignedUserId, person.userId)))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(10),
    db
      .select({ id: appointments.id, startsAt: appointments.startsAt, status: appointments.status, priceCents: appointments.priceCents, service: services.name, customer: customers.name })
      .from(appointments)
      .innerJoin(services, and(eq(services.businessId, appointments.businessId), eq(services.id, appointments.serviceId)))
      .innerJoin(customers, and(eq(customers.businessId, appointments.businessId), eq(customers.id, appointments.customerId)))
      .where(and(eq(appointments.businessId, biz), eq(appointments.bookedByUserId, person.userId)))
      .orderBy(desc(appointments.createdAt))
      .limit(10),
    db
      .select({ id: appointments.id, startsAt: appointments.startsAt, status: appointments.status, priceCents: appointments.priceCents, service: services.name, customer: customers.name })
      .from(appointments)
      .innerJoin(staff, and(eq(staff.businessId, appointments.businessId), eq(staff.id, appointments.staffId)))
      .innerJoin(services, and(eq(services.businessId, appointments.businessId), eq(services.id, appointments.serviceId)))
      .innerJoin(customers, and(eq(customers.businessId, appointments.businessId), eq(customers.id, appointments.customerId)))
      .where(and(eq(appointments.businessId, biz), eq(staff.userId, person.userId)))
      .orderBy(desc(appointments.startsAt))
      .limit(10),
    db
      .select({ id: auditLogs.id, summary: auditLogs.summary, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(and(eq(auditLogs.businessId, biz), eq(auditLogs.actorType, "user"), eq(auditLogs.actorId, person.userId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(15),
  ]);
  return { person, stats: stats.get(person.userId)!, conversations: convs, booked, performed, activity };
}

/** Owner sets who a staff member reports to (a manager in the same organization), or clears it. */
export async function setReportsTo(ctx: Ctx, memberId: string, managerMemberId: string | null) {
  assertCan(ctx, "members.manage");
  const organizationId = await organizationOf(ctx);
  const all = await membersOf(organizationId);
  const person = all.find((m) => m.memberId === memberId);
  if (!person) throw notFound("Team member");
  if (person.role !== "staff") throw invalid("Only staff report to a manager.");
  const manager = managerMemberId ? all.find((m) => m.memberId === managerMemberId) : null;
  if (managerMemberId && (!manager || manager.role !== "manager")) throw invalid("Choose a manager from this team.");
  await rootDb
    .update(organizationMembers)
    .set({ reportsToMemberId: manager?.memberId ?? null })
    .where(and(eq(organizationMembers.id, memberId), eq(organizationMembers.organizationId, organizationId)));
  await audit(ctx, {
    action: "member.updated",
    summary: manager ? `${person.name} now reports to ${manager.name}` : `${person.name} no longer reports to a manager`,
    entityType: "member",
    entityId: memberId,
  });
}
