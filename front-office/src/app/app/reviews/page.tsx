import Link from "next/link";
import { ArrowRight, Lock, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader, Table } from "@/components/ui/misc";
import { Stat } from "@/components/stat";
import { fmtDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getAiSettings } from "@/server/services/business";
import { listReviews } from "@/server/services/reviews";

export const metadata = { title: "Reviews" };

const STATUS: Record<string, { label: string; tone: "neutral" | "primary" | "success" | "warning" | "info" | "outline" }> = {
  scheduled: { label: "Scheduled", tone: "info" },
  sent: { label: "Sent", tone: "primary" },
  responded: { label: "Responded", tone: "success" },
  skipped: { label: "Skipped", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "outline" },
};

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`} title={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("size-3.5", n <= rating ? "fill-amber-400 text-amber-400" : "text-zinc-300")} aria-hidden />
      ))}
    </span>
  );
}

export default async function ReviewsPage() {
  const { ctx, business } = await requirePermission("business.manage");
  const [rows, settings] = await Promise.all([listReviews(ctx), getAiSettings(ctx)]);
  const tz = business.timezone;
  const sent = rows.filter((r) => r.review.sentAt || r.review.status === "sent" || r.review.status === "responded").length;
  const responded = rows.filter((r) => r.review.status === "responded");
  const rated = responded.filter((r) => r.review.rating != null);
  const avg = rated.length ? rated.reduce((s, r) => s + r.review.rating!, 0) / rated.length : null;
  const positive = responded.filter((r) => r.review.routedTo === "public").length;
  const privateRows = responded.filter((r) => r.review.routedTo === "private");

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Ratings collected after completed appointments. Happy customers are pointed to your public review pages; unhappy ones come privately to you first."
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/automations#reviews">Configure review requests</Link>
          </Button>
        }
      />

      {!settings.reviews.enabled ? (
        <Notice tone="warning" className="mb-6">Review requests are turned off. <Link href="/app/automations#reviews" className="font-medium underline">Turn them on in Automations</Link>.</Notice>
      ) : !settings.reviews.links.length ? (
        <Notice tone="info" className="mb-6">You haven&apos;t added any public review links yet, so positive reviewers only see a thank-you. <Link href="/app/automations#reviews" className="font-medium underline">Add your Google or other review link</Link>.</Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Requests sent" value={sent} sub={`${rows.filter((r) => r.review.status === "scheduled").length} scheduled`} />
        <Stat label="Responses" value={responded.length} sub={sent ? `${Math.round((responded.length / sent) * 100)}% response rate` : "No requests sent yet"} />
        <Stat label="Average rating" value={avg == null ? "—" : `${avg.toFixed(1)}★`} sub={rated.length ? `From ${rated.length} rating${rated.length === 1 ? "" : "s"}` : "No ratings yet"} />
        <Stat
          label="Positive vs private"
          value={`${positive} / ${privateRows.length}`}
          sub={`≥${settings.reviews.positiveThreshold}★ sent to public links · below kept private`}
          tone={privateRows.length ? "danger" : "default"}
        />
      </div>

      {privateRows.length ? (
        <Card className="mt-6 border-warning/30">
          <CardHeader
            className="bg-warning-soft/60"
            title={<span className="flex items-center gap-2"><Lock className="size-3.5 text-warning" /> Private feedback</span>}
            description="These customers rated below your threshold. Their feedback was not sent to any public site — reach out and make it right."
          />
          <ul className="divide-y">
            {privateRows.map(({ review: r, customerName, serviceName }) => (
              <li key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start">
                <div className="w-56 shrink-0">
                  <Link href={`/app/customers/${r.customerId}`} className="text-sm font-medium hover:underline">{customerName ?? "Customer"}</Link>
                  <p className="text-xs text-muted-foreground">{serviceName} · {r.respondedAt ? fmtDateTime(r.respondedAt, tz) : ""}</p>
                  <div className="mt-1"><Stars rating={r.rating} /></div>
                </div>
                <p className="flex-1 whitespace-pre-line text-sm leading-relaxed">{r.feedback ?? <span className="text-muted-foreground">No written comment.</span>}</p>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/app/customers/${r.customerId}`}>Contact <ArrowRight /></Link>
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader title="All review requests" description="Most recent first." />
        {rows.length ? (
          <Table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Service</th>
                <th>Status</th>
                <th>Rating</th>
                <th>Routed</th>
                <th>Feedback</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ review: r, customerName, serviceName }) => {
                const s = STATUS[r.status] ?? { label: r.status, tone: "neutral" as const };
                const when = r.respondedAt ?? r.sentAt ?? r.scheduledFor;
                return (
                  <tr key={r.id}>
                    <td><Link href={`/app/customers/${r.customerId}`} className="font-medium hover:underline">{customerName ?? "Customer"}</Link></td>
                    <td className="text-muted-foreground">{serviceName}</td>
                    <td>
                      <Badge tone={s.tone}>{s.label}</Badge>
                      {(r.status === "skipped" || r.status === "cancelled") && r.statusReason ? <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{r.statusReason}</p> : null}
                    </td>
                    <td><Stars rating={r.rating} /></td>
                    <td>{r.routedTo === "public" ? <Badge tone="success">Public links</Badge> : r.routedTo === "private" ? <Badge tone="warning"><Lock className="size-3" /> Private</Badge> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="max-w-[260px] truncate text-[13px] text-muted-foreground" title={r.feedback ?? undefined}>{r.feedback ?? "—"}</td>
                    <td className="whitespace-nowrap text-[13px] text-muted-foreground">
                      {r.status === "scheduled" ? "Sends " : r.status === "responded" ? "Rated " : r.sentAt ? "Sent " : ""}
                      {fmtDateTime(when, tz)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={<Star />}
            title="No review requests yet"
            description={
              <>
                When an appointment is marked completed, a request is sent {settings.reviews.delayHours} hour{settings.reviews.delayHours === 1 ? "" : "s"} later. Customers who rate {settings.reviews.positiveThreshold}★ or more are shown your public review links; anyone lower is asked what went wrong, and that feedback comes privately to you.
              </>
            }
            action={<Button variant="outline" asChild><Link href="/app/automations#reviews">Review settings</Link></Button>}
          />
        )}
      </Card>
    </>
  );
}
