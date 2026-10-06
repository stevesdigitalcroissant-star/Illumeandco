"use client";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";

/** Pending state for ActionForm (which submits via onSubmit, so useFormStatus can't see it). */
const PendingContext = createContext(false);

export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const formStatus = useFormStatus();
  const pending = useContext(PendingContext) || formStatus.pending;
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (!state.ok) return <p className="text-[13px] text-danger" role="alert">{state.error}</p>;
  return state.message ? <p className="text-[13px] text-success">{state.message}</p> : null;
}

/** A form bound to a server action returning ActionResult, with inline status. */
export function ActionForm<T>({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
}: {
  action: (prev: ActionResult<T> | null, fd: FormData) => Promise<ActionResult<T>>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionResult<T> | null, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    // Submitting through onSubmit (not the form `action` prop) avoids React's automatic
    // form reset, so a validation error keeps what the user typed. We reset on success only.
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className={cn("space-y-4", className)}
    >
      <PendingContext.Provider value={pending}>
        {children}
        <FormMessage state={state as ActionResult<unknown> | null} />
      </PendingContext.Provider>
    </form>
  );
}
