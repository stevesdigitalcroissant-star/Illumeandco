import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, CalendarDays, Inbox as InboxIcon, Search, Sparkles, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/input";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppointmentStatusBadge, CHANNEL_LABELS, ConversationStatusBadge, HumanRequired, LeadStatusBadge } from "@/components/status";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { requireBusiness } from "@/lib/session";
import { cn } from "@/lib/utils";
import { AppError, roleCan } from "@/server/context";
import { upcomingForCustomer } from "@/server/services/appointments";
import { getConversation, listConversations, listMessages, type ConversationFilters } from "@/server/services/conversations";
import { getCustomer } from "@/server/services/customers";
import { latestLeadForCustomer } from "@/server/services/leads";
import { ConversationActions, ReplyComposer } from "./conversation-actions";

export const metadata = { title: "Inbox" };

const FILTERS = [
  { key: "", label: "All" },
  { key: "needs_human", label: "Needs human" },
  { key: "new", label: "New" },
  { key: "ai_handling", label: "AI handling" },
  { key: "human_handling", label: "Human handling" },
  { key: "waiting", label: "Waiting" },
  { key: "resolved", label: "Resolved" },
] as const;

type SP = { c?: string; status?: string; q?: string; channel?: string };

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { ctx, business, role, user } = await requireBusiness();
  const tz = business.timezone;
  const filters: ConversationFilters = {
    status: (FILTERS.some((f) => f.key === sp.status) && sp.status ? sp.status : undefined) as ConversationFilters["status"],
    channel: sp.channel && sp.channel in CHANNEL_LABELS ? (sp.channel as ConversationFilters["channel"]) : undefined,
    search: sp.q,
  };
  const list = await listConversations(ctx, filters);
  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/app/inbox${p.size ? `?${p}` : ""}`;
  };

  let selected: Awaited<ReturnType<typeof loadConversation>> | null = null;
  if (sp.c) {
    try {
      selected = await loadConversation(ctx, sp.c);
    } catch (e) {
      if (e instanceof AppError && e.code === "not_found") notFound();
      throw e;
    }
  }

  return (
    <>
      <AutoRefresh ms={5000} />
      <PageHeader title="Inbox" description="Every customer conversation, across every channel — handled by your AI receptionist and your team." />
      <Card className="grid min-h-[70vh] overflow-hidden lg:grid-cols-[340px_1fr] xl:grid-cols-[340px_1fr_280px]">
        {/* ── List ─────────────────────────────────────────── */}
        <div className={cn("flex min-h-0 flex-col border-r", selected && "hidden lg:flex")}>
          <form action="/app/inbox" className="space-y-2 border-b p-3">
            {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
            <div className="flex items-center gap-2 rounded-md border px-2.5">
              <Search className="size-4 text-muted-foreground" />
              <input name="q" defaultValue={sp.q} placeholder="Search name, phone, message…" className="h-8 flex-1 bg-transparent text-sm outline-none" />
            </div>
            <NativeSelect name="channel" defaultValue={sp.channel ?? ""} className="h-8 text-[13px]" aria-label="Channel">
              <option value="">All channels</option>
              {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </NativeSelect>
            <button type="submit" className="sr-only">Search</button>
          </form>
          <div className="flex gap-1 overflow-x-auto border-b px-3 py-2">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={href({ status: f.key || undefined, c: undefined })}
                className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-xs", (sp.status ?? "") === f.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <ul className="flex-1 overflow-y-auto">
            {list.length ? (
              list.map((c) => {
                const name = c.customer.name ?? c.customer.email ?? c.customer.phone ?? "Website visitor";
                return (
                  <li key={c.conversation.id}>
                    <Link
                      href={href({ c: c.conversation.id })}
                      className={cn("flex gap-3 border-b px-4 py-3 hover:bg-surface", sp.c === c.conversation.id && "bg-muted/70")}
                    >
                      <Avatar name={c.customer.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{name}</span>
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{fmtRelative(c.conversation.lastMessageAt ?? c.conversation.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{c.conversation.lastMessagePreview ?? "—"}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {c.needsHuman ? <HumanRequired /> : <ConversationStatusBadge status={c.conversation.status} />}
                          {!["ai_handling", "human_handling"].includes(c.conversation.status) && !c.needsHuman ? (
                            <Badge tone="outline">{c.conversation.owner === "ai" ? "AI" : "Human"}</Badge>
                          ) : null}
                          <span className="text-[11px] text-muted-foreground">{CHANNEL_LABELS[c.conversation.channel]}</span>
                          {c.leadStatus ? <LeadStatusBadge status={c.leadStatus} /> : null}
                          {c.nextAppointment ? <Badge tone="success"><CalendarDays className="size-3" /> Booked</Badge> : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })
            ) : (
              <EmptyState icon={<InboxIcon />} title="No conversations" description={sp.q || sp.status ? "Nothing matches these filters." : "When customers message you, conversations appear here."} />
            )}
          </ul>
        </div>

        {/* ── Conversation ─────────────────────────────────── */}
        {selected ? (
          <>
            <div className="flex min-h-0 flex-col">
              <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
                <Link href={href({ c: undefined })} className="text-sm text-muted-foreground lg:hidden">← Back</Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-[15px] font-semibold">{selected.customerName}</h2>
                    {selected.needsHuman ? <HumanRequired /> : ["ai_handling", "human_handling"].includes(selected.conversation.status) ? null : <ConversationStatusBadge status={selected.conversation.status} />}
                    <Badge tone={selected.conversation.owner === "ai" ? "primary" : "warning"}>
                      {selected.conversation.owner === "ai" ? <><Bot className="size-3" /> AI handling</> : <><UserRound className="size-3" /> Human handling</>}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {CHANNEL_LABELS[selected.conversation.channel]} · started {fmtDateTime(selected.conversation.createdAt, tz)}
                    {selected.conversation.handoffReason && selected.conversation.owner === "human" ? ` · Handoff: ${selected.conversation.handoffReason}` : ""}
                  </p>
                </div>
                {roleCan(role, "conversations.reply") ? (
                  <ConversationActions
                    id={selected.conversation.id}
                    owner={selected.conversation.owner}
                    status={selected.conversation.status}
                    assignedToMe={selected.conversation.assignedUserId === user.id}
                    canAssign={roleCan(role, "conversations.view_all")}
                  />
                ) : null}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto bg-surface px-5 py-5">
                {selected.messages.map((m) =>
                  m.role === "system" ? (
                    <div key={m.id} className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      <Sparkles className="size-3 text-primary" />
                      <span className="max-w-[70%] text-center">{m.content}</span>
                      <span className="tabular">{fmtDateTime(m.createdAt, tz, "h:mm a")}</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  ) : (
                    <div key={m.id} className={cn("flex", m.role === "customer" ? "justify-start" : "justify-end")}>
                      <div className="max-w-[75%]">
                        <div
                          className={cn(
                            "whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                            m.role === "customer" && "rounded-bl-md border bg-background",
                            m.role === "ai" && "rounded-br-md bg-primary-soft text-foreground",
                            m.role === "human" && "rounded-br-md bg-foreground text-background",
                          )}
                        >
                          {m.content}
                        </div>
                        <p className={cn("mt-1 text-[11px] text-muted-foreground", m.role !== "customer" && "text-right")}>
                          {m.role === "ai" ? "AI receptionist" : m.role === "human" ? "Team" : "Customer"} · {fmtDateTime(m.createdAt, tz, "d LLL, h:mm a")}
                          {m.role !== "customer" && m.deliveryStatus && !["posted_to_chat", "delivered"].includes(m.deliveryStatus) ? ` · ${m.deliveryStatus.replaceAll("_", " ")}` : ""}
                        </p>
                      </div>
                    </div>
                  ),
                )}
              </div>
              {roleCan(role, "conversations.reply") ? (
                <ReplyComposer id={selected.conversation.id} aiOwned={selected.conversation.owner === "ai"} channelLabel={CHANNEL_LABELS[selected.conversation.channel] ?? "chat"} />
              ) : null}
            </div>

            {/* ── Customer context ───────────────────────────── */}
            <aside className="hidden space-y-5 border-l p-5 xl:block">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Customer</p>
                <p className="mt-1 text-sm font-medium">{selected.customerName}</p>
                <dl className="mt-2 space-y-1 text-[13px]">
                  <div className="text-muted-foreground">{selected.customer.phone ?? "No phone"}</div>
                  <div className="text-muted-foreground">{selected.customer.email ?? "No email"}</div>
                </dl>
                <Link href={`/app/customers/${selected.customer.id}`} className="mt-2 inline-block text-[13px] font-medium text-primary">View profile →</Link>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Lead</p>
                <div className="mt-1.5"><LeadStatusBadge status={selected.lead?.status ?? null} /></div>
                {selected.lead?.serviceInterest ? <p className="mt-1.5 text-[13px]">Interested in {selected.lead.serviceInterest}</p> : null}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Upcoming appointments</p>
                {selected.upcoming.length ? (
                  <ul className="mt-1.5 space-y-2">
                    {selected.upcoming.map((a) => (
                      <li key={a.appointment.id} className="rounded-md border px-3 py-2 text-[13px]">
                        <p className="font-medium">{a.service.name}</p>
                        <p className="text-muted-foreground">{fmtDateTime(a.appointment.startsAt, tz)} · {a.staff.name}</p>
                        <div className="mt-1"><AppointmentStatusBadge status={a.appointment.status} /></div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-[13px] text-muted-foreground">None</p>
                )}
              </div>
              {selected.customer.memory.facts.length ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">AI memory</p>
                  <ul className="mt-1.5 space-y-1 text-[13px]">
                    {selected.customer.memory.facts.map((f) => (
                      <li key={f.key}><span className="text-muted-foreground">{f.key}:</span> {f.value}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
          </>
        ) : (
          <div className="hidden items-center justify-center lg:flex xl:col-span-2">
            <EmptyState icon={<InboxIcon />} title="Select a conversation" description="Pick a conversation to read it, take over from the AI, or reply." />
          </div>
        )}
      </Card>
    </>
  );
}

async function loadConversation(ctx: Parameters<typeof getConversation>[0], id: string) {
  const conversation = await getConversation(ctx, id);
  const [messages, customer, lead, upcoming] = await Promise.all([
    listMessages(ctx, id),
    getCustomer({ ...ctx, actor: { type: "system", name: "Inbox" } }, conversation.customerId),
    latestLeadForCustomer(ctx, conversation.customerId),
    upcomingForCustomer(ctx, conversation.customerId),
  ]);
  return {
    conversation,
    messages,
    customer,
    lead,
    upcoming,
    customerName: customer.name ?? customer.email ?? customer.phone ?? "Website visitor",
    needsHuman: conversation.owner === "human" && !!conversation.handoffRequestedAt && !conversation.assignedUserId,
  };
}
