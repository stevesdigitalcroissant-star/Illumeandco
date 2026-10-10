"use client";
/**
 * "What is it costing you?" — the visitor enters their own numbers; we show
 * the revenue at risk each month and what recovering a share of it is worth.
 * The recovery rate is the visitor's own assumption (default 20%), stated
 * plainly — no promised results.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";

const CURRENCIES = ["USD", "CAD", "AUD", "GBP", "EUR", "NZD", "AED"] as const;

function NumberField({ label, hint, value, onChange, min = 0, max = 1000, step = 1 }: { label: string; hint: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-lg font-semibold tabular">{value.toLocaleString("en-US")}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--color-primary)]"
        aria-label={label}
      />
      <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
    </label>
  );
}

export function RoiCalculator() {
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("USD");
  const [missed, setMissed] = useState(15);
  const [enquiries, setEnquiries] = useState(10);
  const [cancellations, setCancellations] = useState(5);
  const [value, setValue] = useState(120);
  const [rate, setRate] = useState(20);

  const weeks = 4.33;
  const atRisk = Math.round((missed + enquiries + cancellations) * value * weeks);
  const recovered = Math.round((atRisk * rate) / 100);
  const fmt = (n: number) => (currency === "USD" ? `$${n.toLocaleString("en-US")}` : `${currency} ${n.toLocaleString("en-US")}`);

  return (
    <div className="grid gap-8 rounded-2xl border bg-background p-6 sm:p-8 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-6">
        <NumberField label="Missed calls per week" hint="Calls nobody answered — lunch, busy reception, after hours." value={missed} onChange={setMissed} max={100} />
        <NumberField label="Enquiries that never got a reply" hint="Website forms, Instagram and WhatsApp messages answered late or not at all." value={enquiries} onChange={setEnquiries} max={100} />
        <NumberField label="Cancellations and no-shows per week" hint="Appointments that left an empty slot." value={cancellations} onChange={setCancellations} max={60} />
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="block">
            <span className="text-[13px] font-medium">Average booking value</span>
            <span className="mt-2 flex gap-2">
              <select value={currency} onChange={(e) => setCurrency(e.target.value as (typeof CURRENCIES)[number])} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Currency">
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input type="number" min={0} value={value} onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))} className="h-9 w-full rounded-md border bg-background px-3 text-sm tabular" aria-label="Average booking value" />
            </span>
          </label>
          <NumberField label="Share you'd win back (%)" hint="Your assumption. 20% is a cautious starting point." value={rate} onChange={setRate} min={5} max={60} />
        </div>
      </div>

      <div className="flex flex-col justify-between gap-6 rounded-xl bg-surface p-6">
        <div>
          <p className="text-[13px] text-muted-foreground">Revenue at risk every month</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular text-danger">{fmt(atRisk)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{missed + enquiries + cancellations} lost opportunities a week × {fmt(value)}</p>
        </div>
        <div>
          <p className="text-[13px] text-muted-foreground">If you win back {rate}% of it</p>
          <p className={cn("mt-1 text-4xl font-semibold tracking-tight tabular text-success transition-all")}>{fmt(recovered)}</p>
          <p className="mt-1 text-xs text-muted-foreground">per month · about {fmt(recovered * 12)} a year</p>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          An estimate from your own numbers, not a promise. Once you&apos;re live, the dashboard shows what was actually recovered — only bookings that came after one of our messages count.
        </p>
      </div>
    </div>
  );
}
