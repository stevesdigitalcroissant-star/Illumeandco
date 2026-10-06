/** Read-only audit log + AI tool-call queries for the dashboard. Always scoped to ctx.businessId. */
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { aiActions, auditLogs } from "@/db/schema";
import { assertCan, dbOf, type Ctx } from "../context";

export const AUDIT_PAGE_SIZE = 50;

export const AUDIT_CATEGORIES = {
  bookings: { label: "Bookings", actions: ["appointment.booked", "appointment.completed", "appointment.no_show"] },
  cancellations: { label: "Cancellations", actions: ["appointment.cancelled"] },
  rescheduling: { label: "Rescheduling", actions: ["appointment.rescheduled"] },
  messages: {
    label: "Messages",
    actions: ["message.sent", "follow_up.scheduled", "follow_up.sent", "follow_up.cancelled", "reminder.sent", "review.requested", "review.received"],
  },
  handoffs: {
    label: "Handoffs",
    actions: ["conversation.handoff_requested", "conversation.taken_over", "conversation.returned_to_ai", "conversation.resolved", "conversation.assigned"],
  },
  customers: { label: "Customer changes", actions: ["customer.created", "customer.updated", "customer.opted_out", "lead.created", "lead.updated"] },
  ai: { label: "AI actions", actions: ["ai.action_denied"] },
  settings: {
    label: "Settings",
    actions: ["ai.settings_updated", "knowledge.updated", "business.updated", "service.updated", "staff.updated", "member.updated", "billing.updated"],
  },
} as const;
export type AuditCategory = keyof typeof AUDIT_CATEGORIES;
export const ACTOR_TYPES = ["ai", "user", "system", "customer"] as const;
export type AuditActorType = (typeof ACTOR_TYPES)[number];

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listAuditLogs(
  ctx: Ctx,
  opts: { actorType?: AuditActorType; category?: AuditCategory; q?: string; page?: number } = {},
) {
  assertCan(ctx, "audit.view");
  const where: (SQL | undefined)[] = [eq(auditLogs.businessId, ctx.businessId)];
  if (opts.actorType && ACTOR_TYPES.includes(opts.actorType)) where.push(eq(auditLogs.actorType, opts.actorType));
  if (opts.category && opts.category in AUDIT_CATEGORIES) {
    const actions = [...AUDIT_CATEGORIES[opts.category].actions] as string[];
    // "AI actions" covers everything the AI did, plus denied attempts.
    where.push(opts.category === "ai" ? or(inArray(auditLogs.action, actions), eq(auditLogs.actorType, "ai")) : inArray(auditLogs.action, actions));
  }
  const q = opts.q?.trim().slice(0, 100);
  if (q) where.push(or(ilike(auditLogs.summary, like(q)), ilike(auditLogs.actorLabel, like(q)), ilike(auditLogs.action, like(q))));
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const cond = and(...where);
  const [rows, [count]] = await Promise.all([
    dbOf(ctx)
      .select()
      .from(auditLogs)
      .where(cond)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    dbOf(ctx).select({ n: sql<number>`count(*)::int` }).from(auditLogs).where(cond),
  ]);
  return { rows, total: count?.n ?? 0, page, pageSize: AUDIT_PAGE_SIZE };
}

export async function listAiToolCalls(
  ctx: Ctx,
  opts: { status?: "success" | "error" | "denied"; q?: string; page?: number } = {},
) {
  assertCan(ctx, "audit.view");
  const where: (SQL | undefined)[] = [eq(aiActions.businessId, ctx.businessId)];
  if (opts.status && ["success", "error", "denied"].includes(opts.status)) where.push(eq(aiActions.status, opts.status));
  const q = opts.q?.trim().slice(0, 100);
  if (q) where.push(ilike(aiActions.tool, like(q)));
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const cond = and(...where);
  const [rows, [count]] = await Promise.all([
    dbOf(ctx)
      .select()
      .from(aiActions)
      .where(cond)
      .orderBy(desc(aiActions.createdAt), desc(aiActions.id))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    dbOf(ctx).select({ n: sql<number>`count(*)::int` }).from(aiActions).where(cond),
  ]);
  return { rows, total: count?.n ?? 0, page, pageSize: AUDIT_PAGE_SIZE };
}
