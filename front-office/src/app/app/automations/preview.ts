/** Client-safe previews built from the same templates the server sends. */
import { FOLLOW_UP_TEMPLATES, renderTemplate } from "@/lib/templates";

export const renderPreview = (template: string, vars: Record<string, string>) => renderTemplate(template, vars);

export const FOLLOW_UP_STYLES = {
  gentle: { label: "Gentle", description: "A soft check-in. Good for considered purchases.", preview: (n: string, s: string) => FOLLOW_UP_TEMPLATES.gentle(n, s, 1) },
  direct: { label: "Direct", description: "Asks for the booking. Good for quick, routine services.", preview: (n: string, s: string) => FOLLOW_UP_TEMPLATES.direct(n, s, 1) },
  value: { label: "Value", description: "Reminds them availability is open. Good for busy periods.", preview: (n: string, s: string) => FOLLOW_UP_TEMPLATES.value(n, s, 1) },
} as const;
export type FollowUpStyle = keyof typeof FOLLOW_UP_STYLES;
