"use client";
/**
 * Hero animation: an example recovery feed that plays out step by step —
 * a missed call is texted back, the caller replies, books; a cancellation is
 * refilled from the waitlist; a quiet lead is followed up. Clearly labelled as
 * an example. Respects prefers-reduced-motion (shows the finished state).
 */
import { useEffect, useState } from "react";
import { CalendarCheck, CalendarClock, Check, MessageSquare, PhoneMissed, Sparkles, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = { icon: typeof PhoneMissed; tone: "danger" | "primary" | "success" | "muted"; title: string; detail: string; value?: number };

const STEPS: Step[] = [
  { icon: PhoneMissed, tone: "danger", title: "Missed call · 1:12 PM", detail: "••• ••• 4417 — reception was with a patient" },
  { icon: MessageSquare, tone: "primary", title: "AI texted back in 4 seconds", detail: "“Sorry we missed your call! How can we help?”" },
  { icon: UserRound, tone: "muted", title: "Sara replied", detail: "“How much is teeth whitening? Anything this week?”" },
  { icon: CalendarCheck, tone: "success", title: "Booked · Teeth whitening", detail: "Thu 4:30 PM — recovered from a missed call", value: 180 },
  { icon: CalendarClock, tone: "danger", title: "Cancellation · Fri 10:00 AM", detail: "Cleaning with Dr. Omar — slot is now empty" },
  { icon: Sparkles, tone: "primary", title: "Offered to the top 3 on the waitlist", detail: "Ranked by fit, value and how long they've waited" },
  { icon: CalendarCheck, tone: "success", title: "Slot refilled · Ahmed replied YES", detail: "Booked automatically — first come, first served", value: 85 },
];

const TONE = {
  danger: "bg-danger-soft text-danger",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  muted: "bg-muted text-muted-foreground",
} as const;

export function RecoveryDemo() {
  const [shown, setShown] = useState(1);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setShown((n) => (n >= STEPS.length + 2 ? 1 : n + 1)), 1600);
    return () => clearInterval(t);
  }, [reduced]);

  const visible = reduced ? STEPS.length : Math.min(shown, STEPS.length);
  const recovered = STEPS.slice(0, visible).reduce((s, x) => s + (x.value ?? 0), 0);

  return (
    <div className="relative rounded-2xl border bg-background p-5 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          <p className="text-[13px] font-medium">Revenue recovery · live feed</p>
        </div>
        <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">Example</span>
      </div>

      <ol className="mt-4 space-y-2" aria-live="polite">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-all duration-500 motion-reduce:transition-none",
              i < visible ? "translate-y-0 opacity-100" : "pointer-events-none h-0 -translate-y-1 overflow-hidden border-transparent py-0 opacity-0",
            )}
          >
            <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", TONE[s.tone])}>
              <s.icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{s.title}</p>
              <p className="truncate text-xs text-muted-foreground">{s.detail}</p>
            </div>
            {s.value ? (
              <span className="shrink-0 rounded-md bg-success-soft px-1.5 py-0.5 text-xs font-semibold text-success tabular">+${s.value}</span>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex items-center justify-between rounded-lg bg-surface px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Check className="size-3.5 text-success" aria-hidden /> Recovered today
        </span>
        <span className="text-lg font-semibold tabular transition-all">${recovered.toLocaleString("en-US")}</span>
      </div>
    </div>
  );
}
