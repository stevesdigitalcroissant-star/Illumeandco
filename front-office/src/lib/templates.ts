/**
 * Pure message templates shared by the server (what customers receive) and
 * the dashboard (previews). Keep this file free of server-only imports.
 */
export function renderTemplate(template: string, vars: Record<string, string | null | undefined>) {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}

export type FollowUpStyleKey = "gentle" | "direct" | "value";

/** Follow-up message by style. `service` is lower-cased (e.g. "teeth whitening") or null. */
export const FOLLOW_UP_TEMPLATES: Record<FollowUpStyleKey, (name: string, service: string | null, attempt: number) => string> = {
  gentle: (n, s, a) =>
    a > 1
      ? `Hi ${n}, just one last check-in — if you'd still like ${s ? `a ${s}` : "an appointment"}, I'm happy to find a time that suits you. Reply STOP to opt out.`
      : `Hi ${n}, just checking in. Would you like me to find you ${s ? `a ${s}` : "an appointment"} time this week?`,
  direct: (n, s) => `Hi ${n}, shall I book ${s ? `your ${s}` : "an appointment"}? Reply with a day that works and I'll check availability.`,
  value: (n, s) =>
    `Hi ${n}, following up on your question${s ? ` about ${s}` : ""}. We still have good availability this week — want me to look for a time?`,
};
