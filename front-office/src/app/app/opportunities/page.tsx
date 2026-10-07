import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { DateTime } from "luxon";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Stat } from "@/components/stat";
import { requirePermission } from "@/lib/session";
import { cn, formatMoney } from "@/lib/utils";
import { boardSummary, listBoard, recentClosed } from "@/server/opportunities/board";
import { STAGE_LABELS } from "@/server/opportunities/engine";
import { OpportunityCard, type CardData } from "./opportunity-card";

export const metadata = { title: "Opportunities" };

const VIEWS = [
  { key: "", label: "Needs you" },
  { key: "ai", label: "AI is handling" },
  { key: "all", label: "All open" },
  { key: "closed", label: "Won & lost" },
] as const;
const KINDS = [
  { key: "", label: "All types" },
  { key: "lead", label: "Leads" },
  { key: "cancellation", label: "Cancellations" },
  { key: "no_show", label: "No-shows" },
  { key: "reactivation", label: "Reactivation" },
  { key: "needs_human", label: "Needs a person" },
] as const;

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ view?: string; kind?: string }> }) {
  const { ctx, business } = await requirePermission("leads.manage");
  const sp = await searchParams;
  const view = VIEWS.some((v) => v.key === sp.view) ? (sp.view ?? "") : "";
  const kind = KINDS.some((k) => k.key === sp.kind && k.key) ? (sp.kind as CardData["kind"]) : undefined;
  const now = new Date();
  const tz = business.timezone;
  const money = (c: number | null) => (c == null ? null : formatMoney(c, business.currency));
  const [summary, rows, closed] = await Promise.all([
    boardSummary(ctx, now),
    view === "closed" ? Promise.resolve([]) : listBoard(ctx, { kind: kind as never }),
    view === "closed" ? recentClosed(ctx, 30, now) : Promise.resolve([]),
  ]);
  const needsYou = (r: (typeof rows)[number]) => r.opportunity.kind === "needs_human" || (r.opportunity.nextActionBy === "human" && r.opportunity.nextAction !== "none");
  const shown = rows.filter((r) => (view === "" ? needsYou(r) : view === "ai" ? r.opportunity.nextActionBy === "ai" && r.opportunity.nextAction !== "none" : true));
  const cards: CardData[] = shown.map(({ opportunity: o, customer }) => ({
    id: o.id,
    kind: o.kind,
    stage: o.stage,
    stageLabel: STAGE_LABELS[o.stage],
    title: o.title,
    customerId: customer.id,
    customerName: customer.name ?? customer.email ?? customer.phone ?? "Website visitor",
    optedOut: customer.optedOut,
    wants: o.wants,
    blocker: o.blocker,
    blockerDetail: o.blockerDetail,
    intentScore: o.intentScore,
    nextAction: o.nextAction,
    nextActionLabel: o.nextActionLabel,
    nextActionBy: o.nextActionBy,
    nextActionDue: !o.nextActionAt || o.nextActionAt <= now,
    conversationId: o.conversationId,
    estimatedValue: money(o.estimatedValueCents),
    evidence: [...o.evidence].reverse().map((e) => ({ when: DateTime.fromISO(e.at).setZone(tz).toFormat("d LLL, h:mm a"), detail: e.detail })),
    lastActivity: o.lastActivityAt?.toISOString() ?? null,
  }));
  const href = (patch: { view?: string; kind?: string }) => {
    const p = new URLSearchParams(Object.entries({ view, kind: kind ?? "", ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/app/opportunities${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Every conversation has a next step. Your AI tracks each customer from first contact to booked appointment — and tells you exactly what needs you."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Needs you" value={summary.needsYou} sub="Actions only a person can take" tone={summary.needsYou ? "danger" : "default"} href="/app/opportunities" />
        <Stat label="AI is handling" value={summary.aiHandling} sub="Follow-ups queued automatically" href="/app/opportunities?view=ai" />
        <Stat label="High-intent leads" value={summary.highIntent} sub={`${money(summary.openEstimatedValueCents)} est. in open opportunities`} />
        <Stat
          label="Recovered · 30 days"
          value={summary.recovered}
          sub={summary.recovered ? `${money(summary.recoveredValueCents)} est. · booked after a follow-up` : `${summary.won} converted in total`}
          href="/app/opportunities?view=closed"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {VIEWS.map((v) => (
          <Link key={v.key} href={href({ view: v.key, kind: v.key === "closed" ? "" : kind })} className={cn("rounded-full px-3 py-1 text-[13px]", view === v.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}>
            {v.label}
          </Link>
        ))}
        {view !== "closed" ? (
          <span className="ml-auto flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <Link key={k.key} href={href({ kind: k.key })} className={cn("rounded-full border px-2.5 py-0.5 text-xs", (kind ?? "") === k.key ? "border-foreground text-foreground" : "text-muted-foreground hover:bg-muted")}>
                {k.label}
              </Link>
            ))}
          </span>
        ) : null}
      </div>

      {view === "closed" ? (
        <Card>
          <CardHeader title="Closed in the last 30 days" description="Recovered means a follow-up was sent before the customer booked. Values are estimates from service prices." />
          {closed.length ? (
            <ul>
              {closed.map(({ opportunity: o, customerName }) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 border-t px-5 py-3 text-sm first:border-t-0">
                  {o.recovered ? <Badge tone="success">Recovered</Badge> : o.status === "won" ? <Badge tone="primary">{o.kind === "needs_human" ? "Resolved" : "Won"}</Badge> : <Badge tone="neutral">Lost</Badge>}
                  <span className="font-medium">{customerName ?? "Customer"}</span>
                  <span className="text-muted-foreground">{o.title}</span>
                  <span className="ml-auto text-[13px] text-muted-foreground">
                    {o.closedReason}
                    {o.recovered && o.recoveredValueCents != null ? ` · ${money(o.recoveredValueCents)} est.` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing closed yet" description="Won, recovered and lost opportunities from the last 30 days appear here." />
          )}
        </Card>
      ) : (
        <Card>
          {cards.length ? (
            <ul>
              {cards.map((c) => (
                <OpportunityCard key={c.id} o={c} />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<CircleCheck />}
              title={view === "" ? "Nothing needs you right now" : "No open opportunities here"}
              description={view === "" ? "The AI is handling follow-ups. Anything that needs a person will appear here." : "New enquiries, cancellations and no-shows appear here automatically."}
            />
          )}
        </Card>
      )}
    </>
  );
}
