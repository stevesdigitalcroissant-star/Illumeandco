import { Badge } from "@/components/ui/badge";

const CONV: Record<string, { label: string; tone: "neutral" | "primary" | "warning" | "success" | "info" | "danger" }> = {
  new: { label: "New", tone: "info" },
  ai_handling: { label: "AI handling", tone: "primary" },
  human_handling: { label: "Human handling", tone: "warning" },
  waiting: { label: "Waiting", tone: "neutral" },
  resolved: { label: "Resolved", tone: "success" },
};
export function ConversationStatusBadge({ status }: { status: string }) {
  const s = CONV[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const LEAD: Record<string, { label: string; tone: "neutral" | "primary" | "warning" | "success" | "info" | "danger" }> = {
  new: { label: "New", tone: "info" },
  contacted: { label: "Contacted", tone: "neutral" },
  qualified: { label: "Qualified", tone: "primary" },
  appointment_booked: { label: "Appointment booked", tone: "success" },
  completed: { label: "Completed", tone: "success" },
  lost: { label: "Lost", tone: "danger" },
};
export function LeadStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const s = LEAD[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
export const LEAD_LABELS = Object.fromEntries(Object.entries(LEAD).map(([k, v]) => [k, v.label]));

const APPT: Record<string, { label: string; tone: "neutral" | "primary" | "warning" | "success" | "info" | "danger" }> = {
  booked: { label: "Booked", tone: "primary" },
  confirmed: { label: "Confirmed", tone: "primary" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  no_show: { label: "No-show", tone: "danger" },
};
export function AppointmentStatusBadge({ status }: { status: string }) {
  const s = APPT[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function HumanRequired() {
  return (
    <Badge tone="danger" className="font-semibold tracking-wide">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-danger" />
      </span>
      HUMAN REQUIRED
    </Badge>
  );
}

export const CHANNEL_LABELS: Record<string, string> = {
  web_chat: "Website chat",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  sms: "SMS",
  email: "Email",
  voice: "Voice",
};
