/**
 * Product illustrations built in HTML. These depict how the product works;
 * they contain no customer data, metrics or testimonials.
 */
import { ArrowRight, Bell, CalendarCheck2, Check, Clock, MessageSquare, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

function Frame({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)]", className)}>
      <div className="flex items-center gap-2 border-b bg-surface px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </span>
        <span className="ml-2 text-xs font-medium text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Bubble({ from, children }: { from: "customer" | "ai"; children: React.ReactNode }) {
  return (
    <div className={cn("flex", from === "customer" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
          from === "customer" ? "rounded-br-md bg-foreground text-background" : "rounded-bl-md border bg-surface text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function HeroChat() {
  return (
    <div className="relative">
      <Frame title="Website chat">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary-soft text-primary">
            <MessageSquare className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium">Front Desk</p>
            <p className="text-xs text-muted-foreground">AI receptionist · replies instantly</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" /> Online
          </span>
        </div>
        <div className="space-y-3 px-4 py-5" aria-label="Example conversation">
          <Bubble from="customer">Do you have anything tomorrow afternoon?</Bubble>
          <Bubble from="ai">Yes — I have 2:30 PM and 4:00 PM. Which works better?</Bubble>
          <Bubble from="customer">2:30</Bubble>
          <Bubble from="ai">Perfect. I&apos;ve booked you for 2:30 PM. You&apos;ll get a confirmation shortly.</Bubble>
          <div className="flex justify-center pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success">
              <Check className="size-3" /> Appointment booked · logged
            </span>
          </div>
        </div>
        <div className="border-t px-4 py-3">
          <div className="flex h-9 items-center rounded-md border bg-surface px-3 text-[13px] text-muted-foreground">Type a message…</div>
        </div>
      </Frame>
    </div>
  );
}

export function FollowUpIllustration() {
  const steps = [
    { icon: MessageSquare, title: "New enquiry", detail: "Asked about pricing, then went quiet", tone: "neutral" },
    { icon: Clock, title: "Follow-up scheduled", detail: "Gentle check-in after the delay you choose", tone: "neutral" },
    { icon: ArrowRight, title: "Follow-up sent", detail: "Stops automatically if they reply or book", tone: "neutral" },
    { icon: CalendarCheck2, title: "Lead converted", detail: "Booked — moved to Won", tone: "success" },
  ] as const;
  return (
    <Frame title="Lead timeline">
      <ol className="space-y-0 px-5 py-5">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 ? <span className="absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px bg-border" aria-hidden /> : null}
            <span
              className={cn(
                "relative inline-flex size-7 shrink-0 items-center justify-center rounded-full border",
                s.tone === "success" ? "border-success/20 bg-success-soft text-success" : "bg-background text-muted-foreground",
              )}
            >
              <s.icon className="size-3.5" />
            </span>
            <div className="pt-0.5">
              <p className="text-[13px] font-medium">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

export function BookingIllustration() {
  const slots = ["9:00", "9:30", "11:00", "14:30", "16:00", "17:15"];
  return (
    <Frame title="Availability">
      <div className="px-5 py-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium">Facial treatment · 60 min</p>
          <span className="text-xs text-muted-foreground">Tomorrow</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {slots.map((s) => (
            <span
              key={s}
              className={cn(
                "rounded-md border py-2 text-center text-[13px] tabular-nums",
                s === "14:30" ? "border-primary bg-primary-soft font-medium text-primary" : "text-foreground/80",
              )}
            >
              {s}
            </span>
          ))}
        </div>
        <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
          <p className="flex items-center gap-2"><Check className="size-3.5 text-success" /> Staff schedules, buffers and opening hours respected</p>
          <p className="flex items-center gap-2"><Check className="size-3.5 text-success" /> No double bookings</p>
          <p className="flex items-center gap-2"><Bell className="size-3.5 text-primary" /> Confirmation and reminders sent</p>
        </div>
      </div>
    </Frame>
  );
}

export function HandoffIllustration() {
  return (
    <Frame title="Inbox">
      <div className="px-5 py-5">
        <div className="flex items-start gap-3 rounded-lg border bg-surface p-3.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserRound className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-medium">Website visitor</p>
              <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">Needs a human</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Reason: asked about a refund — the AI never handles money.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background">Take over</span>
          <span className="rounded-md border px-3 py-1.5 text-xs font-medium">Return to AI</span>
        </div>
      </div>
    </Frame>
  );
}

export function AnalyticsIllustration() {
  const rows = ["Conversations", "New leads", "Booked by the AI", "Human handoffs", "Conversion rate"];
  return (
    <Frame title="Analytics">
      <ul className="divide-y px-5 py-2">
        {rows.map((r, i) => (
          <li key={r} className="flex items-center justify-between gap-4 py-3">
            <span className="text-[13px]">{r}</span>
            <span className="h-1.5 rounded-full bg-primary/25" style={{ width: `${[64, 48, 40, 18, 32][i]}px` }} aria-hidden />
          </li>
        ))}
      </ul>
    </Frame>
  );
}
