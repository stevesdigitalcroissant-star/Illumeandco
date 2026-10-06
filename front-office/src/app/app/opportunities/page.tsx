import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getAiSettings } from "@/server/services/business";
import { listOpportunities, type OpportunityType } from "@/server/services/opportunities";
import { OpportunityItem } from "./opportunity-item";
import { TYPE_META } from "./types";

export const metadata = { title: "Missed opportunities" };

const ORDER: OpportunityType[] = ["waiting_for_human", "stale_lead", "abandoned_booking", "cancelled_no_rebook", "lapsed_customer"];

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { ctx } = await requirePermission("leads.manage");
  const sp = await searchParams;
  const type = ORDER.includes(sp.type as OpportunityType) ? (sp.type as OpportunityType) : undefined;
  const [all, settings] = await Promise.all([listOpportunities(ctx), getAiSettings(ctx)]);

  const counts = new Map<OpportunityType, number>();
  for (const o of all) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
  const shown = (type ? all.filter((o) => o.type === type) : all).sort(
    (a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || b.at.localeCompare(a.at),
  );
  const groups = ORDER.map((t) => ({ type: t, items: shown.filter((o) => o.type === t) })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader
        title="Missed opportunities"
        description="Revenue that's slipping through the cracks — computed live from real conversations, leads and appointments."
      />

      <div className="mb-5 rounded-lg border bg-surface px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">How these are found. </span>
        Leads with no reply or follow-up for {settings.missedOpportunities.staleLeadHours}h, visitors who were shown open times but didn&apos;t book,
        cancellations with no rebooking in 30 days, regulars who haven&apos;t returned in {settings.missedOpportunities.noReturnDays} days, and
        customers waiting over 30 minutes for a person. &ldquo;Follow up&rdquo; sends a message right away through the same safety checks as
        automated follow-ups (opt-outs, existing bookings, human takeover).
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <FilterPill href="/app/opportunities" active={!type} label="All" count={all.length} />
        {ORDER.map((t) => (
          <FilterPill key={t} href={`/app/opportunities?type=${t}`} active={type === t} label={TYPE_META[t].label} count={counts.get(t) ?? 0} />
        ))}
      </div>

      {groups.length ? (
        <div className="space-y-5">
          {groups.map((g) => (
            <Card key={g.type}>
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h3 className="text-sm font-semibold">{TYPE_META[g.type].label}</h3>
                <span className="text-xs text-muted-foreground tabular">{g.items.length}</span>
              </div>
              <ul>
                {g.items.map((o) => (
                  <OpportunityItem key={o.key} opportunity={o} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<CircleCheck />}
            title={type ? `Nothing in “${TYPE_META[type].label}”` : "No missed opportunities"}
            description="Every interested customer has booked, been followed up, or been dismissed. New ones appear here automatically."
          />
        </Card>
      )}
    </>
  );
}

function FilterPill({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
        active ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("tabular text-xs", active ? "text-background/70" : "text-muted-foreground/70")}>{count}</span>
    </Link>
  );
}
