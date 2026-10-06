"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bot, CheckCheck, Hand, Send, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action";
import { assignToMeAction, replyAction, resolveAction, returnToAiAction, takeOverAction } from "./actions";

export function ConversationActions({ id, owner, status, assignedToMe, canAssign }: { id: string; owner: "ai" | "human"; status: string; assignedToMe: boolean; canAssign: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const router = useRouter();
  const act = (fn: (id: string) => Promise<ActionResult>) =>
    start(async () => {
      setMsg(await fn(id));
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {owner === "ai" || status !== "human_handling" ? (
        <Button size="sm" variant="dark" disabled={pending} onClick={() => act(takeOverAction)}>
          <Hand /> Take over
        </Button>
      ) : null}
      {owner === "human" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => act(returnToAiAction)}>
          <Bot /> Return to AI
        </Button>
      ) : null}
      {canAssign && !assignedToMe ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(assignToMeAction)}>
          <UserRoundCheck /> Assign to me
        </Button>
      ) : null}
      {status !== "resolved" ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(resolveAction)}>
          <CheckCheck /> Resolve
        </Button>
      ) : null}
      {msg && !msg.ok ? <span className="text-xs text-danger">{msg.error}</span> : null}
    </div>
  );
}

export function ReplyComposer({ id, aiOwned, channelLabel }: { id: string; aiOwned: boolean; channelLabel: string }) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<{ delivery: string; detail?: string }> | null>(null);
  const router = useRouter();
  const submit = () =>
    start(async () => {
      if (!text.trim()) return;
      const r = await replyAction(id, text);
      setResult(r);
      if (r.ok) setText("");
      router.refresh();
    });
  return (
    <div className="border-t bg-background p-3">
      {aiOwned ? <p className="mb-2 text-xs text-muted-foreground">Sending a reply takes over this conversation and pauses the AI.</p> : null}
      <div className="flex items-end gap-2 rounded-lg border px-3 py-2 focus-within:border-ring">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={2}
          placeholder={`Reply via ${channelLabel}…`}
          className="max-h-40 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button size="sm" onClick={submit} disabled={pending || !text.trim()}>
          <Send /> Send
        </Button>
      </div>
      {result && !result.ok ? <p className="mt-1.5 text-xs text-danger">{result.error}</p> : null}
      {result?.ok && result.data?.detail ? <p className="mt-1.5 text-xs text-warning">Saved, but not delivered: {result.data.detail}</p> : null}
    </div>
  );
}
