"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { loginAction, signupAction } from "./actions";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, action, pending] = useActionState(mode === "login" ? loginAction : signupAction, null);
  return (
    <form action={action} className="space-y-4">
      {mode === "signup" ? (
        <Field label="Your name">
          <Input name="name" autoComplete="name" required placeholder="Sara Ahmed" />
        </Field>
      ) : null}
      <Field label="Work email">
        <Input name="email" type="email" autoComplete="email" required placeholder="you@business.com" />
      </Field>
      <Field label="Password" hint={mode === "signup" ? "At least 10 characters." : undefined}>
        <Input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 10 : undefined} />
      </Field>
      {mode === "login" ? (
        <p className="-mt-2 text-right text-[13px]"><Link className="text-muted-foreground hover:text-foreground hover:underline" href="/forgot-password">Forgot password?</Link></p>
      ) : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state && !state.ok ? <p className="text-[13px] text-danger" role="alert">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-center text-[13px] text-muted-foreground">
        {mode === "login" ? (
          <>New here? <Link className="font-medium text-foreground hover:underline" href="/signup">Start free</Link></>
        ) : (
          <>Already have an account? <Link className="font-medium text-foreground hover:underline" href="/login">Sign in</Link></>
        )}
      </p>
    </form>
  );
}
