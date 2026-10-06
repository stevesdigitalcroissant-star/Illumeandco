"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./button";

export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
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
  const [state, formAction] = useActionState<ActionResult<T> | null, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={cn("space-y-4", className)}>
      {children}
      <FormMessage state={state as ActionResult<unknown> | null} />
    </form>
  );
}
