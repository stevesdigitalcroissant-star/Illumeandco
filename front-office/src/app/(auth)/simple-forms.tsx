"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { forgotPasswordAction, resetPasswordAction } from "./actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);
  if (state?.ok) return <p className="rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-[13px] text-success">{state.message}</p>;
  return (
    <form action={action} className="space-y-4">
      <Field label="Email"><Input name="email" type="email" autoComplete="email" required /></Field>
      {state && !state.ok ? <p className="text-[13px] text-danger" role="alert">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Please wait…" : "Send reset link"}</Button>
      <p className="text-center text-[13px] text-muted-foreground"><Link className="font-medium text-foreground hover:underline" href="/login">Back to sign in</Link></p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="New password" hint="At least 10 characters."><Input name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
      <Field label="Repeat new password"><Input name="confirm" type="password" autoComplete="new-password" minLength={10} required /></Field>
      {state && !state.ok ? <p className="text-[13px] text-danger" role="alert">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Please wait…" : "Set new password"}</Button>
    </form>
  );
}
