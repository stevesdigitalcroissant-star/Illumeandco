"use client";
import { Copy, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export type Interval = { start: string; end: string };
export type Week = Record<number, Interval[]>;

export function toWeek(rows: { weekday: number; start: string; end: string }[]): Week {
  const w: Week = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  for (const r of rows) w[r.weekday]?.push({ start: r.start, end: r.end });
  return w;
}
export function fromWeek(w: Week) {
  return Object.entries(w).flatMap(([d, list]) => list.map((i) => ({ weekday: Number(d), start: i.start, end: i.end })));
}

/** Per-weekday intervals. No intervals = closed. Several intervals = split shift. */
export function WeekEditor({ value, onChange, closedLabel = "Closed", addLabel = "Add split shift", defaultInterval = { start: "09:00", end: "18:00" }, toggle = true }: {
  value: Week;
  onChange: (w: Week) => void;
  closedLabel?: string;
  addLabel?: string;
  defaultInterval?: Interval;
  toggle?: boolean;
}) {
  const setDay = (d: number, list: Interval[]) => onChange({ ...value, [d]: list });
  const copyToAll = (d: number) => {
    const next: Week = { ...value };
    for (let i = 1; i <= 7; i++) if (i !== d && (value[i]?.length || !toggle)) next[i] = value[d]!.map((x) => ({ ...x }));
    onChange(next);
  };
  return (
    <div className="divide-y rounded-lg border">
      {WEEKDAYS.map((name, idx) => {
        const d = idx + 1;
        const list = value[d] ?? [];
        const open = list.length > 0;
        return (
          <div key={d} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
            <div className="flex w-40 shrink-0 items-center gap-3 pt-1.5">
              {toggle ? <Switch checked={open} onCheckedChange={(c) => setDay(d, c ? [{ ...defaultInterval }] : [])} aria-label={`${name} open`} /> : null}
              <span className="text-sm font-medium">{name}</span>
            </div>
            <div className="flex-1 space-y-2">
              {open ? (
                list.map((iv, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input type="time" value={iv.start} onChange={(e) => setDay(d, list.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="w-32" aria-label={`${name} start ${i + 1}`} />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input type="time" value={iv.end} onChange={(e) => setDay(d, list.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className="w-32" aria-label={`${name} end ${i + 1}`} />
                    {list.length > 1 || !toggle ? (
                      <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => setDay(d, list.filter((_, j) => j !== i))} aria-label="Remove interval"><X /></Button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="pt-1.5 text-sm text-muted-foreground">{closedLabel}</p>
              )}
            </div>
            <div className="flex gap-1 sm:pt-0.5">
              {open || !toggle ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDay(d, [...list, list.length ? { start: list[list.length - 1]!.end, end: list[list.length - 1]!.end < "20:00" ? "20:00" : "23:00" } : { ...defaultInterval }])}>
                  <Plus /> {list.length ? addLabel : "Add"}
                </Button>
              ) : null}
              {open ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => copyToAll(d)} title={toggle ? "Copy to all open days" : "Copy to every day"}>
                  <Copy /> <span className="sr-only sm:not-sr-only">Copy</span>
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
