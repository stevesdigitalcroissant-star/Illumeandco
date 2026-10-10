import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Stat } from "@/components/stat";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { roleCan } from "@/server/context";
import { personDetail, visibleTeam } from "@/server/services/team-overview";
import { minutes, money, periodOf } from "../format";
import { ReportsTo } from "./reports-to";

export const metadata = { title: "Team member" };

const STATUS_TONE = { completed: "success", no_show: "danger", cancelled: "neutral", booked: "info", confirmed: "info" } as const;

function List({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      {children.length ? <ul className="divide-y border-t">{children}</ul> : <p className="border-t px-5 py-4 text-sm text-muted-foreground">{empty}</p>}
    </Card>
  );
}

export default async function TeamMemberPage({ params, searchParams }: { params: Promise<{ memberId: string }>; searchParams: Promise<{ days?: string }> }) {
  const { ctx, business, role } = await requirePermission("team.view");
  const { memberId } = await params;
  const days = periodOf((await searchParams).days);
  const d = await personDetail(ctx, memberId, new Date(new Date().getTime() - days * 86_400_000));
  const { managers } = await visibleTeam(ctx);
  const s = d.stats;
  const tz = business.timezone;
  const cur = business.currency;
  const manager = managers.find((m) => m.memberId === d.person.reportsToMemberId);

  return (
    <>
      <Link href={`/app/team?days=${days}`} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" /> My team
      </Link>
      <PageHeader
        title={d.person.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral" className="capitalize">{d.person.role}</Badge>
            <span>{d.person.email}</span>
            <span>· last active {s.lastActiveAt ? fmtRelative(s.lastActiveAt) : "—"}</span>
            {d.person.role === "staff" && !roleCan(role, "members.manage") ? <span>· reports to {manager?.name ?? "no one yet"}</span> : null}
          </span>
        }
        actions={d.person.role === "staff" && roleCan(role, "members.manage") ? <ReportsTo memberId={d.person.memberId} value={d.person.reportsToMemberId} managers={managers.map((m) => ({ memberId: m.memberId, name: m.name }))} /> : null}
      />

      <p className="mb-3 text-xs text-muted-foreground">Last {days} days at {business.name}</p>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Open chats" value={s.openConversations} sub={s.waitingOnThem ? `${s.waitingOnThem} waiting on them` : "none waiting"} tone={s.waitingOnThem ? "danger" : "default"} />
        <Stat label="Replies sent" value={s.replies} sub={`avg ${minutes(s.avgReplyMinutes)} to reply`} />
        <Stat label="Appointments booked" value={s.booked} sub={money(s.bookedValueCents, cur)} />
        <Stat label="Completed" value={s.completed} sub={money(s.completedValueCents, cur)} />
        <Stat label="No-shows" value={s.noShows} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <List title="Conversations assigned to them" empty="None assigned.">
          {d.conversations.map((c) => (
            <li key={c.id}>
              <Link href={`/app/inbox?c=${c.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.customer ?? "Customer"}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.preview ?? "—"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge tone={c.status === "resolved" ? "neutral" : "info"} className="capitalize">{c.status.replace("_", " ")}</Badge>
                  <p className="mt-1 text-xs text-muted-foreground">{fmtRelative(c.lastMessageAt)}</p>
                </div>
              </Link>
            </li>
          ))}
        </List>
        <List title="Recent activity" empty="No activity recorded yet.">
          {d.activity.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
              <span className="min-w-0">{a.summary}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtRelative(a.createdAt)}</span>
            </li>
          ))}
        </List>
        <List title="Appointments they booked" empty="None yet.">
          {d.booked.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 truncate">{a.service} · {a.customer ?? "Customer"}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {fmtDateTime(a.startsAt, tz, "d LLL, HH:mm")} <Badge tone={STATUS_TONE[a.status]} className="capitalize">{a.status.replace("_", "-")}</Badge>
              </span>
            </li>
          ))}
        </List>
        <List title="Appointments on their calendar" empty="Their login isn't linked to a staff member on the calendar, or nothing is scheduled.">
          {d.performed.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 truncate">{a.service} · {a.customer ?? "Customer"}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {fmtDateTime(a.startsAt, tz, "d LLL, HH:mm")} <Badge tone={STATUS_TONE[a.status]} className="capitalize">{a.status.replace("_", "-")}</Badge>
              </span>
            </li>
          ))}
        </List>
      </div>
    </>
  );
}
