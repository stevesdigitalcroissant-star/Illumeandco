"use client";
import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";
import { saveFaqsAction } from "./actions";
import { StepFooter } from "./wizard";

type Pair = { key: number; q: string; a: string };
let nextKey = 1;
const blank = (): Pair => ({ key: nextKey++, q: "", a: "" });

export function FaqStep({ initial }: { initial: { q: string; a: string }[] }) {
  const [state, action] = useActionState<ActionResult<unknown> | null, FormData>(saveFaqsAction, null);
  const [pairs, setPairs] = useState<Pair[]>(() => (initial.length ? initial.map((p) => ({ key: nextKey++, ...p })) : [blank(), blank()]));
  const update = (key: number, patch: Partial<Pair>) => setPairs((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const remove = (key: number) => setPairs((ps) => (ps.length > 1 ? ps.filter((p) => p.key !== key) : [blank()]));

  return (
    <form action={action}>
      <input type="hidden" name="faqs" value={JSON.stringify(pairs.map(({ q, a }) => ({ q, a })))} />
      <ol className="space-y-3">
        {pairs.map((p, i) => (
          <li key={p.key} className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <span className="mt-2 w-5 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{i + 1}.</span>
              <div className="min-w-0 flex-1 space-y-2">
                <Input value={p.q} onChange={(e) => update(p.key, { q: e.target.value })} placeholder={i === 0 ? "e.g. Do you have parking?" : "Question"} aria-label={`Question ${i + 1}`} maxLength={500} />
                <Textarea value={p.a} onChange={(e) => update(p.key, { a: e.target.value })} placeholder={i === 0 ? "e.g. Yes — free parking is available in the building basement." : "Answer"} aria-label={`Answer ${i + 1}`} rows={2} maxLength={3000} />
              </div>
              <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-danger" aria-label={`Remove question ${i + 1}`} onClick={() => remove(p.key)}>
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => setPairs((ps) => [...ps, blank()])}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
      >
        <Plus className="size-4" /> Add a question
      </button>
      <p className="mt-3 text-xs text-muted-foreground">Saved to your knowledge base as “Frequently asked questions”. You can add documents and website pages there later.</p>
      <StepFooter step={7} state={state} />
    </form>
  );
}
