"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarX, Clock, Hourglass, MessageSquare, MousePointerClick, Send, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Opportunity, OpportunityType } from "@/server/services/opportunities";
import { dismissOpportunityAction, followUpOpportunityAction } from "./actions";
import { TYPE_META } from "./types";

const ICONS: Record<OpportunityType, React.ComponentType<{ className?: string }>> = {
  waiting_for_human: Hourglass,
  stale_lead: Clock,
  abandoned_booking: MousePointerClick,
  cancelled_no_rebook: CalendarX,
  lapsed_customer: UserRound,
};

export function OpportunityItem({ opportunity: o }: { opportunity: Opportunity }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const Icon = ICONS[o.type];

  const followUp = () =>
    start(async () => {
      setResult(null);
      const res = await followUpOpportunityAction(o.key);
      if (!res.ok) setResult({ ok: false, text: res.error });
      else if (res.data?.sent) setResult({ ok: true, text: `Follow-up sent. ${res.data.detail}` });
      else setResult({ ok: false, text: `Not sent — ${res.data?.detail ?? "unknown reason"}` });
    });
  const dismiss = () =>
    start(async () => {
      const res = await dismissOpportunityAction(o.key);
      if (!res.ok) setResult({ ok: false, text: res.error });
    });

  return (
    <li className={cn("flex flex-col gap-3 border-t px-5 py-4 first:border-t-0 sm:flex-row sm:items-center", pending && "opacity-70")}>
      <div className="flex min-w-0 flex-1 gap-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", TYPE_META[o.type].tone)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{o.title}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {o.detail} · <span title={new Date(o.at).toLocaleString()}>{fmtRelative(o.at)}</span> ·{" "}
            <Link href={`/app/customers/${o.customerId}`} className="hover:text-foreground hover:underline">
              View customer
            </Link>
          </p>
          {result ? (
            <p role="status" className={cn("mt-1 text-[13px]", result.ok ? "text-success" : "text-danger")}>
              {result.text}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 pl-11 sm:pl-0">
        {o.conversationId ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={`/app/inbox?c=${o.conversationId}`}>
              <MessageSquare /> Open conversation
            </Link>
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={followUp}
          disabled={pending || !o.canFollowUp || result?.ok}
          title={!o.canFollowUp ? (o.type === "waiting_for_human" ? "A person needs to reply in the inbox" : "This customer opted out of messages") : undefined}
        >
          <Send /> {result?.ok ? "Sent" : "Follow up"}
        </Button>
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={dismiss} disabled={pending} title="Dismiss" aria-label="Dismiss">
          <X />
        </Button>
      </div>
    </li>
  );
}
