"use client";
import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { contactSalesAction } from "./actions";

export function ContactForm({ locations }: { locations: readonly string[] }) {
  const [state, action, pending] = useActionState(contactSalesAction, null);
  if (state?.ok)
    return (
      <div className="rounded-xl border bg-background p-8 text-center" role="status">
        <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden />
        <p className="mt-4 text-lg font-semibold">{state.message}</p>
        <p className="mt-2 text-sm text-muted-foreground">We&apos;ll reply to the email you gave us.</p>
      </div>
    );
  return (
    <form action={action} className="space-y-4 rounded-xl border bg-background p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name"><Input name="name" required maxLength={120} autoComplete="name" /></Field>
        <Field label="Work email"><Input name="email" type="email" required maxLength={200} autoComplete="email" /></Field>
        <Field label="Organization"><Input name="organization" required maxLength={160} autoComplete="organization" /></Field>
        <Field label="Phone (optional)"><Input name="phone" type="tel" maxLength={40} autoComplete="tel" /></Field>
      </div>
      <Field label="Number of locations">
        <NativeSelect name="locations" required defaultValue="">
          <option value="" disabled>Choose…</option>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </NativeSelect>
      </Field>
      <Field label="What do you need? (optional)" hint="Monthly volume, systems you use, languages, anything else.">
        <Textarea name="message" maxLength={3000} className="min-h-[110px]" />
      </Field>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {state && !state.ok ? <p className="text-[13px] text-danger" role="alert">{state.error}</p> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Talk to us
      </Button>
      <p className="text-center text-xs text-muted-foreground">We only use these details to reply to you.</p>
    </form>
  );
}
