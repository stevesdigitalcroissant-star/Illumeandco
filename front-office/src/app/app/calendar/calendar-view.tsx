"use client";
import Link from "next/link";
import { useState } from "react";
import { Bot, CalendarOff, ExternalLink, StickyNote, UserRound, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AppointmentStatusBadge } from "@/components/status";
import { cn } from "@/lib/utils";
import { AppointmentActions } from "../appointments/appointment-actions";
import type { StaffOption } from "../appointments/slot-picker";

export type CalDay = {
  iso: string;
  weekday: string;
  dayNum: string;
  longLabel: string;
  isToday: boolean;
  open: [number, number][];
  blackout: string | null;
  staffOff: string[];
};

export type CalAppt = {
  id: string;
  day: number;
  startMin: number;
  endMin: number;
  timeLabel: string;
  startLabel: string;
  dateLabel: string;
  startsAt: string;
  started: boolean;
  status: string;
  source: string;
  customerId: string;
  customerName: string;
  customerContact: string | null;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  notes: string | null;
};

const HOUR_PX = 52;
const HATCH: React.CSSProperties = {
  backgroundImage: "repeating-linear-gradient(135deg, var(--color-muted) 0 6px, transparent 6px 12px)",
};

const STATUS_STYLE: Record<string, string> = {
  booked: "border-l-primary bg-primary-soft text-foreground hover:bg-primary-soft/70",
  confirmed: "border-l-primary bg-primary-soft text-foreground ring-1 ring-inset ring-primary/20",
  completed: "border-l-success bg-success-soft text-foreground/80",
  no_show: "border-l-danger bg-danger-soft text-foreground/70 line-through decoration-danger/40",
};

/** Assign side-by-side lanes to overlapping appointments within one day. */
function layout(items: CalAppt[]) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out: { appt: CalAppt; lane: number; lanes: number }[] = [];
  let cluster: { appt: CalAppt; lane: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) out.push({ ...c, lanes });
    cluster = [];
  };
  for (const a of sorted) {
    if (a.startMin >= clusterEnd && cluster.length) flush();
    const taken = new Set(cluster.filter((c) => c.appt.endMin > a.startMin).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    cluster.push({ appt: a, lane });
    clusterEnd = Math.max(clusterEnd, a.endMin);
  }
  if (cluster.length) flush();
  return out;
}

const fmtHour = (min: number) => {
  const h = Math.floor(min / 60);
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 || h === 24 ? "AM" : "PM"}`;
};

export function CalendarView({
  days,
  appts,
  startMin,
  endMin,
  now,
  timezone,
  maxAdvanceDays,
  staffFor,
}: {
  days: CalDay[];
  appts: CalAppt[];
  startMin: number;
  endMin: number;
  now: { day: number; min: number } | null;
  timezone: string;
  maxAdvanceDays: number;
  staffFor: Record<string, StaffOption[]>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = appts.find((a) => a.id === selectedId) ?? null;
  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60);
  const height = ((endMin - startMin) / 60) * HOUR_PX;
  const y = (min: number) => ((min - startMin) / 60) * HOUR_PX;

  return (
    <>
      {/* Week grid (md and up) */}
      <div className="hidden overflow-hidden rounded-lg border bg-background md:block">
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b">
          <div />
          {days.map((d) => (
            <div key={d.iso} className={cn("border-l px-2 py-2.5 text-center", d.isToday && "bg-primary-soft/60")}>
              <p className={cn("text-[11px] font-medium uppercase tracking-wide", d.isToday ? "text-primary" : "text-muted-foreground")}>{d.weekday}</p>
              <p className={cn("mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular", d.isToday && "bg-primary text-primary-foreground")}>
                {d.dayNum}
              </p>
              {d.staffOff.length ? (
                <p className="mt-1 truncate text-[10.5px] text-warning" title={d.staffOff.join(", ")}>
                  {d.staffOff.join(", ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <div className="max-h-[calc(100vh-230px)] min-h-[420px] overflow-y-auto">
          <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height }}>
            <div className="relative">
              {hours.map((h) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] text-muted-foreground tabular" style={{ top: y(h) }}>
                  {h === startMin ? "" : fmtHour(h)}
                </span>
              ))}
            </div>
            {days.map((d, di) => {
              const closed = !d.open.length || !!d.blackout;
              return (
                <div key={d.iso} className="relative border-l" style={closed ? HATCH : undefined}>
                  {/* Out-of-hours shading */}
                  {!closed
                    ? outside(d.open, startMin, endMin).map(([s, e]) => (
                        <div key={`${s}-${e}`} className="absolute inset-x-0 bg-muted/60" style={{ top: y(s), height: y(e) - y(s) }} />
                      ))
                    : null}
                  {hours.map((h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: y(h) }} />
                  ))}
                  {closed ? (
                    <div className="absolute inset-x-0 top-3 flex flex-col items-center gap-1 px-2 text-center text-[11px] text-muted-foreground">
                      <CalendarOff className="size-3.5" />
                      {d.blackout ?? "Closed"}
                    </div>
                  ) : null}
                  {now && now.day === di && now.min >= startMin && now.min <= endMin ? (
                    <div className="absolute inset-x-0 z-20 flex items-center" style={{ top: y(now.min) }}>
                      <span className="-ml-1 size-2 rounded-full bg-danger" />
                      <span className="h-px flex-1 bg-danger" />
                    </div>
                  ) : null}
                  {layout(appts.filter((a) => a.day === di)).map(({ appt: a, lane, lanes }) => {
                    const h = Math.max(y(a.endMin) - y(a.startMin) - 2, 20);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelectedId(a.id)}
                        className={cn(
                          "absolute z-10 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11.5px] leading-tight shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          STATUS_STYLE[a.status] ?? STATUS_STYLE.booked,
                        )}
                        style={{ top: y(a.startMin) + 1, height: h, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                        title={`${a.timeLabel} · ${a.customerName} · ${a.serviceName} · ${a.staffName}`}
                      >
                        <span className="flex items-center gap-1 font-semibold">
                          <span className="truncate">{a.customerName}</span>
                          {a.source === "ai" ? <Bot className="size-3 shrink-0 text-primary" aria-label="Booked by AI" /> : null}
                        </span>
                        {h > 30 ? <span className="block truncate text-foreground/70">{a.serviceName}</span> : null}
                        {h > 44 ? <span className="block truncate text-muted-foreground">{a.staffName} · {a.timeLabel}</span> : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day list (mobile) */}
      <div className="space-y-3 md:hidden">
        {days.map((d, di) => {
          const items = appts.filter((a) => a.day === di).sort((a, b) => a.startMin - b.startMin);
          const closed = !d.open.length || !!d.blackout;
          return (
            <section key={d.iso} className={cn("overflow-hidden rounded-lg border bg-background", d.isToday && "border-primary/40")}>
              <header className={cn("flex items-center justify-between px-4 py-2.5", d.isToday && "bg-primary-soft/60")}>
                <p className="text-sm font-semibold">
                  {d.longLabel}
                  {d.isToday ? <span className="ml-2 text-xs font-medium text-primary">Today</span> : null}
                </p>
                {closed ? <Badge tone="outline">{d.blackout ?? "Closed"}</Badge> : null}
              </header>
              {d.staffOff.length ? <p className="px-4 pb-2 text-xs text-warning">{d.staffOff.join(", ")}</p> : null}
              {items.length ? (
                <ul>
                  {items.map((a) => (
                    <li key={a.id} className="border-t">
                      <button type="button" onClick={() => setSelectedId(a.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface">
                        <span className={cn("h-9 w-1 shrink-0 rounded-full", a.status === "completed" ? "bg-success" : a.status === "no_show" ? "bg-danger" : "bg-primary")} />
                        <span className="w-20 shrink-0 text-[13px] font-medium tabular">{a.startLabel}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 truncate text-sm">
                            {a.customerName}
                            {a.source === "ai" ? <Bot className="size-3 shrink-0 text-primary" /> : null}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.serviceName} · {a.staffName}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : !closed ? (
                <p className="border-t px-4 py-3 text-[13px] text-muted-foreground">No appointments</p>
              ) : null}
            </section>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legend className="border-l-primary bg-primary-soft">Booked / confirmed</Legend>
        <Legend className="border-l-success bg-success-soft">Completed</Legend>
        <Legend className="border-l-danger bg-danger-soft">No-show</Legend>
        <span className="inline-flex items-center gap-1.5">
          <Bot className="size-3 text-primary" /> Booked by AI
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3.5 border bg-muted" /> Outside opening hours
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3.5 border" style={HATCH} /> Closed / blackout
        </span>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        {selected ? (
          <DialogContent title={selected.serviceName} description={`${selected.dateLabel} · ${selected.timeLabel}`}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <AppointmentStatusBadge status={selected.status} />
                {selected.source === "ai" ? (
                  <Badge tone="primary">
                    <Bot className="size-3" /> Booked by AI
                  </Badge>
                ) : (
                  <Badge tone="outline" className="capitalize">
                    {selected.source.replace("_", " ")}
                  </Badge>
                )}
              </div>
              <dl className="space-y-2.5 text-sm">
                <Row icon={<UserRound />} label="Customer">
                  <Link href={`/app/customers/${selected.customerId}`} className="font-medium hover:underline">
                    {selected.customerName}
                  </Link>
                  {selected.customerContact ? <span className="block text-xs text-muted-foreground">{selected.customerContact}</span> : null}
                </Row>
                <Row icon={<Users />} label="Staff">
                  {selected.staffName}
                </Row>
                {selected.notes ? (
                  <Row icon={<StickyNote />} label="Notes">
                    <span className="whitespace-pre-line">{selected.notes}</span>
                  </Row>
                ) : null}
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
                <Button asChild variant="link" size="sm">
                  <Link href="/app/appointments">
                    All appointments <ExternalLink className="size-3.5" />
                  </Link>
                </Button>
                <AppointmentActions
                  appt={{
                    id: selected.id,
                    status: selected.status,
                    startsAt: selected.startsAt,
                    started: selected.started,
                    serviceId: selected.serviceId,
                    serviceName: selected.serviceName,
                    staffId: selected.staffId,
                    staffName: selected.staffName,
                    customerName: selected.customerName,
                  }}
                  timezone={timezone}
                  staffOptions={staffFor[selected.serviceId] ?? []}
                  maxAdvanceDays={maxAdvanceDays}
                />
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

function outside(open: [number, number][], start: number, end: number): [number, number][] {
  const sorted = [...open].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cur = start;
  for (const [s, e] of sorted) {
    if (s > cur) out.push([cur, Math.min(s, end)]);
    cur = Math.max(cur, e);
  }
  if (cur < end) out.push([cur, end]);
  return out.filter(([s, e]) => e > s);
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <dt className="sr-only">{label}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3.5 border-l-[3px]", className)} /> {children}
    </span>
  );
}
