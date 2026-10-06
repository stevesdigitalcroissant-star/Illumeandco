import Link from "next/link";
import { DateTime } from "luxon";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Table } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { listChannels } from "@/server/channels/registry";
import { getAiSettings } from "@/server/services/business";
import { listServices } from "@/server/services/catalog";
import { listFollowUps } from "@/server/services/followups";
import { ChannelBadge, FollowUpCard, MissedCard, RemindersCard, ReviewsCard, RunNowButton } from "./automations-client";

export const metadata = { title: "Automations" };

const QUEUE_TABS = [
  { key: "scheduled", label: "Upcoming" },
  { key: "sent", label: "Sent" },
  { key: "cancelled", label: "Stopped" },
  { key: "failed", label: "Failed" },
] as const;
type QueueKey = (typeof QUEUE_TABS)[number]["key"];

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<{ queue?: string }> }) {
  const { ctx, business } = await requirePermission("business.manage");
  const sp = await searchParams;
  const queue: QueueKey = QUEUE_TABS.some((t) => t.key === sp.queue) ? (sp.queue as QueueKey) : "scheduled";
  const [settings, services, followUps] = await Promise.all([
    getAiSettings(ctx),
    listServices(ctx),
    listFollowUps(ctx, { status: queue, limit: 50 }),
  ]);
  const channels = listChannels();
  const direct = channels.filter((c) => ["whatsapp", "sms", "email"].includes(c.kind));
  const anyDirect = direct.some((c) => c.configured);
  const tz = business.timezone;
  const when = DateTime.now().setZone(tz).plus({ days: 1 }).set({ hour: 10, minute: 30 });
  const sample = {
    customer_name: "Sara",
    service: services[0]?.name ?? "Consultation",
    business: business.name,
    date: when.toFormat("cccc d LLLL"),
    time: when.toFormat("h:mm a"),
    review_link: `${process.env.APP_URL ?? "http://localhost:3000"}/r/example`,
  };
  const rows = queue === "scheduled" ? [...followUps].reverse() : followUps;

  return (
    <>
      <PageHeader
        title="Automations"
        description="Follow-ups, reminders and review requests your AI receptionist sends on its own — within the rules you set here."
        actions={<RunNowButton />}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <FollowUpCard initial={settings.followUp} sample={sample} />
          <RemindersCard initial={settings.reminders} sample={sample} />
          <ReviewsCard initial={settings.reviews} sample={sample} />
          <MissedCard initial={settings.missedOpportunities} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Delivery channels" description="How automated messages reach customers." />
            <ul className="divide-y">
              {channels.map((c) => {
                const status = c.kind === "web_chat" ? "active" : c.kind === "instagram" || c.kind === "voice" ? "na" : c.configured ? "active" : "config";
                return (
                  <li key={c.kind} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{c.label}</span>
                      <ChannelBadge status={status} />
                    </div>
                    {status === "config" ? <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p> : null}
                  </li>
                );
              })}
            </ul>
            <div className="border-t bg-surface px-5 py-3.5 text-[13px] leading-relaxed text-muted-foreground">
              Reminders, follow-ups and review requests go out by WhatsApp, then SMS, then email — whichever is configured and reaches the customer.
              {anyDirect ? " " : " None is configured yet, so "}
              {anyDirect ? "Otherwise" : ""} they&apos;re posted into the customer&apos;s website chat thread, which they see next time they open the chat. Customers with no reachable channel are skipped, and the reason is shown below.
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Follow-up queue"
          description="Every follow-up the AI scheduled, and why any were stopped."
          action={
            <nav className="flex gap-1 rounded-md bg-muted p-0.5 text-[13px]" aria-label="Queue">
              {QUEUE_TABS.map((t) => (
                <Link key={t.key} href={`/app/automations?queue=${t.key}#queue`} scroll={false} className={t.key === queue ? "rounded bg-background px-2.5 py-1 font-medium shadow-sm" : "px-2.5 py-1 text-muted-foreground hover:text-foreground"}>
                  {t.label}
                </Link>
              ))}
            </nav>
          }
        />
        <div id="queue">
          {rows.length ? (
            <Table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Attempt</th>
                  <th>Reason</th>
                  <th>{queue === "scheduled" ? "Scheduled for" : queue === "sent" ? "Sent" : "Was scheduled for"}</th>
                  <th>{queue === "scheduled" ? "Created by" : "Result"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ followUp: f, customerName }) => (
                  <tr key={f.id}>
                    <td>
                      <Link href={`/app/customers/${f.customerId}`} className="font-medium hover:underline">{customerName ?? "Website visitor"}</Link>
                    </td>
                    <td className="tabular">#{f.attempt}</td>
                    <td className="max-w-[320px] text-[13px] text-muted-foreground">{f.reason ?? "—"}</td>
                    <td className="whitespace-nowrap text-[13px]">{fmtDateTime(queue === "sent" && f.sentAt ? f.sentAt : f.scheduledFor, tz)}</td>
                    <td className="text-[13px]">
                      {queue === "scheduled" ? (
                        <Badge tone={f.createdBy === "ai" ? "primary" : "neutral"}>{f.createdBy === "ai" ? "AI" : f.createdBy === "user" ? "Team" : "System"}</Badge>
                      ) : (
                        <span className={queue === "failed" ? "text-danger" : "text-muted-foreground"}>{prettyReason(f.statusReason)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              icon={<Clock />}
              title={queue === "scheduled" ? "Nothing queued" : queue === "sent" ? "No follow-ups sent yet" : queue === "failed" ? "No failed follow-ups" : "No stopped follow-ups"}
              description={queue === "scheduled" ? "When a customer asks about a service without booking, the AI queues a follow-up here." : undefined}
            />
          )}
        </div>
      </Card>
    </>
  );
}

function prettyReason(r: string | null) {
  if (!r) return "—";
  const m = /^(web_chat|whatsapp|sms|email): (\w+)$/.exec(r);
  if (!m) return r;
  const ch = { web_chat: "website chat", whatsapp: "WhatsApp", sms: "SMS", email: "email" }[m[1] as "sms"];
  const st = { posted_to_chat: "posted to chat thread", delivered: "delivered", queued: "queued with provider" }[m[2] as "queued"] ?? m[2];
  return `Via ${ch} · ${st}`;
}
