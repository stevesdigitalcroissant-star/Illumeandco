import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { ArrowRight, Bot, CalendarDays, TriangleAlert } from "lucide-react";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { pct, Stat } from "@/components/stat";
import { HumanRequired } from "@/components/status";
import { fmtRelative, fmtTime } from "@/lib/format";
import { requireBusiness } from "@/lib/session";
import { activeEngineInfo } from "@/server/ai/agent";
import { roleCan } from "@/server/context";
import { overviewMetrics } from "@/server/services/analytics";
import { revenueSummary } from "@/server/recovery/revenue";
import { formatMoney } from "@/lib/utils";
import { listAppointments } from "@/server/services/appointments";
import { listConversations } from "@/server/services/conversations";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const { ctx, business, user, role } = await requireBusiness();
  const tz = business.timezone;
  const now = new Date();
  const local = DateTime.fromJSDate(now).setZone(tz);
  const [m, waiting, today, activity, revenue] = await Promise.all([
    overviewMetrics(ctx, now),
    listConversations(ctx, { status: "needs_human", limit: 5 }),
    listAppointments(ctx, { from: now, to: local.endOf("day").toJSDate(), status: ["booked", "confirmed"] }),
    roleCan(role, "audit.view")
      ? db.select().from(auditLogs).where(and(eq(auditLogs.businessId, business.id), eq(auditLogs.actorType, "ai"))).orderBy(desc(auditLogs.createdAt)).limit(7)
      : Promise.resolve([]),
    roleCan(role, "analytics.view") ? revenueSummary(ctx, { now }) : Promise.resolve(null),
  ]);
  const money = (c: number) => formatMoney(c, business.currency);
  const engine = activeEngineInfo();
  const greeting = local.hour < 12 ? "Good morning" : local.hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.replace(/^(dr|mr|mrs|ms|prof)\.?\s+/i, "").split(" ")[0]}`}
        description={`${local.toFormat("cccc d LLLL")} · Here's what your front office handled today.`}
        actions={
          <Badge tone={engine.id === "anthropic" ? "primary" : "neutral"} className="py-1">
            <Bot className="size-3.5" /> {engine.id === "anthropic" ? `AI active · ${engine.model}` : "AI active · basic rules engine"}
          </Badge>
        }
      />

      {revenue ? (
        <div className="mb-3 grid gap-3 md:grid-cols-3">
          <Stat label="Identified · 30 days" value={money(revenue.identified.valueCents)} sub={`${revenue.identified.count} missed calls, leads, empty slots & lapsed customers`} href="/app/revenue" />
          <Stat label="Influenced · 30 days" value={money(revenue.influenced.valueCents)} sub={`${revenue.influenced.count} bookings after an AI action`} href="/app/revenue" />
          <Stat label="Realized · 30 days" value={money(revenue.realized.valueCents)} sub={`${revenue.realized.count} completed appointments`} href="/app/revenue" />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Conversations today" value={m.conversationsToday} href="/app/inbox" />
        <Stat label="New leads" value={m.newLeadsToday} href="/app/leads" />
        <Stat label="Appointments booked" value={m.bookedToday} sub={m.bookedToday ? `${m.aiBookedToday} by the AI` : undefined} href="/app/appointments" />
        <Stat label="Upcoming appointments" value={m.upcoming} sub={`${m.upcomingToday} later today`} href="/app/calendar" />
        <Stat
          label="Opportunities need you"
          value={m.opportunitiesNeedingYou}
          sub={m.recovered30d ? `${m.recovered30d} recovered · 30 days` : `${m.openOpportunities} open in total`}
          href="/app/opportunities"
          tone={m.opportunitiesNeedingYou ? "danger" : "default"}
        />
        <Stat label="AI conversations" value={m.aiConversationsToday} sub="Today" />
        <Stat label="Human handoffs" value={m.handoffsToday} sub={m.waitingForHuman ? `${m.waitingForHuman} waiting now` : "None waiting"} href="/app/inbox?status=needs_human" tone={m.waitingForHuman ? "danger" : "default"} />
        <Stat label="Conversion rate" value={pct(m.conversionRate30d)} sub={`${m.converted30d} of ${m.leads30d} leads booked · 30 days`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Needs a human" description="Conversations the AI handed to your team." action={<Link href="/app/inbox?status=needs_human" className="text-[13px] text-muted-foreground hover:text-foreground">Open inbox</Link>} />
            {waiting.length ? (
              <ul>
                {waiting.map((c) => (
                  <li key={c.conversation.id} className="border-t first:border-t-0">
                    <Link href={`/app/inbox?c=${c.conversation.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface">
                      <Avatar name={c.customer.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{c.customer.name ?? c.customer.email ?? c.customer.phone ?? "Website visitor"}</span>
                          <HumanRequired />
                        </div>
                        <p className="truncate text-[13px] text-muted-foreground">{c.conversation.handoffReason ?? c.conversation.lastMessagePreview}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{fmtRelative(c.conversation.handoffRequestedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nobody is waiting" description="When a customer asks for a person, they'll appear here." />
            )}
          </Card>

          {roleCan(role, "leads.manage") ? (
            <Card>
              <CardHeader title="Opportunities that need you" description="What only a person can do next — the AI is following up on the rest." action={<Link href="/app/opportunities" className="text-[13px] text-muted-foreground hover:text-foreground">View all</Link>} />
              {m.topOpportunities.length ? (
                <ul>
                  {m.topOpportunities.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 border-t px-5 py-3 first:border-t-0">
                      <TriangleAlert className="size-4 shrink-0 text-warning" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{o.title}</p>
                        {o.next ? <p className="truncate text-xs text-muted-foreground">{o.next}</p> : null}
                      </div>
                      <Link href="/app/opportunities" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary">
                        Act <ArrowRight className="size-3.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nothing needs you right now" description="The AI is following up on open leads. Anything that needs a person appears here." />
              )}
            </Card>
          ) : null}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Rest of today" action={<Link href="/app/calendar" className="text-[13px] text-muted-foreground hover:text-foreground">Calendar</Link>} />
            {today.length ? (
              <ul>
                {today.slice(0, 6).map((a) => (
                  <li key={a.appointment.id} className="flex items-center gap-3 border-t px-5 py-2.5 first:border-t-0">
                    <span className="w-16 shrink-0 text-[13px] font-medium tabular">{fmtTime(a.appointment.startsAt, tz)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{a.customer.name ?? "Customer"}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.service.name} · {a.staff.name}</p>
                    </div>
                    {a.appointment.source === "ai" ? <Badge tone="primary">AI</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<CalendarDays />} title="Nothing else today" />
            )}
          </Card>

          {activity.length ? (
            <Card>
              <CardHeader title="Recent AI activity" action={<Link href="/app/audit" className="text-[13px] text-muted-foreground hover:text-foreground">Audit log</Link>} />
              <ul className="px-5 py-2">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3 py-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p className="text-[13px] leading-snug">{a.summary}</p>
                      <p className="text-xs text-muted-foreground">{fmtRelative(a.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
