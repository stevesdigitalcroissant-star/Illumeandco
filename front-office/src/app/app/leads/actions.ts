"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/action";
import { requirePermission } from "@/lib/session";
import { invalid } from "@/server/context";
import { processFollowUp, scheduleFollowUp } from "@/server/services/followups";
import { getLead, LEAD_STATUSES, updateLead, type LeadStatus } from "@/server/services/leads";
import { CHANNEL_LABELS } from "@/components/status";

export async function updateLeadStatusAction(leadId: string, status: string) {
  const { ctx } = await requirePermission("leads.manage");
  const res = await run(async () => {
    if (!LEAD_STATUSES.includes(status as LeadStatus)) throw invalid("Unknown lead status.");
    await updateLead(ctx, leadId, { status: status as LeadStatus });
  }, "Status updated");
  revalidatePath("/app/leads");
  return res;
}

export async function updateLeadNotesAction(leadId: string, notes: string) {
  const { ctx } = await requirePermission("leads.manage");
  const res = await run(async () => {
    await updateLead(ctx, leadId, { notes: notes.trim().slice(0, 4000) || null });
  }, "Notes saved");
  revalidatePath("/app/leads");
  return res;
}

/** Send a follow-up now, through the same stop conditions as automated ones. */
export async function followUpLeadAction(leadId: string) {
  const { ctx } = await requirePermission("leads.manage");
  const res = await run(async () => {
    const lead = await getLead(ctx, leadId);
    const f = await scheduleFollowUp(ctx, {
      customerId: lead.customerId,
      leadId: lead.id,
      conversationId: lead.conversationId,
      scheduledFor: new Date(),
      reason: "Manual follow-up from the leads pipeline",
    });
    const result = await processFollowUp(ctx, f);
    return result.sent
      ? { sent: true as const, detail: `Sent via ${CHANNEL_LABELS[result.channel ?? ""] ?? result.channel ?? "an available channel"}.` }
      : { sent: false as const, detail: result.reason ?? "The follow-up was not sent." };
  });
  revalidatePath("/app/leads");
  return res;
}
