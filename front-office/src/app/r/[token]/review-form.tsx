"use client";
import { useActionState, useState } from "react";
import { CheckCircle2, ExternalLink, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";
import { submitReviewAction, type ReviewOutcome } from "./actions";

const LABELS = ["", "Very poor", "Poor", "Okay", "Good", "Excellent"];

export function ReviewForm({ token, businessName, serviceName }: { token: string; businessName: string; serviceName: string }) {
  const [state, action, pending] = useActionState<ActionResult<ReviewOutcome> | null, FormData>(submitReviewAction.bind(null, token), null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const shown = hover || rating;

  if (state?.ok && state.data) {
    const { positive, links } = state.data;
    return (
      <div className="rounded-xl border bg-background p-8 text-center shadow-sm">
        <span className="mx-auto inline-flex size-10 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-5" />
        </span>
        {positive ? (
          <>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">Thank you — that means a lot!</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {links.length
                ? `If you have a moment, sharing your experience publicly helps ${businessName} a lot.`
                : `We've passed your feedback on to the team at ${businessName}.`}
            </p>
            {links.length ? (
              <div className="mt-6 flex flex-col gap-2">
                {links.map((l) => (
                  <Button key={l.url} asChild variant="outline" className="w-full">
                    <a href={l.url} target="_blank" rel="noopener noreferrer">
                      {l.label} <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">Thank you for telling us</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your feedback goes directly to the management at {businessName}. It&apos;s private — it won&apos;t be posted publicly.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="rounded-xl border bg-background p-7 shadow-sm sm:p-8">
      <p className="text-[13px] font-medium text-muted-foreground">{businessName}</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">How was your {serviceName}?</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">It takes ten seconds and helps the team improve.</p>

      <fieldset className="mt-7">
        <legend className="sr-only">Your rating</legend>
        <div className="flex items-center justify-center gap-1.5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer rounded-md p-1 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40" onMouseEnter={() => setHover(n)}>
              <input type="radio" name="rating" value={n} className="sr-only" checked={rating === n} onChange={() => setRating(n)} required />
              <span className="sr-only">{`${n} star${n > 1 ? "s" : ""} — ${LABELS[n]}`}</span>
              <Star
                aria-hidden
                className={cn("size-9 transition-colors", n <= shown ? "fill-amber-400 text-amber-400" : "fill-transparent text-border")}
                strokeWidth={1.5}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 h-5 text-center text-[13px] text-muted-foreground" aria-live="polite">{shown ? LABELS[shown] : "Tap a star to rate"}</p>
      </fieldset>

      <div className="mt-6 space-y-1.5">
        <Label htmlFor="feedback">Anything you&apos;d like to add? <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Textarea id="feedback" name="feedback" rows={3} maxLength={2000} placeholder="What went well, or what could be better?" />
      </div>

      {state && !state.ok ? <p className="mt-4 text-[13px] text-danger" role="alert">{state.error}</p> : null}

      <Button type="submit" className="mt-6 w-full" disabled={pending || !rating}>
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}
