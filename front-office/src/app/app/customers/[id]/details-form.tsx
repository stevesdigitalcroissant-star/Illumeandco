"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { updateCustomerAction } from "../actions";

export function CustomerDetailsForm({
  customer,
}: {
  customer: { id: string; name: string | null; phone: string | null; email: string | null; notes: string | null; tags: string[]; optedOut: boolean };
}) {
  const [optedOut, setOptedOut] = useState(customer.optedOut);
  return (
    <ActionForm action={updateCustomerAction.bind(null, customer.id)}>
      <Field label="Name">
        <Input name="name" defaultValue={customer.name ?? ""} placeholder="Full name" />
      </Field>
      <Field label="Phone">
        <Input name="phone" defaultValue={customer.phone ?? ""} inputMode="tel" placeholder="+971 50 123 4567" />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" defaultValue={customer.email ?? ""} placeholder="name@example.com" />
      </Field>
      <Field label="Tags" hint="Comma separated, e.g. vip, invisalign">
        <Input name="tags" defaultValue={customer.tags.join(", ")} />
      </Field>
      <Field label="Internal notes">
        <Textarea name="notes" defaultValue={customer.notes ?? ""} rows={3} placeholder="Only visible to your team" />
      </Field>
      <label className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5">
        <span>
          <span className="block text-[13px] font-medium">Opted out of messages</span>
          <span className="block text-xs text-muted-foreground">The AI, reminders and follow-ups won&apos;t contact this customer.</span>
        </span>
        <Switch checked={optedOut} onCheckedChange={setOptedOut} aria-label="Opted out of messages" />
      </label>
      {optedOut ? <input type="hidden" name="optedOut" value="on" /> : null}
      <div className="flex justify-end">
        <SubmitButton size="sm">Save changes</SubmitButton>
      </div>
    </ActionForm>
  );
}
