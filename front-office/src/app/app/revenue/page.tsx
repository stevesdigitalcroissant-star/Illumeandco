import Link from "next/link";
import { Circle, CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Table } from "@/components/ui/misc";
import { Stat } from "@/components/stat";
import { requirePermission } from "@/lib/session";
import { formatMoney } from "@/lib/utils";
import { roleCan } from "@/server/context";
import { revenueFeed, revenueSummary, WORKER_LABELS } from "@/server/recovery/revenue";
import { FeedActionButton } from "./feed-action";
import { setupChecklist } from "@/server/recovery/setup";

export const metadata = { title: "Revenue recovery" };

export default async function RevenuePage() {
  const { ctx, business, role } = await requirePermission("analytics.view");
  const money = (c: number | null | undefined) => (c == null ? "—" : formatMoney(c, business.currency));
  const [s, feed, setup] = await Promise.all([
    revenueSummary(ctx),
    roleCan(role, "leads.manage") ? revenueFeed(ctx) : Promise.resolve([]),
    roleCan(role, "business.manage") ? setupChecklist(ctx) : Promise.resolve([]),
  ]);
  const setupDone = setup.filter((i) => i.done).length;

  return (
    <>
      <PageHeader
        title="Revenue recovery"
        description="Revenue that would have slipped away — missed calls, unanswered leads, empty slots, lapsed customers — and what your AI workers did about it. Last 30 days."
      />
      {setup.length && setupDone < setup.length ? (
        <Card className="mb-6">
          <CardHeader title={`Get recovery running · ${setupDone} of ${setup.length} done`} description="Each step is checked against your real setup." />
          <ul className="divide-y">
            {setup.map((i) => (
              <li key={i.key} className="flex items-start gap-3 px-5 py-3">
                {i.done ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className={i.done ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{i.label}</p>
                  {!i.done ? <p className="text-[13px] text-muted-foreground">{i.hint}</p> : null}
                </div>
                {!i.done && !i.needsOperator && i.key !== "win" ? <Link href={i.href} className="shrink-0 text-[13px] font-medium text-primary hover:underline">Set up →</Link> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="mb-2 grid gap-3 md:grid-cols-3">
        <Stat
          label="Opportunities identified"
          value={money(s.identified.valueCents)}
          sub={`${s.identified.count} opportunit${s.identified.count === 1 ? "y" : "ies"} at service prices${s.estimatedCount ? ` · ${s.estimatedCount} valued at your average booking (estimate)` : ""}`}
        />
        <Stat label="Revenue influenced" value={money(s.influenced.valueCents)} sub={`${s.influenced.count} booking${s.influenced.count === 1 ? "" : "s"} made after an AI action went out first`} />
        <Stat
          label="Revenue realized"
          value={money(s.realized.valueCents)}
          sub={`${s.realized.count} of those appointments completed${s.unverifiable ? ` · ${s.unverifiable} booked in an external system (not verifiable here)` : ""}`}
        />
      </div>
      <p className="mb-6 text-xs text-muted-foreground">
        Influenced counts a booking only when a text-back, first message, follow-up or slot offer was delivered before it. Realized counts only completed appointments. Nothing here is projected.
      </p>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="What to do next" description="Most valuable first: value × likelihood, boosted when time is short. Work the AI is already doing isn't listed." />
          {feed.length ? (
            <ul className="divide-y">
              {feed.map((f) => (
                <li key={`${f.type}:${f.id}`} className="flex items-start justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={f.worker === "needs_human" ? "danger" : f.type === "slot" ? "primary" : "neutral"}>{f.worker === "needs_human" ? "Needs a person" : WORKER_LABELS[f.worker]}</Badge>
                      <span className="text-sm font-medium">{f.who ? `${f.who} — ` : ""}{f.title}</span>
                    </div>
                    {f.detail ? <p className="mt-1 text-[13px] text-muted-foreground">{f.detail}</p> : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {f.valueCents != null ? `${money(f.valueCents)}${f.valueIsEstimate ? " (avg. estimate)" : ""} · ` : ""}
                      {f.why}
                    </p>
                  </div>
                  <FeedActionButton id={f.id} action={f.action} conversationId={f.conversationId} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing needs you" description="When a missed call, lead, empty slot or lapsed customer needs a decision, it shows up here." />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="By worker" description="Identified → influenced → realized." />
          <Table>
            <thead>
              <tr><th>Worker</th><th className="text-right">Identified</th><th className="text-right">Influenced</th><th className="text-right">Realized</th></tr>
            </thead>
            <tbody>
              {s.workers.map((w) => (
                <tr key={w.worker}>
                  <td className="font-medium">{w.label}</td>
                  <td className="text-right tabular">{w.identified.count}<div className="text-xs text-muted-foreground">{money(w.identified.valueCents)}</div></td>
                  <td className="text-right tabular">{w.influenced.count}<div className="text-xs text-muted-foreground">{money(w.influenced.valueCents)}</div></td>
                  <td className="text-right tabular">{w.realized.count}<div className="text-xs text-muted-foreground">{money(w.realized.valueCents)}</div></td>
                </tr>
              ))}
            </tbody>
          </Table>
          {s.averageCents == null ? <p className="px-5 py-3 text-xs text-muted-foreground">No bookings yet to estimate an average value — unknown-value opportunities are counted but not valued.</p> : null}
        </Card>
      </div>
    </>
  );
}
