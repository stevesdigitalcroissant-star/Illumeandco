/**
 * AI permissions. The business owner decides what the AI may do; every tool
 * declares the permission it needs. Disallowed tools are (1) never offered to
 * the model and (2) refused again at execution time, with the attempt logged.
 */
import type { AiPermissions } from "@/db/schema";

export type AiPermissionKey = keyof AiPermissions;

export const AI_PERMISSION_LABELS: Record<AiPermissionKey, { label: string; description: string; implemented: boolean }> = {
  answer_faqs: { label: "Answer FAQs", description: "Share business info, services, prices and knowledge base answers.", implemented: true },
  capture_leads: { label: "Capture leads", description: "Save customer contact details and create leads.", implemented: true },
  book_appointments: { label: "Book appointments", description: "Check availability and book new appointments.", implemented: true },
  reschedule_appointments: { label: "Reschedule", description: "Move a customer's existing appointment.", implemented: true },
  cancel_appointments: { label: "Cancel", description: "Cancel a customer's existing appointment.", implemented: true },
  send_messages: { label: "Send messages", description: "Send the customer a message on another channel (email, SMS, WhatsApp).", implemented: true },
  create_follow_ups: { label: "Schedule follow-ups", description: "Queue a follow-up when a customer goes quiet.", implemented: true },
  request_reviews: { label: "Request reviews", description: "Ask customers for a review after a completed visit.", implemented: true },
  update_customers: { label: "Update customer records", description: "Correct names, contact details and remember preferences.", implemented: true },
  issue_refunds: { label: "Issue refunds", description: "The AI never handles money. Refund requests go to your team.", implemented: false },
  change_prices: { label: "Change prices", description: "The AI can never change your prices.", implemented: false },
};

/** `null` = always allowed (e.g. escalating to a human can never be disabled). */
export type ToolPermission = AiPermissionKey | AiPermissionKey[] | null;

export function isAllowed(perms: AiPermissions, required: ToolPermission) {
  if (required === null) return true;
  const list = Array.isArray(required) ? required : [required];
  // Any of the listed permissions grants access.
  return list.some((p) => perms[p] === true && AI_PERMISSION_LABELS[p].implemented);
}
