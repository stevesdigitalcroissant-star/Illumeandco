"use client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { createCustomerAction } from "./actions";

export function NewCustomerDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add customer
        </Button>
      </DialogTrigger>
      <DialogContent title="Add customer" description="If someone with this phone or email already exists, you'll be taken to their profile.">
        <ActionForm action={createCustomerAction}>
          <Field label="Name">
            <Input name="name" required autoFocus placeholder="Full name" />
          </Field>
          <Field label="Phone">
            <Input name="phone" inputMode="tel" placeholder="Mobile number" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" placeholder="name@example.com" />
          </Field>
          <div className="flex justify-end">
            <SubmitButton pendingText="Adding…">Add customer</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
