/**
 * Read-only helpers for the customer profile page. Every query is scoped by
 * ctx.businessId; callers must first load the customer with getCustomer()
 * (which enforces staff visibility).
 */
import { and, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import { appointments, auditLogs, conversations, followUps, leads, services, staff, users } from "@/db/schema";
import { dbOf, isRestrictedStaff, roleCan, type Ctx } from "../context";

const canManageLeads = (ctx: Ctx) => ctx.actor.type !== "user" || roleCan(ctx.actor.role, "leads.manage");

/** Conversations with this customer the viewer may see (staff: only ones assigned to them). */
export async function customerConversations(ctx: Ctx, customerId: string) {
  const conds: (SQL | undefined)[] = [eq(conversations.businessId, ctx.businessId), eq(conversations.customerId, customerId)];
  if (isRestrictedStaff(ctx)) conds.push(eq(conversations.assignedUserId, ctx.actor.userId));
  return dbOf(ctx)
    .select({ conversation: conversations, assigneeName: users.name })
    .from(conversations)
    .leftJoin(users, eq(users.id, conversations.assignedUserId))
    .where(and(...conds))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(50);
}

/** The customer's leads (only for roles that manage leads). */
export async function customerLeads(ctx: Ctx, customerId: string) {
  if (!canManageLeads(ctx)) return [];
  return dbOf(ctx)
    .select({ lead: leads, serviceName: services.name })
    .from(leads)
    .leftJoin(services, eq(services.id, leads.serviceId))
    .where(and(eq(leads.businessId, ctx.businessId), eq(leads.customerId, customerId)))
    .orderBy(desc(leads.createdAt))
    .limit(50);
}

/**
 * Activity timeline from the audit log: entries about the customer itself or
 * about appointments / leads / conversations / follow-ups belonging to them.
 * Restricted staff only see entries for the customer, appointments they work
 * and conversations assigned to them.
 */
export async function customerActivity(ctx: Ctx, customerId: string, opts: { limit?: number } = {}) {
  const db = dbOf(ctx);
  const b = ctx.businessId;
  const staffOnly = isRestrictedStaff(ctx);

  const apptRows = await db
    .select({ id: appointments.id, staffId: appointments.staffId })
    .from(appointments)
    .where(and(eq(appointments.businessId, b), eq(appointments.customerId, customerId)));
  let apptIds = apptRows.map((r) => r.id);
  if (staffOnly) {
    const mine = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.businessId, b), eq(staff.userId, ctx.actor.userId)));
    const mineIds = new Set(mine.map((s) => s.id));
    apptIds = apptRows.filter((r) => mineIds.has(r.staffId)).map((r) => r.id);
  }
  const convIds = (await customerConversations(ctx, customerId)).map((c) => c.conversation.id);
  let leadIds: string[] = [];
  let followUpIds: string[] = [];
  if (canManageLeads(ctx)) {
    leadIds = (await db.select({ id: leads.id }).from(leads).where(and(eq(leads.businessId, b), eq(leads.customerId, customerId)))).map((r) => r.id);
    followUpIds = (
      await db.select({ id: followUps.id }).from(followUps).where(and(eq(followUps.businessId, b), eq(followUps.customerId, customerId)))
    ).map((r) => r.id);
  }

  const scope = (type: string, ids: string[]) => (ids.length ? and(eq(auditLogs.entityType, type), inArray(auditLogs.entityId, ids)) : undefined);
  const match = or(
    and(eq(auditLogs.entityType, "customer"), eq(auditLogs.entityId, customerId)),
    scope("appointment", apptIds),
    scope("conversation", convIds),
    scope("lead", leadIds),
    scope("follow_up", followUpIds),
  );
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      summary: auditLogs.summary,
      actorType: auditLogs.actorType,
      actorLabel: auditLogs.actorLabel,
      entityType: auditLogs.entityType,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .where(and(eq(auditLogs.businessId, b), match))
    .orderBy(desc(auditLogs.createdAt))
    .limit(opts.limit ?? 60);
}

/** Start times for a set of appointment ids (used to show a lead's linked appointment). */
export async function appointmentTimes(ctx: Ctx, ids: string[]) {
  if (!ids.length) return new Map<string, { startsAt: Date; status: string }>();
  const rows = await dbOf(ctx)
    .select({ id: appointments.id, startsAt: appointments.startsAt, status: appointments.status })
    .from(appointments)
    .where(and(eq(appointments.businessId, ctx.businessId), inArray(appointments.id, ids)));
  return new Map(rows.map((r) => [r.id, { startsAt: r.startsAt, status: r.status }]));
}
