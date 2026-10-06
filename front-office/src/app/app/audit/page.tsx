import Link from "next/link";
import { Bot, ChevronLeft, ChevronRight, ScrollText, Search, User, Cog, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState, PageHeader, Table } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import {
  ACTOR_TYPES,
  AUDIT_CATEGORIES,
  listAiToolCalls,
  listAuditLogs,
  type AuditActorType,
  type AuditCategory,
} from "@/server/services/audit-log";

export const metadata = { title: "Audit log" };

type SP = { tab?: string; actor?: string; category?: string; q?: string; page?: string; status?: string };

const ACTOR_LABELS: Record<AuditActorType, string> = { ai: "AI", user: "Team", system: "System", customer: "Customer" };

function entityHref(type: string | null, id: string | null) {
  if (!type || !id) return null;
  switch (type) {
    case "appointment":
      return `/app/appointments`;
    case "conversation":
      return `/app/inbox?c=${id}`;
    case "customer":
      return `/app/customers/${id}`;
    case "lead":
      return `/app/leads`;
    case "knowledge_source":
      return `/app/knowledge`;
    case "review":
      return `/app/reviews`;
    case "follow_up":
      return `/app/automations?queue=sent`;
    case "service":
    case "staff":
    case "business":
    case "blackout":
    case "member":
      return `/app/settings`;
    case "ai_settings":
      return `/app/automations`;
    default:
      return null;
  }
}

function qs(base: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, String(v));
  const s = p.toString();
  return `/app/audit${s ? `?${s}` : ""}`;
}

function ActorCell({ type, label }: { type: string; label: string }) {
  if (type === "ai")
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary-soft text-primary"><Bot className="size-3.5" /></span>
        <span className="text-[13px] font-medium">AI Receptionist</span>
      </span>
    );
  const Icon = type === "user" ? User : type === "customer" ? MessageCircle : Cog;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="size-3.5" /></span>
      <span className="text-[13px]">{label}</span>
      {type !== "user" && label !== ACTOR_LABELS[type as AuditActorType] ? <span className="text-xs text-muted-foreground">({ACTOR_LABELS[type as AuditActorType] ?? type})</span> : null}
    </span>
  );
}

function Json({ value }: { value: unknown }) {
  return <pre className="max-h-80 overflow-auto rounded-md border bg-surface p-3 font-mono text-[11.5px] leading-relaxed">{JSON.stringify(value, null, 2)}</pre>;
}

function Pager({ sp, page, total, pageSize }: { sp: SP; page: number; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t px-5 py-3 text-[13px] text-muted-foreground">
      <span>
        {total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString()}` : "0 entries"}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" asChild={page > 1} disabled={page <= 1}>
          {page > 1 ? <Link href={qs(sp, { page: String(page - 1) })} aria-label="Previous page"><ChevronLeft /></Link> : <span><ChevronLeft /></span>}
        </Button>
        <Button variant="outline" size="sm" asChild={page < pages} disabled={page >= pages}>
          {page < pages ? <Link href={qs(sp, { page: String(page + 1) })} aria-label="Next page"><ChevronRight /></Link> : <span><ChevronRight /></span>}
        </Button>
      </div>
    </div>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx, business } = await requirePermission("audit.view");
  const sp = await searchParams;
  const tz = business.timezone;
  const tab = sp.tab === "tools" ? "tools" : "log";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  return (
    <>
      <PageHeader title="Audit log" description="Every important action in your front office — by the AI, your team, customers and the system — with the details behind it." />

      <nav className="mb-5 flex gap-1 border-b" aria-label="Audit views">
        {[
          { key: "log", label: "Activity" },
          { key: "tools", label: "AI tool calls" },
        ].map((t) => (
          <Link key={t.key} href={t.key === "log" ? "/app/audit" : "/app/audit?tab=tools"} className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "log" ? <ActivityTab sp={sp} page={page} tz={tz} ctx={ctx} /> : <ToolsTab sp={sp} page={page} tz={tz} ctx={ctx} />}
    </>
  );
}

type Ctx = Awaited<ReturnType<typeof requirePermission>>["ctx"];

async function ActivityTab({ sp, page, tz, ctx }: { sp: SP; page: number; tz: string; ctx: Ctx }) {
  const actor = ACTOR_TYPES.includes(sp.actor as AuditActorType) ? (sp.actor as AuditActorType) : undefined;
  const category = sp.category && sp.category in AUDIT_CATEGORIES ? (sp.category as AuditCategory) : undefined;
  const q = sp.q?.trim() || undefined;
  const { rows, total, pageSize } = await listAuditLogs(ctx, { actorType: actor, category, q, page });
  const base: SP = { actor, category, q };

  return (
    <Card>
      <form className="flex flex-wrap items-center gap-2 border-b px-5 py-3" action="/app/audit">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search summaries, people, actions…" className="pl-9" aria-label="Search" />
        </div>
        <NativeSelect name="actor" defaultValue={actor ?? ""} className="w-40" aria-label="Actor">
          <option value="">All actors</option>
          {ACTOR_TYPES.map((a) => <option key={a} value={a}>{ACTOR_LABELS[a]}</option>)}
        </NativeSelect>
        <NativeSelect name="category" defaultValue={category ?? ""} className="w-48" aria-label="Category">
          <option value="">All categories</option>
          {Object.entries(AUDIT_CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
        </NativeSelect>
        <Button type="submit" variant="outline">Filter</Button>
        {actor || category || q ? <Button variant="ghost" asChild><Link href="/app/audit">Clear</Link></Button> : null}
      </form>
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>What happened</th>
              <th>Related</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const href = entityHref(r.entityType, r.entityId);
              const hasDetails = r.details && Object.keys(r.details).length > 0;
              return (
                <tr key={r.id} className={cn(r.action === "ai.action_denied" && "bg-warning-soft/40")}>
                  <td className="whitespace-nowrap align-top text-[13px] text-muted-foreground tabular" title={r.createdAt.toISOString()}>{fmtDateTime(r.createdAt, tz, "d LLL yyyy, HH:mm:ss")}</td>
                  <td className="whitespace-nowrap align-top"><ActorCell type={r.actorType} label={r.actorLabel} /></td>
                  <td className="align-top">
                    <p className="text-[13px] leading-snug">{r.summary}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                      {r.action}
                      {r.action === "ai.action_denied" ? <Badge tone="warning">Denied</Badge> : null}
                    </p>
                    {hasDetails ? (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Details</summary>
                        <div className="mt-2"><Json value={r.details} /></div>
                      </details>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap align-top text-[13px]">
                    {href ? <Link href={href} className="text-primary hover:underline">{r.entityType?.replace(/_/g, " ")}</Link> : <span className="text-muted-foreground">{r.entityType?.replace(/_/g, " ") ?? "—"}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<ScrollText />} title={actor || category || q ? "No entries match these filters" : "Nothing logged yet"} description={actor || category || q ? "Try a broader search or clear the filters." : "Bookings, handoffs, messages and setting changes will be recorded here."} />
      )}
      <Pager sp={base} page={page} total={total} pageSize={pageSize} />
    </Card>
  );
}

async function ToolsTab({ sp, page, tz, ctx }: { sp: SP; page: number; tz: string; ctx: Ctx }) {
  const status = (["success", "error", "denied"] as const).find((s) => s === sp.status);
  const q = sp.q?.trim() || undefined;
  const { rows, total, pageSize } = await listAiToolCalls(ctx, { status, q, page });
  const base: SP = { tab: "tools", status, q };
  const tone = { success: "success", error: "danger", denied: "warning" } as const;

  return (
    <Card>
      <form className="flex flex-wrap items-center gap-2 border-b px-5 py-3" action="/app/audit">
        <input type="hidden" name="tab" value="tools" />
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Tool name, e.g. book_appointment" className="pl-9" aria-label="Search tools" />
        </div>
        <NativeSelect name="status" defaultValue={status ?? ""} className="w-40" aria-label="Status">
          <option value="">All results</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="denied">Denied</option>
        </NativeSelect>
        <Button type="submit" variant="outline">Filter</Button>
        {status || q ? <Button variant="ghost" asChild><Link href="/app/audit?tab=tools">Clear</Link></Button> : null}
      </form>
      <p className="border-b bg-surface px-5 py-2.5 text-xs text-muted-foreground">
        Every tool the AI receptionist tried to use, including calls blocked by your AI permissions (&ldquo;denied&rdquo;).
      </p>
      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>Tool</th>
              <th>Result</th>
              <th className="text-right!">Duration</th>
              <th>Conversation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap align-top text-[13px] text-muted-foreground tabular">{fmtDateTime(r.createdAt, tz, "d LLL yyyy, HH:mm:ss")}</td>
                <td className="align-top">
                  <code className="text-[13px] font-medium">{r.tool}</code>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Input &amp; output</summary>
                    <div className="mt-2 grid gap-2 lg:grid-cols-2">
                      <div><p className="mb-1 text-xs font-medium text-muted-foreground">Input</p><Json value={r.input} /></div>
                      <div><p className="mb-1 text-xs font-medium text-muted-foreground">Output</p><Json value={r.output ?? null} /></div>
                    </div>
                  </details>
                </td>
                <td className="align-top"><Badge tone={tone[r.status]}>{r.status[0]!.toUpperCase() + r.status.slice(1)}</Badge></td>
                <td className="text-right align-top text-[13px] tabular">{r.durationMs != null ? `${r.durationMs} ms` : "—"}</td>
                <td className="align-top text-[13px]">{r.conversationId ? <Link href={`/app/inbox?c=${r.conversationId}`} className="text-primary hover:underline">Open</Link> : <span className="text-muted-foreground">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<Bot />} title={status || q ? "No tool calls match" : "No AI tool calls yet"} description="When the AI looks up services, checks availability or books appointments, each call is recorded here." />
      )}
      <Pager sp={base} page={page} total={total} pageSize={pageSize} />
    </Card>
  );
}
