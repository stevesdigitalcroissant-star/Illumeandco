import { CHANNEL_LABELS } from "@/components/status";

const SOURCE_LABELS: Record<string, string> = {
  ...CHANNEL_LABELS,
  voice: "Phone",
  manual: "Added by team",
  walk_in: "Walk-in",
  referral: "Referral",
  import: "Imported",
};

/** Human label for a customer/lead source; unknown values are humanised. */
export function sourceLabel(source: string | null | undefined) {
  if (!source) return "—";
  return SOURCE_LABELS[source] ?? source.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
