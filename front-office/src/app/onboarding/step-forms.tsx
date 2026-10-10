"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { CalendarCheck2, Check, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";
import {
  confirmCalendarAction,
  createBusinessAction,
  renameBusinessAction,
  saveHoursAction,
  saveLocationAction,
  savePoliciesAction,
  saveReceptionistAction,
  saveTypeAction,
} from "./actions";
import { CURRENCIES, EMOJI_OPTIONS, LANGUAGES, TONES, WEEKDAYS } from "./options";
import { StepFooter } from "./wizard";

type State = ActionResult<unknown> | null;

// ─── 1. Name ─────────────────────────────────────────────────────────
export function NameStep({ mode, defaultName, cancelHref }: { mode: "create" | "rename"; defaultName?: string; cancelHref?: string }) {
  const [state, action] = useActionState<State, FormData>(mode === "create" ? createBusinessAction : renameBusinessAction, null);
  return (
    <form action={action}>
      <Field label="Business name">
        <Input name="name" required maxLength={120} defaultValue={defaultName} placeholder="e.g. Harbour Dental Clinic" autoFocus autoComplete="organization" />
      </Field>
      <StepFooter step={1} state={state} skippable={false} backHref={mode === "create" ? (cancelHref ?? null) : null} continueLabel={mode === "create" ? "Create business" : "Continue"} />
    </form>
  );
}

// ─── 2. Type ─────────────────────────────────────────────────────────
export function TypeStep({ current, types }: { current: string; types: { value: string; label: string }[] }) {
  const [state, action] = useActionState<State, FormData>(saveTypeAction, null);
  return (
    <form action={action}>
      <fieldset>
        <legend className="sr-only">Business type</legend>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {types.map((t) => (
            <label
              key={t.value}
              className="group relative flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-surface has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/30"
            >
              <input type="radio" name="type" value={t.value} defaultChecked={t.value === current} className="sr-only" required />
              <span className="font-medium">{t.label}</span>
              <Check className="size-4 opacity-0 group-has-[:checked]:opacity-100" aria-hidden />
            </label>
          ))}
        </div>
      </fieldset>
      <StepFooter step={2} state={state} />
    </form>
  );
}

// ─── 3. Location ─────────────────────────────────────────────────────
type LocationValues = {
  address: string | null;
  city: string | null;
  country: string | null;
  countryCode: string | null;
  timezone: string;
  currency: string;
  phone: string | null;
  email: string | null;
  website: string | null;
};

export function LocationStep({ business, timezones, countries, guessTimezone }: { business: LocationValues; timezones: string[]; countries: { code: string; name: string; currency: string }[]; guessTimezone: boolean }) {
  const [state, action] = useActionState<State, FormData>(saveLocationAction, null);
  const tzRef = useRef<HTMLSelectElement>(null);
  const countryRef = useRef<HTMLSelectElement>(null);
  const currencyRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!guessTimezone) return;
    const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tzRef.current && guess && timezones.includes(guess)) tzRef.current.value = guess;
    // A new business: preselect the owner's country (from the browser) and its currency.
    if (!business.countryCode && countryRef.current) {
      let region: string | undefined;
      try {
        region = new Intl.Locale(navigator.language).maximize().region;
      } catch {}
      const c = countries.find((x) => x.code === region);
      if (c) {
        countryRef.current.value = c.code;
        if (currencyRef.current && [...currencyRef.current.options].some((o) => o.value === c.currency)) currencyRef.current.value = c.currency;
      }
    }
  }, [guessTimezone, timezones, countries, business.countryCode]);
  const tzList = timezones.includes(business.timezone) ? timezones : [business.timezone, ...timezones];
  const currencies = CURRENCIES.some((c) => c.code === business.currency) ? CURRENCIES : [{ code: business.currency, label: business.currency }, ...CURRENCIES];

  return (
    <form action={action} className="space-y-4">
      <Field label="Street address">
        <Input name="address" defaultValue={business.address ?? ""} autoComplete="street-address" placeholder="Building, street" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City">
          <Input name="city" defaultValue={business.city ?? ""} autoComplete="address-level2" />
        </Field>
        <Field label="Country" hint="Lets us read local phone numbers and use your emergency number.">
          <NativeSelect
            ref={countryRef}
            name="countryCode"
            defaultValue={business.countryCode ?? ""}
            required
            onChange={(e) => {
              const c = countries.find((x) => x.code === e.target.value);
              if (c && currencyRef.current && [...currencyRef.current.options].some((o) => o.value === c.currency)) currencyRef.current.value = c.currency;
            }}
          >
            <option value="" disabled>Choose…</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Timezone" hint="Used for every booking time.">
          <NativeSelect ref={tzRef} name="timezone" defaultValue={business.timezone} required>
            {tzList.map((tz) => (
              <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Currency">
          <NativeSelect ref={currencyRef} name="currency" defaultValue={business.currency} required>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone">
          <Input name="phone" type="tel" defaultValue={business.phone ?? ""} autoComplete="tel" placeholder="Your business number" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={business.email ?? ""} autoComplete="email" />
        </Field>
      </div>
      <Field label="Website" hint="Optional. You can import pages from it into the knowledge base later.">
        <Input name="website" defaultValue={business.website ?? ""} placeholder="https://yourbusiness.com" inputMode="url" />
      </Field>
      <StepFooter step={3} state={state} />
    </form>
  );
}

// ─── 4. Opening hours ────────────────────────────────────────────────
type Day = { open: boolean; from: string; to: string };

function defaultWeek(hours: { weekday: number; openTime: string; closeTime: string }[]): Record<number, Day> {
  const week: Record<number, Day> = {};
  for (const d of WEEKDAYS) {
    const rows = hours.filter((h) => h.weekday === d.n);
    if (hours.length) {
      week[d.n] = rows.length
        ? { open: true, from: rows[0]!.openTime, to: rows[rows.length - 1]!.closeTime }
        : { open: false, from: "09:00", to: "18:00" };
    } else {
      // Sensible starting point for a new business: Mon–Sat open, Sunday closed.
      week[d.n] = d.n === 7 ? { open: false, from: "09:00", to: "18:00" } : { open: true, from: d.n === 6 ? "10:00" : "09:00", to: d.n === 6 ? "16:00" : "18:00" };
    }
  }
  return week;
}

export function HoursStep({ hours }: { hours: { weekday: number; openTime: string; closeTime: string }[] }) {
  const [state, action] = useActionState<State, FormData>(saveHoursAction, null);
  const [week, setWeek] = useState(() => defaultWeek(hours));
  const set = (n: number, patch: Partial<Day>) => setWeek((w) => ({ ...w, [n]: { ...w[n]!, ...patch } }));
  const copyMonday = () =>
    setWeek((w) => {
      const next = { ...w };
      for (const d of WEEKDAYS) if (d.n !== 1 && next[d.n]!.open) next[d.n] = { ...next[d.n]!, from: w[1]!.from, to: w[1]!.to };
      return next;
    });

  return (
    <form action={action}>
      <ul className="divide-y rounded-lg border">
        {WEEKDAYS.map((d) => {
          const day = week[d.n]!;
          return (
            <li key={d.n} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="flex w-36 items-center gap-3">
                <Switch checked={day.open} onCheckedChange={(v) => set(d.n, { open: v })} aria-label={`Open on ${d.label}`} />
                {day.open ? <input type="hidden" name={`open_${d.n}`} value="on" /> : null}
                <span className="text-sm font-medium">{d.label}</span>
              </div>
              {day.open ? (
                <div className="flex items-center gap-2">
                  <Input type="time" name={`from_${d.n}`} value={day.from} onChange={(e) => set(d.n, { from: e.target.value })} className="w-[7.5rem]" aria-label={`${d.label} opening time`} required />
                  <span className="text-[13px] text-muted-foreground">to</span>
                  <Input type="time" name={`to_${d.n}`} value={day.to} onChange={(e) => set(d.n, { to: e.target.value })} className="w-[7.5rem]" aria-label={`${d.label} closing time`} required />
                </div>
              ) : (
                <span className="text-[13px] text-muted-foreground">Closed</span>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={copyMonday} className="mt-3 text-[13px] font-medium text-primary hover:underline">
        Copy Monday&apos;s hours to all open days
      </button>
      <StepFooter step={4} state={state} />
    </form>
  );
}

// ─── 8. Policies ─────────────────────────────────────────────────────
const POLICY_FIELDS = [
  { name: "cancellation", label: "Cancellation policy", placeholder: "e.g. Please give at least 24 hours' notice to cancel or reschedule." },
  { name: "refund", label: "Refund policy", placeholder: "e.g. Deposits are refundable up to 48 hours before your appointment." },
  { name: "late", label: "Late arrival policy", placeholder: "e.g. If you're more than 15 minutes late we may need to shorten or reschedule your appointment." },
  { name: "booking", label: "Booking policy", placeholder: "e.g. New patients should arrive 10 minutes early to complete a short form." },
] as const;

export function PoliciesStep({ policies }: { policies: Partial<Record<(typeof POLICY_FIELDS)[number]["name"], string>> }) {
  const [state, action] = useActionState<State, FormData>(savePoliciesAction, null);
  return (
    <form action={action} className="space-y-4">
      {POLICY_FIELDS.map((p) => (
        <Field key={p.name} label={p.label}>
          <Textarea name={p.name} defaultValue={policies[p.name] ?? ""} placeholder={p.placeholder} rows={3} maxLength={4000} />
        </Field>
      ))}
      <p className="text-xs text-muted-foreground">Leave any policy blank if it doesn&apos;t apply. The AI will hand refund requests to your team either way.</p>
      <StepFooter step={8} state={state} />
    </form>
  );
}

// ─── 9. Calendar ─────────────────────────────────────────────────────
const calendarAction = async (_: State, __: FormData) => confirmCalendarAction();

export function CalendarStep() {
  const [state, action] = useActionState<State, FormData>(calendarAction, null);
  const others = [
    { name: "Google Calendar", body: "Two-way sync with Google Calendar." },
    { name: "Microsoft Outlook", body: "Two-way sync with Outlook / Microsoft 365." },
    { name: "Other booking systems", body: "Fresha, Vagaro, Calendly and similar tools." },
  ];
  return (
    <form action={action}>
      <div className="rounded-lg border border-primary/30 bg-primary-soft/60 p-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-primary shadow-xs">
            <CalendarCheck2 className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">AI Front Office calendar</p>
              <Badge tone="success">Active</Badge>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Your built-in calendar is your booking system. The AI books here using your opening hours, services and staff — no setup needed. You can see and manage every appointment under Calendar.
            </p>
          </div>
        </div>
      </div>
      <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">External calendars</p>
      <ul className="divide-y rounded-lg border">
        {others.map((o) => (
          <li key={o.name} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground/70">{o.name}</p>
              <p className="text-[13px] text-muted-foreground">{o.body}</p>
            </div>
            <Badge tone="neutral" className="shrink-0">Not available yet</Badge>
          </li>
        ))}
      </ul>
      <StepFooter step={9} state={state} />
    </form>
  );
}

// ─── 10. AI receptionist ─────────────────────────────────────────────
type PermissionRow = { key: string; label: string; description: string; on: boolean; locked: boolean };

export function ReceptionistStep({
  agent,
  businessName,
  permissions,
}: {
  agent: { name: string; tone: string; greeting: string | null; emojiUsage: string; languages: string[] };
  businessName: string;
  permissions: PermissionRow[];
}) {
  const [state, action] = useActionState<State, FormData>(saveReceptionistAction, null);
  const [perms, setPerms] = useState(() => Object.fromEntries(permissions.map((p) => [p.key, p.on])));
  const [emoji, setEmoji] = useState(agent.emojiUsage);

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Receptionist name" hint="What it calls itself when chatting.">
          <Input name="name" defaultValue={agent.name} required maxLength={60} />
        </Field>
        <Field label="Tone">
          <NativeSelect name="tone" defaultValue={agent.tone}>
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Greeting" hint="The first message customers see. Leave blank to use a natural default.">
        <Textarea name="greeting" defaultValue={agent.greeting ?? ""} rows={2} maxLength={500} placeholder={`Hi! Welcome to ${businessName}. How can I help you today?`} />
      </Field>

      <fieldset className="space-y-1.5">
        <legend className="text-[13px] font-medium">Emoji usage</legend>
        <input type="hidden" name="emojiUsage" value={emoji} />
        <div className="inline-flex rounded-md border bg-surface p-0.5" role="radiogroup" aria-label="Emoji usage">
          {EMOJI_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={emoji === o.value}
              onClick={() => setEmoji(o.value)}
              className={cn(
                "rounded px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                emoji === o.value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium">Languages</legend>
        <p className="text-xs text-muted-foreground">The receptionist replies in the customer&apos;s language when it&apos;s one of these.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {LANGUAGES.map((l) => (
            <label
              key={l.code}
              className="cursor-pointer rounded-full border px-3 py-1 text-[13px] transition-colors hover:bg-surface has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/30"
            >
              <input type="checkbox" name="languages" value={l.code} defaultChecked={agent.languages.includes(l.code)} className="sr-only" />
              {l.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <Label>What the AI is allowed to do</Label>
        <ul className="mt-2 divide-y rounded-lg border">
          {permissions.map((p) => (
            <li key={p.key} className={cn("flex items-start justify-between gap-4 px-4 py-3", p.locked && "bg-surface")}>
              <div className="min-w-0">
                <p className={cn("flex items-center gap-1.5 text-sm font-medium", p.locked && "text-foreground/60")}>
                  {p.locked ? <Lock className="size-3.5" aria-hidden /> : null}
                  {p.label}
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{p.locked ? "Never available to the AI." : p.description}</p>
              </div>
              {p.locked ? (
                <Switch checked={false} disabled aria-label={`${p.label} (never available)`} className="mt-0.5" />
              ) : (
                <>
                  <Switch checked={!!perms[p.key]} onCheckedChange={(v) => setPerms((s) => ({ ...s, [p.key]: v }))} aria-label={p.label} className="mt-0.5" />
                  {perms[p.key] ? <input type="hidden" name={`perm_${p.key}`} value="on" /> : null}
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">The AI can always hand a conversation to your team. You can change all of this later.</p>
      </div>

      <StepFooter step={10} state={state} continueLabel="Finish setup" />
    </form>
  );
}
