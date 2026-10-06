"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Play, Plus, X } from "lucide-react";
import type { FollowUpConfig, MissedOpportunityConfig, ReminderConfig, ReviewConfig } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/action";
import type { TickReport } from "@/server/jobs/tick";
import { cn } from "@/lib/utils";
import { runAutomationsNowAction, saveAutomationSettingsAction } from "./actions";
import { FOLLOW_UP_STYLES, renderPreview, type FollowUpStyle } from "./preview";

type Sample = { customer_name: string; service: string; business: string; date: string; time: string; review_link: string };

function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const save = (patch: Parameters<typeof saveAutomationSettingsAction>[0]) =>
    start(async () => {
      const r = await saveAutomationSettingsAction(patch);
      setState(r);
      if (r.ok) router.refresh();
    });
  return { pending, state, save, clear: () => setState(null) };
}

function SaveBar({ pending, state, dirty, onSave, onReset }: { pending: boolean; state: ActionResult<unknown> | null; dirty: boolean; onSave: () => void; onReset: () => void }) {
  return (
    <div className="sticky bottom-0 flex items-center justify-end gap-3 rounded-b-lg border-t bg-background/95 px-5 py-3 backdrop-blur">
      <div className="mr-auto text-[13px]">
        {state && !state.ok ? <span className="text-danger" role="alert">{state.error}</span> : dirty ? <span className="text-muted-foreground">Unsaved changes</span> : state?.ok ? <span className="text-success">Saved</span> : null}
      </div>
      {dirty ? <Button variant="ghost" size="sm" onClick={onReset} disabled={pending}>Discard</Button> : null}
      <Button size="sm" onClick={onSave} disabled={pending || !dirty}>{pending ? "Saving…" : "Save changes"}</Button>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange, locked, id }: { label: string; description?: string; checked: boolean; onChange?: (v: boolean) => void; locked?: boolean; id: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
          {label}
          {locked ? <Lock className="size-3 text-muted-foreground" aria-label="Always on" /> : null}
        </label>
        {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={locked} aria-label={label} />
    </div>
  );
}

const numOr = (v: string, fallback: number) => (v === "" || Number.isNaN(Number(v)) ? fallback : Number(v));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ─── Follow-ups ─────────────────────────────────────────────────────
export function FollowUpCard({ initial, sample }: { initial: FollowUpConfig; sample: Sample }) {
  const [v, setV] = useState(initial);
  const { pending, state, save, clear } = useSave();
  const set = (p: Partial<FollowUpConfig>) => {
    clear();
    setV({ ...v, ...p });
  };
  const dirty = !same(v, initial);
  return (
    <Card id="follow-ups">
      <CardHeader
        title="AI follow-ups"
        description="When someone asks about a service but doesn't book, the AI checks back in."
        action={<Switch checked={v.enabled} onCheckedChange={(c) => set({ enabled: c })} aria-label="Enable AI follow-ups" />}
      />
      <CardBody className={cn("space-y-6", !v.enabled && "opacity-60")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Wait before following up" hint="1–720 hours after the last message.">
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={720} value={v.delayHours} onChange={(e) => set({ delayHours: numOr(e.target.value, 0) })} className="w-28" />
              <span className="text-sm text-muted-foreground">hours</span>
            </div>
          </Field>
          <Field label="Maximum attempts" hint="Never more than 5 messages per enquiry.">
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={5} value={v.maxAttempts} onChange={(e) => set({ maxAttempts: numOr(e.target.value, 0) })} className="w-28" />
              <span className="text-sm text-muted-foreground">messages</span>
            </div>
          </Field>
        </div>

        <div>
          <Label>Message style</Label>
          <div className="mt-2 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Message style">
            {(Object.keys(FOLLOW_UP_STYLES) as FollowUpStyle[]).map((k) => {
              const s = FOLLOW_UP_STYLES[k];
              const active = v.style === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set({ style: k })}
                  className={cn("rounded-lg border p-3.5 text-left transition-colors hover:border-foreground/30", active && "border-primary ring-1 ring-primary")}
                >
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{s.description}</span>
                  <span className="mt-3 block rounded-md bg-muted px-3 py-2 text-[12.5px] leading-relaxed text-foreground/80">
                    {s.preview(sample.customer_name, sample.service.toLowerCase())}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label>Stop conditions</Label>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Pending follow-ups are cancelled the moment any of these happens. The first four can&apos;t be turned off.</p>
          <div className="mt-2 divide-y rounded-lg border px-4">
            <ToggleRow id="stop-reply" label="Customer replies" checked locked />
            <ToggleRow id="stop-optout" label="Customer opts out" checked locked />
            <ToggleRow id="stop-booked" label="Appointment is booked" checked locked />
            <ToggleRow id="stop-human" label="A team member takes over the conversation" checked locked />
            <ToggleRow id="stop-lost" label="Lead is marked lost" description="Optional — stop chasing leads your team has closed." checked={v.stopWhenLeadLost} onChange={(c) => set({ stopWhenLeadLost: c })} />
          </div>
        </div>
      </CardBody>
      <SaveBar pending={pending} state={state} dirty={dirty} onReset={() => setV(initial)} onSave={() => save({ followUp: v })} />
    </Card>
  );
}

// ─── Reminders ──────────────────────────────────────────────────────
const VARS = ["customer_name", "service", "business", "date", "time"];

function TemplateField({ label, value, onChange, sample, vars = VARS }: { label: string; value: string; onChange: (v: string) => void; sample: Sample; vars?: string[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Field label={label} hint={<>Variables: {vars.map((x) => <code key={x} className="mr-1 rounded bg-muted px-1 py-px text-[11px]">{`{{${x}}}`}</code>)}</>}>
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} maxLength={1000} className="min-h-[88px]" />
      </Field>
      <div className="space-y-1.5">
        <p className="text-[13px] font-medium text-muted-foreground">Preview</p>
        <div className="rounded-lg rounded-tl-sm bg-muted px-3.5 py-2.5 text-[13px] leading-relaxed">{renderPreview(value, sample) || <span className="text-muted-foreground">Empty message</span>}</div>
      </div>
    </div>
  );
}

export function RemindersCard({ initial, sample }: { initial: ReminderConfig; sample: Sample }) {
  const [v, setV] = useState(initial);
  const { pending, state, save, clear } = useSave();
  const set = (p: Partial<ReminderConfig>) => {
    clear();
    setV({ ...v, ...p });
  };
  const setTpl = (k: keyof ReminderConfig["templates"], t: string) => set({ templates: { ...v.templates, [k]: t } });
  return (
    <Card id="reminders">
      <CardHeader title="Appointment reminders" description="Fewer no-shows. Reminders are cancelled automatically if the appointment is cancelled or moved." />
      <CardBody className="space-y-6">
        <section className="space-y-3">
          <ToggleRow id="rem-conf" label="Booking confirmation" description="Sent right after a booking made by your team or online. Bookings made in chat are confirmed in the conversation." checked={v.confirmation} onChange={(c) => set({ confirmation: c })} />
          {v.confirmation ? <TemplateField label="Confirmation message" value={v.templates.confirmation} onChange={(t) => setTpl("confirmation", t)} sample={sample} /> : null}
        </section>
        <section className="space-y-3 border-t pt-3">
          <ToggleRow id="rem-24" label="24-hour reminder" description="Sent the day before." checked={v.reminder24h} onChange={(c) => set({ reminder24h: c })} />
          {v.reminder24h ? <TemplateField label="24-hour reminder message" value={v.templates.reminder_24h} onChange={(t) => setTpl("reminder_24h", t)} sample={sample} /> : null}
        </section>
        <section className="space-y-3 border-t pt-3">
          <ToggleRow id="rem-same" label="Same-day reminder" description="Sent a few hours before the appointment." checked={v.sameDay} onChange={(c) => set({ sameDay: c })} />
          {v.sameDay ? (
            <>
              <Field label="Send this many hours before" hint="1–12 hours.">
                <Input type="number" min={1} max={12} value={v.sameDayHoursBefore} onChange={(e) => set({ sameDayHoursBefore: numOr(e.target.value, 0) })} className="w-28" />
              </Field>
              <TemplateField label="Same-day reminder message" value={v.templates.same_day} onChange={(t) => setTpl("same_day", t)} sample={sample} />
            </>
          ) : null}
        </section>
      </CardBody>
      <SaveBar pending={pending} state={state} dirty={!same(v, initial)} onReset={() => setV(initial)} onSave={() => save({ reminders: v })} />
    </Card>
  );
}

// ─── Reviews ────────────────────────────────────────────────────────
export function ReviewsCard({ initial, sample }: { initial: ReviewConfig; sample: Sample }) {
  const [v, setV] = useState(initial);
  const { pending, state, save, clear } = useSave();
  const set = (p: Partial<ReviewConfig>) => {
    clear();
    setV({ ...v, ...p });
  };
  const setLink = (i: number, p: Partial<ReviewConfig["links"][number]>) => set({ links: v.links.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  return (
    <Card id="reviews">
      <CardHeader
        title="Review requests"
        description="After a completed appointment, ask for a rating. Happy customers get your public review links; unhappy ones are routed privately to you."
        action={<Switch checked={v.enabled} onCheckedChange={(c) => set({ enabled: c })} aria-label="Enable review requests" />}
      />
      <CardBody className={cn("space-y-6", !v.enabled && "opacity-60")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Send after the appointment is completed" hint="1–720 hours.">
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={720} value={v.delayHours} onChange={(e) => set({ delayHours: numOr(e.target.value, 0) })} className="w-28" />
              <span className="text-sm text-muted-foreground">hours</span>
            </div>
          </Field>
          <Field label="Positive rating threshold" hint={`Ratings of ${v.positiveThreshold}★ or more see your public links; lower ratings stay private.`}>
            <div className="flex gap-1" role="radiogroup" aria-label="Positive rating threshold">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={v.positiveThreshold === n} onClick={() => set({ positiveThreshold: n })} className={cn("h-9 w-10 rounded-md border text-sm font-medium", v.positiveThreshold === n ? "border-primary bg-primary-soft text-primary" : "hover:bg-muted")}>
                  {n}★
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div>
          <Label>Public review links</Label>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Shown only to customers who rate {v.positiveThreshold}★ or higher.</p>
          <div className="mt-2 space-y-2">
            {v.links.map((l, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label="Link label" placeholder="Google" value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} className="w-36 shrink-0" maxLength={60} />
                <Input aria-label="Link URL" placeholder="https://g.page/r/…" type="url" value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} />
                <Button variant="ghost" size="icon" onClick={() => set({ links: v.links.filter((_, j) => j !== i) })} aria-label="Remove link"><X /></Button>
              </div>
            ))}
            {!v.links.length ? <Notice tone="warning">No public links yet — positive reviewers will just see a thank-you message.</Notice> : null}
            {v.links.length < 6 ? (
              <Button variant="outline" size="sm" onClick={() => set({ links: [...v.links, { label: "", url: "" }] })}><Plus /> Add link</Button>
            ) : null}
          </div>
        </div>
        <TemplateField label="Request message" value={v.template} onChange={(t) => set({ template: t })} sample={sample} vars={["customer_name", "service", "business", "review_link"]} />
      </CardBody>
      <SaveBar pending={pending} state={state} dirty={!same(v, initial)} onReset={() => setV(initial)} onSave={() => save({ reviews: v })} />
    </Card>
  );
}

// ─── Missed opportunities ───────────────────────────────────────────
export function MissedCard({ initial }: { initial: MissedOpportunityConfig }) {
  const [v, setV] = useState(initial);
  const { pending, state, save, clear } = useSave();
  const set = (p: Partial<MissedOpportunityConfig>) => {
    clear();
    setV({ ...v, ...p });
  };
  return (
    <Card id="missed">
      <CardHeader title="Missed-opportunity thresholds" description="When something shows up on the Missed opportunities page." />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label="Lead goes stale after" hint="A lead with no contact for this long is flagged (1–720 hours).">
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={720} value={v.staleLeadHours} onChange={(e) => set({ staleLeadHours: numOr(e.target.value, 0) })} className="w-28" />
            <span className="text-sm text-muted-foreground">hours</span>
          </div>
        </Field>
        <Field label="Customer hasn't returned in" hint="Past customers with no visit for this long are flagged (7–730 days).">
          <div className="flex items-center gap-2">
            <Input type="number" min={7} max={730} value={v.noReturnDays} onChange={(e) => set({ noReturnDays: numOr(e.target.value, 0) })} className="w-28" />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </Field>
      </CardBody>
      <SaveBar pending={pending} state={state} dirty={!same(v, initial)} onReset={() => setV(initial)} onSave={() => save({ missedOpportunities: v })} />
    </Card>
  );
}

// ─── Run now ────────────────────────────────────────────────────────
export function RunNowButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult<TickReport> | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await runAutomationsNowAction();
            setState(r);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Play />} Run due automations now
      </Button>
      {state && !state.ok ? <p className="text-[13px] text-danger">{state.error}</p> : null}
      {state?.ok && state.data ? (
        <div className="max-w-sm text-right text-[13px]" role="status">
          {!state.data.ran ? (
            <span className="text-warning">Another run is in progress — try again in a moment.</span>
          ) : (
            <span className="text-muted-foreground">
              Processed <b className="text-foreground">{state.data.followUps}</b> follow-ups, <b className="text-foreground">{state.data.reminders}</b> reminders and <b className="text-foreground">{state.data.reviews}</b> review requests.
              {state.data.errors.length ? <span className="block text-danger">{state.data.errors.length} error(s): {state.data.errors.slice(0, 2).join("; ")}</span> : null}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ChannelBadge({ status }: { status: "active" | "config" | "na" }) {
  return status === "active" ? <Badge tone="success">Active</Badge> : status === "config" ? <Badge tone="warning">Configuration required</Badge> : <Badge tone="outline">Not available yet</Badge>;
}
