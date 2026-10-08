"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, CalendarClock, MessageSquare, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FeedAction } from "@/server/recovery/revenue";
import { cn } from "@/lib/utils";
import { followUpNowAction } from "../opportunities/actions";
import { offerSlotAction } from "../slots/actions";

const LABEL: Record<Exclude<FeedAction, null>, { text: string; icon: React.ReactNode }> = {
  let_ai_handle: { text: "Let AI handle", icon: <Bot /> },
  offer_rebooking: { text: "Offer a new time", icon: <Send /> },
  reactivate: { text: "Reactivate", icon: <RotateCcw /> },
  recover_slot: { text: "Recover slot", icon: <CalendarClock /> },
  confirm_slot: { text: "Confirm booking", icon: <CalendarClock /> },
  open_conversation: { text: "Open conversation", icon: <MessageSquare /> },
};

export function FeedActionButton({ id, action, conversationId }: { id: string; action: FeedAction; conversationId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  if (!action) return <span className="text-xs text-muted-foreground">No automatic action (opted out)</span>;
  const l = LABEL[action];
  if (action === "open_conversation" || action === "confirm_slot")
    return (
      <Button size="sm" variant="outline" asChild>
        <Link href={action === "open_conversation" ? `/app/inbox${conversationId ? `?c=${conversationId}` : ""}` : "/app/slots"}>{l.icon} {l.text}</Link>
      </Button>
    );
  const run = () =>
    start(async () => {
      if (action === "recover_slot") {
        const r = await offerSlotAction(id);
        setResult(r.ok ? { ok: true, text: r.message ?? "Offers sent." } : { ok: false, text: r.error });
      } else {
        const r = await followUpNowAction(id);
        setResult(!r.ok ? { ok: false, text: r.error } : { ok: Boolean(r.data?.sent), text: r.data?.detail ?? "Done." });
      }
      router.refresh();
    });
  return (
    <span className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={run}>{l.icon} {pending ? "Working…" : l.text}</Button>
      {result ? <span className={cn("max-w-64 text-right text-xs", result.ok ? "text-success" : "text-danger")}>{result.text}</span> : null}
    </span>
  );
}
