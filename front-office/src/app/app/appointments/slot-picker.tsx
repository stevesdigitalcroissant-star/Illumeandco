"use client";
import { useRef, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Loader2 } from "lucide-react";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Slot } from "@/server/services/availability";
import { getSlotsAction } from "./actions";

export type StaffOption = { id: string; name: string };

/**
 * Pick a date, then one of the real bookable times returned by the
 * availability engine. Loads are triggered by user events (no effects).
 */
export function SlotPicker({
  serviceId,
  timezone,
  staffOptions,
  initialStaffId = "",
  excludeAppointmentId,
  maxAdvanceDays = 60,
  selected,
  onSelect,
}: {
  serviceId: string | null;
  timezone: string;
  staffOptions: StaffOption[];
  initialStaffId?: string;
  excludeAppointmentId?: string;
  maxAdvanceDays?: number;
  selected: Slot | null;
  onSelect: (slot: Slot | null) => void;
}) {
  const today = DateTime.now().setZone(timezone).startOf("day");
  const [date, setDate] = useState<string>("");
  const [staffId, setStaffId] = useState(initialStaffId);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const reqId = useRef(0);

  const load = (d: string, s: string) => {
    onSelect(null);
    if (!serviceId || !d) {
      setSlots(null);
      return;
    }
    const id = ++reqId.current;
    start(async () => {
      const res = await getSlotsAction({ serviceId, date: d, staffId: s || null, excludeAppointmentId: excludeAppointmentId ?? null });
      if (id !== reqId.current) return;
      if (!res.ok) {
        setSlots([]);
        setMessage(res.error);
      } else {
        setSlots(res.data?.slots ?? []);
        setMessage(res.data?.reason ?? null);
      }
    });
  };

  const days = Array.from({ length: 14 }, (_, i) => today.plus({ days: i }));
  const groups = slots
    ? [
        { label: "Morning", items: slots.filter((s) => DateTime.fromISO(s.startsAt).setZone(timezone).hour < 12) },
        { label: "Afternoon", items: slots.filter((s) => { const h = DateTime.fromISO(s.startsAt).setZone(timezone).hour; return h >= 12 && h < 17; }) },
        { label: "Evening", items: slots.filter((s) => DateTime.fromISO(s.startsAt).setZone(timezone).hour >= 17) },
      ].filter((g) => g.items.length)
    : [];

  return (
    <div className="space-y-4">
      {staffOptions.length > 1 ? (
        <div className="space-y-1.5">
          <Label>Staff</Label>
          <NativeSelect
            value={staffId}
            onChange={(e) => {
              setStaffId(e.target.value);
              load(date, e.target.value);
            }}
            disabled={!serviceId}
          >
            <option value="">Any available</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label>Date</Label>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {days.map((d) => {
            const iso = d.toISODate()!;
            const active = iso === date;
            return (
              <button
                key={iso}
                type="button"
                disabled={!serviceId}
                onClick={() => {
                  setDate(iso);
                  load(iso, staffId);
                }}
                className={cn(
                  "flex w-12 shrink-0 flex-col items-center rounded-md border py-1.5 text-center transition-colors disabled:opacity-40",
                  active ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                )}
              >
                <span className={cn("text-[10.5px] uppercase", active ? "text-background/70" : "text-muted-foreground")}>{d.toFormat("ccc")}</span>
                <span className="text-sm font-semibold tabular">{d.toFormat("d")}</span>
              </button>
            );
          })}
        </div>
        <Input
          type="date"
          aria-label="Or pick another date"
          value={date}
          min={today.toISODate()!}
          max={today.plus({ days: maxAdvanceDays }).toISODate()!}
          disabled={!serviceId}
          onChange={(e) => {
            setDate(e.target.value);
            load(e.target.value, staffId);
          }}
          className="w-44"
        />
      </div>

      <div className="min-h-16">
        {!serviceId ? (
          <p className="text-[13px] text-muted-foreground">Choose a service to see open times.</p>
        ) : !date ? (
          <p className="text-[13px] text-muted-foreground">Choose a date to see real open times.</p>
        ) : pending ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Checking availability…
          </p>
        ) : slots && slots.length ? (
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{g.label}</p>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                  {g.items.map((s) => {
                    const active = selected?.startsAt === s.startsAt && selected.staffId === s.staffId;
                    return (
                      <button
                        key={`${s.startsAt}|${s.staffId}`}
                        type="button"
                        onClick={() => onSelect(s)}
                        className={cn(
                          "rounded-md border py-1.5 text-[13px] font-medium tabular transition-colors",
                          active ? "border-primary bg-primary text-primary-foreground" : "hover:border-foreground/30 hover:bg-muted",
                        )}
                      >
                        {DateTime.fromISO(s.startsAt).setZone(timezone).toFormat("h:mm a")}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md bg-muted px-3 py-2.5 text-[13px] text-muted-foreground">{message ?? "No open times on this day."} Try another date.</p>
        )}
      </div>
    </div>
  );
}
