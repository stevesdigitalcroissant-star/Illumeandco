import { auditLogs } from "@/db/schema";
import { actorId, actorLabel, dbOf, type Ctx } from "./context";

export type AuditAction =
  | "appointment.booked"
  | "appointment.rescheduled"
  | "appointment.cancelled"
  | "appointment.completed"
  | "appointment.no_show"
  | "message.sent"
  | "conversation.handoff_requested"
  | "conversation.taken_over"
  | "conversation.returned_to_ai"
  | "conversation.resolved"
  | "conversation.assigned"
  | "customer.created"
  | "customer.updated"
  | "customer.opted_out"
  | "lead.created"
  | "lead.updated"
  | "follow_up.scheduled"
  | "follow_up.sent"
  | "follow_up.cancelled"
  | "review.requested"
  | "review.received"
  | "opportunity.won"
  | "opportunity.recovered"
  | "opportunity.lost"
  | "reminder.sent"
  | "ai.action_denied"
  | "ai.settings_updated"
  | "knowledge.updated"
  | "business.updated"
  | "service.updated"
  | "staff.updated"
  | "member.updated"
  | "billing.updated"
  | "integration.updated";

/**
 * Record an important action. Written in the same transaction as the change
 * when ctx.tx is set, so the log can never disagree with the data.
 */
export async function audit(
  ctx: Ctx,
  entry: {
    action: AuditAction;
    summary: string;
    entityType?: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
  },
) {
  await dbOf(ctx).insert(auditLogs).values({
    businessId: ctx.businessId,
    actorType: ctx.actor.type,
    actorId: actorId(ctx.actor),
    actorLabel: actorLabel(ctx.actor),
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    details: entry.details ?? {},
  });
}
