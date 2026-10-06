"use client";
import { useActionState, useState, useTransition } from "react";
import { Clock, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import type { ActionResult } from "@/lib/action";
import { cn, formatMoney } from "@/lib/utils";
import { continueStepAction, removeServiceAction, removeStaffAction, saveServiceAction, saveStaffAction } from "./actions";
import { StepFooter } from "./wizard";

type State = ActionResult<unknown> | null;

/** Footer form for steps whose items are saved as they are added. */
function ContinueForm({ step, empty }: { step: number; empty: boolean }) {
  const [state, action] = useActionState<State, FormData>(continueStepAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="step" value={step} />
      <StepFooter step={step} state={state} skippable={empty} />
    </form>
  );
}

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => Promise<ActionResult<unknown>> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground hover:text-danger"
        aria-label={label}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await onRemove();
            setError(r.ok ? null : r.error);
          })
        }
      >
        <Trash2 />
      </Button>
      {error ? <span className="ml-1 text-xs text-danger" role="alert">{error}</span> : null}
    </>
  );
}

// ─── 5. Services ─────────────────────────────────────────────────────
type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  priceIsFrom: boolean;
  durationMinutes: number;
  onlineBookingEnabled: boolean;
  staffIds: string[];
};

function centsToInput(c: number | null) {
  if (c == null) return "";
  return Number.isInteger(c / 100) ? String(c / 100) : (c / 100).toFixed(2);
}

function ServiceEditor({ service, staff, currency, onDone }: { service?: ServiceRow; staff: { id: string; name: string }[]; currency: string; onDone: () => void }) {
  return (
    <ActionForm action={saveServiceAction} onSuccess={onDone} className="rounded-lg border bg-surface p-4">
      {service ? <input type="hidden" name="id" value={service.id} /> : null}
      <Field label="Service name">
        <Input name="name" required defaultValue={service?.name} placeholder="e.g. Teeth whitening" autoFocus maxLength={120} />
      </Field>
      <Field label="Description" hint="Optional. Helps the AI explain what's included.">
        <Textarea name="description" defaultValue={service?.description ?? ""} rows={2} maxLength={1000} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Price (${currency})`} hint="Leave blank for “price on request”.">
          <Input name="price" inputMode="decimal" defaultValue={centsToInput(service?.priceCents ?? null)} placeholder="0.00" />
        </Field>
        <Field label="Duration (minutes)">
          <Input name="durationMinutes" type="number" min={5} max={1440} step={5} required defaultValue={service?.durationMinutes ?? 30} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="priceIsFrom" defaultChecked={service?.priceIsFrom ?? false} className="size-4 accent-[var(--color-primary)]" />
        Price is a starting price (“from …”)
      </label>
      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium">Who performs it</legend>
        {staff.length ? (
          <>
            <div className="flex flex-wrap gap-2">
              {staff.map((s) => (
                <label
                  key={s.id}
                  className="cursor-pointer rounded-full border bg-background px-3 py-1 text-[13px] has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/30"
                >
                  <input type="checkbox" name="staffIds" value={s.id} defaultChecked={service?.staffIds.includes(s.id)} className="sr-only" />
                  {s.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">If nobody is selected, any team member can be booked for it. Availability follows their working hours.</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">You&apos;ll add your team in the next step. Until you assign someone, any team member can be booked for this service.</p>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="onlineBookingEnabled" defaultChecked={service?.onlineBookingEnabled ?? true} className="size-4 accent-[var(--color-primary)]" />
        Allow online booking — the AI can book this service
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <SubmitButton size="sm">{service ? "Save service" : "Add service"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ServicesStep({ services, staff, currency }: { services: ServiceRow[]; staff: { id: string; name: string }[]; currency: string }) {
  const [editing, setEditing] = useState<string | "new" | null>(services.length ? null : "new");
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name;

  return (
    <div>
      <div className="space-y-2">
        {services.map((s) =>
          editing === s.id ? (
            <ServiceEditor key={s.id} service={s} staff={staff} currency={currency} onDone={() => setEditing(null)} />
          ) : (
            <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg border px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                  <span>{formatMoney(s.priceCents, currency, { from: s.priceIsFrom })}</span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1"><Clock className="size-3" />{s.durationMinutes} min</span>
                  {s.staffIds.length ? (
                    <>
                      <span aria-hidden>·</span>
                      <span>{s.staffIds.map(staffName).filter(Boolean).join(", ")}</span>
                    </>
                  ) : null}
                  {!s.onlineBookingEnabled ? <Badge tone="neutral">Not bookable online</Badge> : null}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s.id)}>
                  <Pencil />
                </Button>
                <RemoveButton label={`Remove ${s.name}`} onRemove={() => removeServiceAction(s.id)} />
              </div>
            </div>
          ),
        )}
        {editing === "new" ? (
          <ServiceEditor staff={staff} currency={currency} onDone={() => setEditing(null)} />
        ) : (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className={cn("flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground")}
          >
            <Plus className="size-4" /> Add a service
          </button>
        )}
      </div>
      <ContinueForm step={5} empty={!services.length} />
    </div>
  );
}

// ─── 6. Staff ────────────────────────────────────────────────────────
type StaffRow = { id: string; name: string; title: string | null; email: string | null; phone: string | null };

function StaffEditor({ member, onDone }: { member?: StaffRow; onDone: () => void }) {
  return (
    <ActionForm action={saveStaffAction} onSuccess={onDone} className="rounded-lg border bg-surface p-4">
      {member ? <input type="hidden" name="id" value={member.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" required defaultValue={member?.name} placeholder="e.g. Dr. Layla Haddad" autoFocus maxLength={120} />
        </Field>
        <Field label="Title / role">
          <Input name="title" defaultValue={member?.title ?? ""} placeholder="e.g. Dentist" maxLength={120} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={member?.email ?? ""} />
        </Field>
        <Field label="Phone">
          <Input name="phone" type="tel" defaultValue={member?.phone ?? ""} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <SubmitButton size="sm">{member ? "Save" : "Add team member"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function StaffStep({ staff }: { staff: StaffRow[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(staff.length ? null : "new");
  return (
    <div>
      <Notice tone="neutral" className="mb-4">
        Everyone works your business opening hours by default. You can set individual working hours later — this step is just who&apos;s on the team.
      </Notice>
      <div className="space-y-2">
        {staff.map((m) =>
          editing === m.id ? (
            <StaffEditor key={m.id} member={m} onDone={() => setEditing(null)} />
          ) : (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserRound className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-[13px] text-muted-foreground">{[m.title, m.email, m.phone].filter(Boolean).join(" · ") || "No details yet"}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center">
                <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Edit ${m.name}`} onClick={() => setEditing(m.id)}>
                  <Pencil />
                </Button>
                <RemoveButton label={`Remove ${m.name}`} onRemove={() => removeStaffAction(m.id)} />
              </div>
            </div>
          ),
        )}
        {editing === "new" ? (
          <StaffEditor onDone={() => setEditing(null)} />
        ) : (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            <Plus className="size-4" /> Add a team member
          </button>
        )}
      </div>
      {!staff.length ? (
        <p className="mt-3 text-xs text-muted-foreground">The AI needs at least one team member before it can book appointments.</p>
      ) : null}
      <ContinueForm step={6} empty={!staff.length} />
    </div>
  );
}
