"use client";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";
import { skipStepAction } from "./actions";

export function StepProgress({
  step,
  total,
  labels,
  reached,
  title,
  description,
  children,
}: {
  step: number;
  total: number;
  labels: string[];
  /** Furthest step the business has reached; earlier steps are clickable. Omitted before the business exists. */
  reached?: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-6">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[13px] font-medium text-primary">
            Step {step} of {total}
            <span className="text-muted-foreground"> · {labels[step - 1]}</span>
          </p>
          {reached ? (
            <Link href="/app" className="text-[13px] text-muted-foreground hover:text-foreground">
              Finish later
            </Link>
          ) : null}
        </div>
        <ol className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-label="Setup progress">
          {labels.map((label, i) => {
            const n = i + 1;
            const state = n === step ? "current" : n < step || (reached && n <= reached) ? "done" : "todo";
            const bar = (
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-colors",
                  state === "current" ? "bg-primary" : state === "done" ? "bg-primary/35" : "bg-border",
                )}
              />
            );
            const canJump = reached !== undefined && n !== step && n <= Math.max(reached, step);
            return (
              <li key={label} aria-current={n === step ? "step" : undefined}>
                {canJump ? (
                  <Link href={`/onboarding?step=${n}`} className="block py-1" title={`${n}. ${label}`} aria-label={`Go to step ${n}: ${label}`}>
                    {bar}
                  </Link>
                ) : (
                  <span className="block py-1" title={`${n}. ${label}`}>
                    <span className="sr-only">{`Step ${n}: ${label}${state === "done" ? " (visited)" : ""}`}</span>
                    {bar}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <div className="rounded-xl border bg-background shadow-sm">
        <div className="px-6 pb-2 pt-7 sm:px-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="px-6 pb-7 pt-5 sm:px-8">{children}</div>
      </div>
    </div>
  );
}

function ContinueButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function SkipButton({ step }: { step: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" formAction={skipStepAction.bind(null, step)} formNoValidate disabled={pending}>
      Skip for now
    </Button>
  );
}

/** Back / Skip / Continue row. Must be rendered inside the step's <form>. */
export function StepFooter({
  step,
  state,
  continueLabel = "Continue",
  skippable = true,
  backHref,
}: {
  step: number;
  state?: ActionResult<unknown> | null;
  continueLabel?: string;
  skippable?: boolean;
  backHref?: string | null;
}) {
  const back = backHref === undefined ? (step > 1 ? `/onboarding?step=${step - 1}` : null) : backHref;
  return (
    <div className="mt-8 border-t pt-5">
      {state && !state.ok ? (
        <p className="mb-4 text-[13px] text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back ? (
          <Link href={back} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Back
          </Link>
        ) : (
          <span />
        )}
        {/* Continue comes first in the DOM so pressing Enter submits it, not Skip. */}
        <div className="flex flex-row-reverse items-center gap-2">
          <ContinueButton label={continueLabel} />
          {skippable ? <SkipButton step={step} /> : null}
        </div>
      </div>
    </div>
  );
}
