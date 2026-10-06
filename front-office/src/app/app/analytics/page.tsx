import Link from "next/link";
import { DateTime } from "luxon";
import { BarChart3 } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Table } from "@/components/ui/misc";
import { pct, Stat } from "@/components/stat";
import { fmtDuration } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { cn, formatMoney } from "@/lib/utils";
import { analytics } from "@/server/services/analytics";
import { BookingsChart, ConversationsLeadsChart, type DayPoint } from "./charts";

export const metadata = { title: "Analytics" };

const RANGES = [7, 30, 90] as const;

function NotEnough({ what }: { what: string }) {
  return <EmptyState icon={<BarChart3 />} title="Not enough data yet" description={`${what} will appear here once your front office has some activity in this period.`} className="py-12" />;
}

const SOURCE_LABELS: Record<string, string> = { web_chat: "Website chat", whatsapp: "WhatsApp", instagram: "Instagram", sms: "SMS", email: "Email", voice: "Voice", manual: "Added by team", unknown: "Unknown" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { ctx, business } = await requirePermission("analytics.view");
  const sp = await searchParams;
  const days = RANGES.find((d) => String(d) === sp.days) ?? 30;
  const a = await analytics(ctx, days);
  const t = a.totals;
  const cur = a.currency;
  const series: DayPoint[] = a.series.map((s) => ({ ...s, label: DateTime.fromISO(s.day).toFormat("d LLL") }));
  const hasActivity = series.some((s) => s.conversations || s.leads);
  const hasBookings = series.some((s) => s.bookedAi || s.bookedOther);
  const aiResolved = t.aiResolutionRate == null ? 0 : Math.round(t.aiResolutionRate * t.aiConversations);
  const handoffs = t.handoffRate == null ? 0 : Math.round(t.handoffRate * t.conversations);
  const converted = t.bookingConversion == null ? 0 : Math.round(t.bookingConversion * t.leads);
  const maxSource = Math.max(1, ...a.sources.map((s) => s.leads));

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`How your front office performed over the last ${days} days (${business.timezone} days). Every number is counted from real conversations, leads and appointments.`}
        actions={
          <nav className="flex gap-1 rounded-md bg-muted p-0.5 text-[13px]" aria-label="Date range">
            {RANGES.map((d) => (
              <Link key={d} href={`/app/analytics?days=${d}`} aria-current={d === days ? "page" : undefined} className={cn("rounded px-3 py-1", d === days ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                {d} days
              </Link>
            ))}
          </nav>
        }
      />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Conversations" value={t.conversations} sub="How many customers reached out" href="/app/inbox" />
        <Stat label="AI resolution rate" value={pct(t.aiResolutionRate)} sub={t.aiConversations ? `${aiResolved} of ${t.aiConversations} AI chats needed no human` : "Handled end-to-end by the AI"} />
        <Stat label="Human handoff rate" value={pct(t.handoffRate)} sub={t.conversations ? `${handoffs} conversations needed your team` : "How often your team was needed"} />
        <Stat label="First response time" value={fmtDuration(t.avgResponseSecs)} sub={t.medianResponseSecs != null ? `Average · median ${fmtDuration(t.medianResponseSecs)}` : "How fast customers got a reply"} />
        <Stat label="Leads" value={t.leads} sub="People who showed buying interest" href="/app/leads" />
        <Stat label="Booking conversion" value={pct(t.bookingConversion)} sub={t.leads ? `${converted} of ${t.leads} leads booked` : "Share of leads that booked"} />
        <Stat label="Appointments booked" value={t.appointments} sub={t.appointments ? `${t.appointmentsAi} by AI · ${t.appointments - t.appointmentsAi} by team/online` : "New bookings in this period"} href="/app/appointments" />
        <Stat
          label="Revenue booked by AI"
          value={formatMoney(t.aiRevenueBookedCents, cur)}
          sub={`${formatMoney(t.aiRevenueCompletedCents, cur)} from completed visits`}
        />
        <Stat label="Follow-ups" value={`${t.followUpsSent} → ${t.followUpsConverted}`} sub="Sent → booked within 7 days" href="/app/automations?queue=sent" />
        <Stat label="Missed opportunities" value={t.missedOpportunities} sub="Interested customers not yet booked (now)" href="/app/opportunities" tone={t.missedOpportunities ? "danger" : "default"} />
      </section>
      <p className="mt-2 text-xs text-muted-foreground">
        Revenue uses the price at booking time for AI-booked appointments that weren&apos;t cancelled; it is not payment data. {t.cancellations} cancellation{t.cancellations === 1 ? "" : "s"} and {t.noShows} no-show{t.noShows === 1 ? "" : "s"} in this period.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Conversations & leads per day" description="Is demand growing, and how much of it turns into leads?" />
          <CardBody>{hasActivity ? <ConversationsLeadsChart data={series} /> : <NotEnough what="Daily conversations and leads" />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Appointments booked per day" description="How much booking work the AI is taking off your team." />
          <CardBody>{hasBookings ? <BookingsChart data={series} /> : <NotEnough what="Daily bookings" />}</CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Leads by source" description="Which channels bring customers who actually book?" />
          {a.sources.length ? (
            <Table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="w-[40%]">Leads</th>
                  <th className="text-right!">Booked</th>
                  <th className="text-right!">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {a.sources.map((s) => (
                  <tr key={s.source}>
                    <td className="font-medium">{SOURCE_LABELS[s.source] ?? s.source}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-sm bg-muted" aria-hidden>
                          <div className="h-2 rounded-r-sm bg-[#2a78d6]" style={{ width: `${(s.leads / maxSource) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right tabular">{s.leads}</span>
                      </div>
                    </td>
                    <td className="text-right tabular">{s.converted}</td>
                    <td className="text-right tabular">{pct(s.leads ? s.converted / s.leads : null)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <NotEnough what="Lead sources" />
          )}
        </Card>
        <Card>
          <CardHeader title="Top services" description="What customers book most, and what it's worth (excludes cancellations)." />
          {a.topServices.length ? (
            <Table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th className="text-right!">Bookings</th>
                  <th className="text-right!">Booked value</th>
                </tr>
              </thead>
              <tbody>
                {a.topServices.map((s) => (
                  <tr key={s.name}>
                    <td className="font-medium">{s.name}</td>
                    <td className="text-right tabular">{s.bookings}</td>
                    <td className="text-right tabular">{formatMoney(s.revenueCents, cur)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <NotEnough what="Top services" />
          )}
        </Card>
      </div>
    </>
  );
}
