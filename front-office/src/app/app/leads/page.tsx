import Link from "next/link";
import { Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { LEAD_LABELS } from "@/components/status";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { appointmentTimes } from "@/server/services/customer-profile";
import { LEAD_STATUSES, listLeads, type LeadStatus } from "@/server/services/leads";
import { LeadsTable, type LeadRow } from "./leads-table";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { ctx, business } = await requirePermission("leads.manage");
  const sp = await searchParams;
  const status = LEAD_STATUSES.includes(sp.status as LeadStatus) ? (sp.status as LeadStatus) : undefined;

  const all = await listLeads(ctx);
  const counts = new Map<string, number>();
  for (const r of all) counts.set(r.lead.status, (counts.get(r.lead.status) ?? 0) + 1);
  const rows = status ? all.filter((r) => r.lead.status === status) : all;
  const appts = await appointmentTimes(
    ctx,
    rows.map((r) => r.lead.appointmentId).filter((x): x is string => !!x),
  );

  const data: LeadRow[] = rows.map((r) => {
    const a = r.lead.appointmentId ? appts.get(r.lead.appointmentId) : undefined;
    return {
      id: r.lead.id,
      status: r.lead.status,
      source: r.lead.source,
      service: r.serviceName ?? r.lead.serviceInterest,
      notes: r.lead.notes,
      lostReason: r.lead.lostReason,
      lastContactAt: (r.lead.lastContactAt ?? r.lead.createdAt).toISOString(),
      nextFollowUpAt: r.lead.nextFollowUpAt?.toISOString() ?? null,
      conversationId: r.lead.conversationId,
      appointment: a ? { startsAt: a.startsAt.toISOString(), status: a.status } : null,
      customer: r.customer,
    };
  });

  const tabs: { key: LeadStatus | undefined; label: string; count: number }[] = [
    { key: undefined, label: "All", count: all.length },
    ...LEAD_STATUSES.map((s) => ({ key: s, label: LEAD_LABELS[s] ?? s, count: counts.get(s) ?? 0 })),
  ];

  return (
    <>
      <PageHeader title="Leads" description="Everyone who showed interest — captured by the AI or added by your team." />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map((t) => {
          const active = t.key === status;
          return (
            <Link
              key={t.label}
              href={t.key ? `/app/leads?status=${t.key}` : "/app/leads"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                active ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className={cn("tabular text-xs", active ? "text-background/70" : "text-muted-foreground/70")}>{t.count}</span>
            </Link>
          );
        })}
      </div>

      <Card>
        {data.length ? (
          <LeadsTable rows={data} timezone={business.timezone} />
        ) : (
          <EmptyState
            icon={<Target />}
            title={status ? `No ${LEAD_LABELS[status]?.toLowerCase()} leads` : "No leads yet"}
            description={
              status
                ? "Leads move between stages as the AI and your team work them."
                : "When someone asks about a service in chat, WhatsApp or by phone, the AI records them here as a lead."
            }
          />
        )}
      </Card>
    </>
  );
}
