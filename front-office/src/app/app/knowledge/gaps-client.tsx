"use client";
/** Questions the AI couldn't answer: answer once (added to the knowledge base) or dismiss. */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { answerGapAction, dismissGapAction } from "./actions";

type Gap = { id: string; question: string; timesAsked: number; lastAsked: string };

function GapRow({ gap }: { gap: Gap }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(gap.question);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
      else router.refresh();
    });

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{gap.question}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Asked {gap.timesAsked === 1 ? "once" : `${gap.timesAsked} times`} · last {gap.lastAsked}
          </p>
        </div>
        {!open ? (
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" onClick={() => setOpen(true)}>Answer</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => dismissGapAction(gap.id))}>Dismiss</Button>
          </div>
        ) : null}
      </div>
      {open ? (
        <form
          className="mt-3 space-y-2 pl-7"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => answerGapAction(gap.id, { question, answer }));
          }}
        >
          <Input aria-label="Question" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} />
          <Textarea aria-label="Answer" placeholder="The answer your receptionist should give" value={answer} onChange={(e) => setAnswer(e.target.value)} className="min-h-[80px]" maxLength={2000} autoFocus />
          {error ? <p className="text-[13px] text-danger" role="alert">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending || answer.trim().length < 2}>
              {pending ? <Loader2 className="animate-spin" /> : null} Save answer
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      ) : error ? (
        <p className="mt-2 pl-7 text-[13px] text-danger" role="alert">{error}</p>
      ) : null}
    </li>
  );
}

export function GapList({ gaps }: { gaps: Gap[] }) {
  return (
    <ul className="divide-y">
      {gaps.map((g) => (
        <GapRow key={g.id} gap={g} />
      ))}
    </ul>
  );
}
