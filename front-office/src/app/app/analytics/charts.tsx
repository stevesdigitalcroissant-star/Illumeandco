"use client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/*
 * Palette: validated categorical slots 1–2 (blue, orange) against the white
 * surface — CVD ΔE 24.7, normal ΔE 33.6, both ≥3:1. Text never wears series color.
 */
const SERIES_1 = "#2a78d6";
const SERIES_2 = "#eb6834";
const GRID = "#e4e4e7";
const AXIS_TEXT = "#71717a";
const SURFACE = "#ffffff";

export type DayPoint = { day: string; label: string; conversations: number; leads: number; bookedAi: number; bookedOther: number };

type TooltipRow = { name: string; value: number; color: string };
function ChartTooltip({ active, label, rows }: { active?: boolean; label?: string; rows: TooltipRow[] }) {
  if (!active) return null;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-muted-foreground">{label}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2 py-0.5">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} aria-hidden />
          <b className="tabular text-foreground">{r.value}</b>
          <span className="text-muted-foreground">{r.name}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items, kind }: { items: { name: string; color: string }[]; kind: "line" | "rect" }) {
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-1.5">
          <span aria-hidden className={kind === "line" ? "inline-block h-0.5 w-3.5 rounded" : "inline-block size-2.5 rounded-sm"} style={{ background: i.color }} />
          {i.name}
        </li>
      ))}
    </ul>
  );
}

function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View as table</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded border">
        <table className="w-full tabular">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface">
            <tr>{head.map((h) => <th key={h} className="px-3 py-1.5 text-left font-medium text-muted-foreground">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">{r.map((c, j) => <td key={j} className="px-3 py-1">{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const axisProps = { tick: { fill: AXIS_TEXT, fontSize: 11 }, tickLine: false, axisLine: { stroke: GRID } } as const;

export function ConversationsLeadsChart({ data }: { data: DayPoint[] }) {
  const series = [
    { key: "conversations" as const, name: "Conversations", color: SERIES_1 },
    { key: "leads" as const, name: "Leads", color: SERIES_2 },
  ];
  return (
    <figure>
      <Legend items={series} kind="line" />
      <div className="mt-3 h-56" role="img" aria-label="Line chart of conversations and leads per day">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" {...axisProps} minTickGap={24} />
            <YAxis allowDecimals={false} {...axisProps} axisLine={false} width={40} />
            <Tooltip
              cursor={{ stroke: AXIS_TEXT, strokeWidth: 1 }}
              content={({ active, payload, label }) => (
                <ChartTooltip active={active} label={String(label ?? "")} rows={series.map((s) => ({ name: s.name, color: s.color, value: Number(payload?.find((p) => p.dataKey === s.key)?.value ?? 0) }))} />
              )}
            />
            {series.map((s) => (
              <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable caption="Conversations and leads per day" head={["Day", "Conversations", "Leads"]} rows={data.map((d) => [d.label, d.conversations, d.leads])} />
    </figure>
  );
}

export function BookingsChart({ data }: { data: DayPoint[] }) {
  const series = [
    { key: "bookedAi" as const, name: "Booked by AI", color: SERIES_1 },
    { key: "bookedOther" as const, name: "Booked by team / online", color: SERIES_2 },
  ];
  return (
    <figure>
      <Legend items={series} kind="rect" />
      <div className="mt-3 h-56" role="img" aria-label="Stacked bar chart of appointments booked per day, by AI versus team or online">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" {...axisProps} minTickGap={24} />
            <YAxis allowDecimals={false} {...axisProps} axisLine={false} width={40} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={({ active, payload, label }) => (
                <ChartTooltip active={active} label={String(label ?? "")} rows={series.map((s) => ({ name: s.name, color: s.color, value: Number(payload?.find((p) => p.dataKey === s.key)?.value ?? 0) }))} />
              )}
            />
            <Bar dataKey="bookedAi" name="Booked by AI" stackId="b" fill={SERIES_1} stroke={SURFACE} strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
            <Bar dataKey="bookedOther" name="Booked by team / online" stackId="b" fill={SERIES_2} stroke={SURFACE} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable caption="Appointments booked per day" head={["Day", "By AI", "By team / online"]} rows={data.map((d) => [d.label, d.bookedAi, d.bookedOther])} />
    </figure>
  );
}
