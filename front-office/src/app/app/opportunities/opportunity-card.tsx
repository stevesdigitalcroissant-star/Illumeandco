"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Bot, ChevronDown, MessageSquare, Send, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";
import { closeOpportunityAction, followUpNowAction } from "./actions";

export type CardData = {
  id: string;
  kind: string;
  stage: string;
  stageLabel: string;
  title: string;
  customerId: string;
  customerName: string;
  optedOut: boolean;
  wants: string | null;
  blocker: string;
  blockerDetail: string | null;
  intentScore: number;
  nextAction: string;
  nextActionLabel: string | null;
  nextActionBy: string;
  nextActionDue: boolean;
  conversationId: string | null;
  estimatedValue: string | null;
  evidence: { when: string; detail: string }[];
  lastActivity: string | null;
};

const STAGE_TONE: Record<string, "neutral" | "primary" | "warning" | "success" | "info" | "danger"> = {
  new_lead: "info",
  interested: "info",
  high_intent: "primary",
  booking_in_progress: "primary",
  needs_follow_up: "warning",
  waiting: "neutral",
  cancelled: "warning",
  no_show: "danger",
  reactivation: "neutral",
  needs_human: "danger",
};

export function OpportunityCard({ o }: { o: CardData }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const canFollowUp = o.kind !== "needs_human" && !o.optedOut && o.blocker !== "opted_out";

  const act = (fn: () => Promise<ActionResult<{ sent: boolean; detail: string } | void>>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setResult({ ok: false, text: r.error });
      else if (r.data) setResult({ ok: r.data.sent, text: r.data.detail });
      else setResult({ ok: true, text: r.message ?? "Done." });
    });

  return (
    <li className="border-t px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STAGE_TONE[o.stage] ?? "neutral"}>{o.stageLabel}</Badge>
            <Link href={`/app/customers/${o.customerId}`} className="truncate text-sm font-medium hover:underline">
              {o.customerName}
            </Link>
            <span className="text-[13px] text-muted-foreground">· {o.title}</span>
          </div>
          {o.wants ? (
            <p className="text-[13px]"><span className="text-muted-foreground">Wants:</span> {o.wants}</p>
          ) : null}
          {o.blockerDetail ? (
            <p className="text-[13px]"><span className="text-muted-foreground">Holding them back:</span> {o.blockerDetail}</p>
          ) : null}
          {o.nextActionLabel ? (
            <p className={cn("flex items-center gap-1.5 text-[13px]", o.nextActionDue && o.nextActionBy === "human" && "font-medium text-foreground")}>
              {o.nextActionBy === "ai" ? <Bot className="size-3.5 text-primary" /> : <UserRound className="size-3.5 text-warning" />}
              <span className="text-muted-foreground">Next:</span> {o.nextActionLabel}
            </p>
          ) : null}
          {o.evidence.length ? (
            <div>
              <button type="button" onClick={() => setShowWhy((v) => !v)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                Why <ChevronDown className={cn("size-3.5 transition-transform", showWhy && "rotate-180")} />
              </button>
              {showWhy ? (
                <ul className="mt-1.5 space-y-1 border-l pl-3">
                  {o.evidence.map((e, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      <span className="tabular">{e.when}</span> — {e.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {result ? <p className={cn("text-xs", result.ok ? "text-success" : "text-danger")}>{result.text}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {o.kind === "lead" || o.kind === "missed_call" ? (
            <div className="flex items-center gap-2" title="Intent score from what the customer said and did">
              <span className="text-[11px] text-muted-foreground">Intent</span>
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${o.intentScore}%` }} />
              </span>
            </div>
          ) : null}
          {o.estimatedValue ? <span className="text-xs text-muted-foreground">{o.estimatedValue} est.</span> : null}
          <div className="flex flex-wrap justify-end gap-1.5">
            {o.conversationId ? (
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/app/inbox?c=${o.conversationId}`}>
                  <MessageSquare /> Conversation
                </Link>
              </Button>
            ) : null}
            {canFollowUp ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => followUpNowAction(o.id))}>
                <Send /> Follow up now
              </Button>
            ) : null}
            {o.kind !== "needs_human" ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => closeOpportunityAction(o.id, "lost"))}>
                Mark lost
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => closeOpportunityAction(o.id, "dismissed"))}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
