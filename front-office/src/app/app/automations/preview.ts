/**
 * Client-safe previews. These mirror renderTemplate (server/services/messaging.ts)
 * and the follow-up style templates (server/services/followups.ts) so owners
 * see what customers will receive before saving.
 */
export function renderPreview(template: string, vars: Record<string, string>) {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}

export const FOLLOW_UP_STYLES = {
  gentle: {
    label: "Gentle",
    description: "A soft check-in. Good for considered purchases.",
    preview: (n: string, s: string) => `Hi ${n}, just checking in. Would you like me to find you a ${s} time this week?`,
  },
  direct: {
    label: "Direct",
    description: "Asks for the booking. Good for quick, routine services.",
    preview: (n: string, s: string) => `Hi ${n}, shall I book your ${s}? Reply with a day that works and I'll check availability.`,
  },
  value: {
    label: "Value",
    description: "Reminds them availability is open. Good for busy periods.",
    preview: (n: string, s: string) => `Hi ${n}, following up on your question about ${s}. We still have good availability this week — want me to look for a time?`,
  },
} as const;
export type FollowUpStyle = keyof typeof FOLLOW_UP_STYLES;
