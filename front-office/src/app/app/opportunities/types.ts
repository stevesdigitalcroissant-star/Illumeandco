import type { OpportunityType } from "@/server/services/opportunities";

export const TYPE_META: Record<OpportunityType, { label: string; tone: string }> = {
  waiting_for_human: { label: "Waiting for a person", tone: "bg-danger-soft text-danger" },
  stale_lead: { label: "Interested, never booked", tone: "bg-warning-soft text-warning" },
  abandoned_booking: { label: "Abandoned booking", tone: "bg-info-soft text-info" },
  cancelled_no_rebook: { label: "Cancelled, not rebooked", tone: "bg-muted text-foreground/70" },
  lapsed_customer: { label: "Hasn't returned", tone: "bg-primary-soft text-primary" },
};
