import Link from "next/link";
import { ChevronRight, Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { fmtRelative } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { teamOverview, type PersonStats, type TeamPerson } from "@/server/services/team-overview";
import { minutes, money, PERIODS, periodOf } from "./format";

export const metadata = { title: "My team" };

type Row = TeamPerson & { stats: PersonStats };

function Metric({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "warning" }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-semibold tabular", tone === "warning" && "text-warning")}>{value}</p>
      {sub ? <p className="truncate text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function PersonRow({ p, currency, days }: { p: Row; currency: string; days: number }) {
  const s = p.stats;
  return (
    <li>
      <Link href={`/app/team/${p.memberId}?days=${days}`} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/50 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3 lg:w-56">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-semibold text-primary">
            {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{p.name}</p>
            <p className="text-xs text-muted-foreground">Last active {s.lastActiveAt ? fmtRelative(s.lastActiveAt) : "—"}</p>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
          <Metric label="Open chats" value={s.openConversations} sub={s.waitingOnThem ? `${s.waitingOnThem} waiting on them` : "none waiting"} tone={s.waitingOnThem ? "warning" : undefined} />
          <Metric label="Replies" value={s.replies} sub={`avg ${minutes(s.avgReplyMinutes)} to reply`} />
          <Metric label="Booked" value={s.booked} sub={money(s.bookedValueCents, currency)} />
          <Metric label="Completed" value={s.completed} sub={money(s.completedValueCents, currency)} />
          <Metric label="No-shows" value={s.noShows} />
        </div>
        <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground lg:block" aria-hidden />
      </Link>
    </li>
  );
}

function Group({ title, description, people, currency, days, badge }: { title: string; description?: string; people: Row[]; currency: string; days: number; badge?: string }) {
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader title={title} description={description} action={badge ? <Badge tone="neutral">{badge}</Badge> : undefined} />
      {people.length ? (
        <ul className="divide-y border-t">{people.map((p) => <PersonRow key={p.memberId} p={p} currency={currency} days={days} />)}</ul>
      ) : (
        <p className="border-t px-5 py-4 text-sm text-muted-foreground">Nobody here yet.</p>
      )}
    </Card>
  );
}

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { ctx, business } = await requirePermission("team.view");
  const days = periodOf((await searchParams).days);
  const since = new Date(new Date().getTime() - days * 86_400_000);
  const { me, managers, people } = await teamOverview(ctx, since);
  const cur = business.currency;
  const staffUnder = (managerId: string | null) => people.filter((p) => p.role === "staff" && p.reportsToMemberId === managerId);

  return (
    <>
      <PageHeader
        title="My team"
        description={
          me.role === "owner"
            ? "Everyone on your team and how they're doing at this location. Only owners and managers can see this page."
            : "The staff who report to you and how they're doing at this location. Only you, other managers and the owner can see this page."
        }
        actions={
          <div className="flex rounded-md border p-0.5 text-[13px]" role="tablist" aria-label="Period">
            {PERIODS.map((d) => (
              <Link key={d} href={`/app/team?days=${d}`} role="tab" aria-selected={d === days} className={cn("rounded px-2.5 py-1", d === days ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                {d} days
              </Link>
            ))}
          </div>
        }
      />

      {!people.length ? (
        <Card>
          <EmptyState icon={<Network />} title="No one to show yet" description={me.role === "owner" ? "Invite your team in Settings → Team. Their activity shows up here." : "No staff report to you yet. The owner sets who reports to whom."} />
        </Card>
      ) : me.role === "owner" ? (
        <>
          {managers.map((m) => {
            const row = people.find((p) => p.memberId === m.memberId)!;
            return (
              <Group key={m.memberId} title={`${m.name}'s team`} description="The manager first, then the staff who report to them." people={[row, ...staffUnder(m.memberId)]} currency={cur} days={days} badge="Manager" />
            );
          })}
          <Group
            title={managers.length ? "Staff without a manager" : "Staff"}
            description={managers.length ? "Open someone to choose who they report to. Every manager can see these people until you do." : undefined}
            people={staffUnder(null)}
            currency={cur}
            days={days}
          />
          {people.some((p) => p.role === "owner") ? <Group title="Other owners" people={people.filter((p) => p.role === "owner")} currency={cur} days={days} /> : null}
        </>
      ) : (
        <>
          <Group title="Report to you" people={staffUnder(me.memberId)} currency={cur} days={days} />
          <Group title="Not assigned to a manager yet" description="Shared by all managers until the owner assigns them." people={staffUnder(null)} currency={cur} days={days} />
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Open chats = conversations assigned to them now. Reply time = how long the customer waited for their reply. Booked = appointments they made. Completed and no-shows count appointments on their calendar when their login is linked to a staff member.
      </p>
    </>
  );
}
