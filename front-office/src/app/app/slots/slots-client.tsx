"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";
import { addWaitlistAction, confirmSlotAction, dismissSlotAction, offerSlotAction, removeWaitlistAction, saveSlotSettingsAction, type WaitlistForm } from "./actions";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const exec = (fn: () => Promise<ActionResult<unknown>>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setState(r);
      if (r.ok) {
        router.refresh();
        onOk?.();
      }
    });
  return { pending, state, exec };
}

function Msg({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  return <span className={cn("text-[13px]", state.ok ? "text-success" : "text-danger")} role={state.ok ? undefined : "alert"}>{state.ok ? state.message : state.error}</span>;
}

export function SlotActions({ slotId, status, canOffer }: { slotId: string; status: string; canOffer: boolean }) {
  const { pending, state, exec } = useAction();
  const [value, setValue] = useState("");
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Msg state={state} />
      {status === "pending_staff" ? (
        <>
          <Input className="h-8 w-28" placeholder="Value (opt.)" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Booked value" />
          <Button size="sm" disabled={pending} onClick={() => exec(() => confirmSlotAction(slotId, value))}>Booked — mark recovered</Button>
        </>
      ) : canOffer ? (
        <Button size="sm" disabled={pending} onClick={() => exec(() => offerSlotAction(slotId))}><Send /> Recover slot</Button>
      ) : null}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => exec(() => dismissSlotAction(slotId))}>Dismiss</Button>
    </div>
  );
}

export function RemoveWaitlistButton({ id }: { id: string }) {
  const { pending, state, exec } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      {state && !state.ok ? <Msg state={state} /> : null}
      <Button variant="ghost" size="icon" className="size-8" aria-label="Remove from waitlist" disabled={pending} onClick={() => exec(() => removeWaitlistAction(id))}><Trash2 /></Button>
    </span>
  );
}

const PARTS = ["morning", "afternoon", "evening"] as const;

export function AddWaitlistForm({ customers, services, staff, today }: { customers: { id: string; label: string }[]; services: { id: string; name: string }[]; staff: { id: string; name: string }[]; today: string }) {
  const empty: WaitlistForm = { customerId: "", serviceId: "", staffId: "", earliestDate: today, latestDate: "", dayparts: [], notes: "" };
  const [f, setF] = useState<WaitlistForm>(empty);
  const { pending, state, exec } = useAction();
  return (
    <form className="grid gap-3 px-5 pb-5 sm:grid-cols-2" action={() => exec(() => addWaitlistAction(f), () => setF(empty))}>
      <Field label="Customer">
        <NativeSelect required value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
          <option value="">Choose…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Service">
        <NativeSelect required value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })}>
          <option value="">Choose…</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Earliest date"><Input type="date" required value={f.earliestDate} onChange={(e) => setF({ ...f, earliestDate: e.target.value })} /></Field>
      <Field label="Latest date" hint="Optional"><Input type="date" value={f.latestDate} onChange={(e) => setF({ ...f, latestDate: e.target.value })} /></Field>
      <Field label="Preferred staff" hint="Optional">
        <NativeSelect value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })}>
          <option value="">Anyone</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Time of day" hint="None selected = any time">
        <div className="flex gap-3 pt-1.5 text-sm">
          {PARTS.map((p) => (
            <label key={p} className="flex items-center gap-1.5 capitalize">
              <input type="checkbox" checked={f.dayparts.includes(p)} onChange={(e) => setF({ ...f, dayparts: e.target.checked ? [...f.dayparts, p] : f.dayparts.filter((x) => x !== p) })} />
              {p}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Notes" className="sm:col-span-2"><Input value={f.notes} maxLength={500} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <div className="flex items-center justify-end gap-3 sm:col-span-2">
        <span className="mr-auto"><Msg state={state} /></span>
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Adding…" : "Add to waitlist"}</Button>
      </div>
    </form>
  );
}

export function SlotSettingsCard({ initial, warning }: { initial: { enabled: boolean; autoOffer: boolean; batchSize: number; offerMinutes: number; template: string }; warning: string | null }) {
  const [f, setF] = useState(initial);
  const { pending, state, exec } = useAction();
  return (
    <Card>
      <CardHeader title="Slot recovery settings" description="Freed slots are ranked against your waitlist. Choose whether offers go out on their own or wait for your approval." />
      <div className="space-y-4 px-5 pb-5">
        <label className="flex items-center justify-between gap-4">
          <span><span className="block text-sm font-medium">Track freed slots</span><span className="block text-[13px] text-muted-foreground">Cancellations, reschedules and slot.opened events from your booking system.</span></span>
          <Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} aria-label="Track freed slots" />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span><span className="block text-sm font-medium">Offer automatically</span><span className="block text-[13px] text-muted-foreground">Off: a person clicks “Recover slot”. On: the top candidates get the offer within minutes (09:00–20:00).</span></span>
          <Switch checked={f.autoOffer} disabled={!f.enabled} onCheckedChange={(v) => setF({ ...f, autoOffer: v })} aria-label="Offer automatically" />
        </label>
        {warning ? <Notice tone="warning">{warning}</Notice> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="People offered at once" hint="First to reply YES gets it"><Input type="number" min={1} max={10} value={f.batchSize} onChange={(e) => setF({ ...f, batchSize: Number(e.target.value) })} /></Field>
          <Field label="Offer stays open (minutes)" hint="Then the next people are tried"><Input type="number" min={10} max={1440} value={f.offerMinutes} onChange={(e) => setF({ ...f, offerMinutes: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Offer message" hint="{{customer_name}}, {{service}}, {{when}} and {{business}} are filled in. Keep “Reply YES”.">
          <Textarea rows={3} maxLength={480} value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })} />
        </Field>
        <div className="flex items-center justify-end gap-3">
          <span className="mr-auto"><Msg state={state} /></span>
          <Button size="sm" disabled={pending} onClick={() => exec(() => saveSlotSettingsAction(f))}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </Card>
  );
}
