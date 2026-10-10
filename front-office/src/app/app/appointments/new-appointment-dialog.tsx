"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Check, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { cn, formatMoney } from "@/lib/utils";
import type { Slot } from "@/server/services/availability";
import { bookAppointmentAction, searchCustomersAction, type CustomerHit } from "./actions";
import { SlotPicker, type StaffOption } from "./slot-picker";

export type ServiceOption = { id: string; name: string; durationMinutes: number; priceCents: number | null; priceFrom: boolean; staffIds: string[] };

export function NewAppointmentDialog({
  services,
  staff,
  timezone,
  currency,
  maxAdvanceDays,
  presetCustomer,
  trigger,
}: {
  services: ServiceOption[];
  staff: StaffOption[];
  timezone: string;
  currency: string;
  maxAdvanceDays: number;
  presetCustomer?: CustomerHit;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> New appointment
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title="New appointment" description="Times shown are real availability in business time." wide>
        <BookingForm
          key={key}
          services={services}
          staff={staff}
          timezone={timezone}
          currency={currency}
          maxAdvanceDays={maxAdvanceDays}
          presetCustomer={presetCustomer}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function BookingForm({
  services,
  staff,
  timezone,
  currency,
  maxAdvanceDays,
  presetCustomer,
  onDone,
}: {
  services: ServiceOption[];
  staff: StaffOption[];
  timezone: string;
  currency: string;
  maxAdvanceDays: number;
  presetCustomer?: CustomerHit;
  onDone: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [customer, setCustomer] = useState<CustomerHit | null>(presetCustomer ?? null);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", email: "" });
  const [serviceId, setServiceId] = useState<string>("");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const service = services.find((s) => s.id === serviceId) ?? null;
  const staffForService = service ? (service.staffIds.length ? staff.filter((s) => service.staffIds.includes(s.id)) : staff) : [];
  const customerReady = mode === "existing" ? !!customer : !!newCustomer.name.trim() && !!(newCustomer.phone.trim() || newCustomer.email.trim());

  const submit = () =>
    start(async () => {
      setError(null);
      if (!slot || !service) return;
      const res = await bookAppointmentAction({
        serviceId: service.id,
        startsAt: slot.startsAt,
        staffId: slot.staffId,
        customerId: mode === "existing" ? customer?.id : null,
        newCustomer: mode === "new" ? newCustomer : null,
        notes,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Booked ${res.data!.serviceName} with ${res.data!.staffName} — ${res.data!.label}.`);
      router.refresh();
      setTimeout(onDone, 1200);
    });

  if (success)
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-5" />
        </span>
        <p className="text-sm font-medium">{success}</p>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Customer */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Customer</Label>
          {!presetCustomer ? (
            <div className="inline-flex rounded-md border p-0.5 text-[12.5px]">
              {(["existing", "new"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn("rounded px-2.5 py-0.5 font-medium", mode === m ? "bg-muted text-foreground" : "text-muted-foreground")}
                >
                  {m === "existing" ? "Existing" : "New customer"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {mode === "existing" ? (
          customer ? (
            <div className="flex items-center gap-3 rounded-md border px-3 py-2">
              <Avatar name={customer.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{customer.name ?? "Unnamed customer"}</p>
                <p className="truncate text-xs text-muted-foreground">{[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details"}</p>
              </div>
              {!presetCustomer ? (
                <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setCustomer(null)} aria-label="Change customer">
                  <X />
                </Button>
              ) : null}
            </div>
          ) : (
            <CustomerSearch onPick={setCustomer} onCreateNew={() => setMode("new")} />
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name">
              <Input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="Full name" autoFocus />
            </Field>
            <Field label="Phone">
              <Input value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="Mobile number" inputMode="tel" />
            </Field>
            <Field label="Email">
              <Input value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} placeholder="name@example.com" type="email" />
            </Field>
            <p className="text-xs text-muted-foreground sm:col-span-3">Phone or email is required. If they already exist, the existing customer is used.</p>
          </div>
        )}
      </section>

      {/* Service */}
      <section className="space-y-2">
        <Label>Service</Label>
        {services.length ? (
          <NativeSelect
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setSlot(null);
            }}
          >
            <option value="">Choose a service…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.durationMinutes} min · {formatMoney(s.priceCents, currency, { from: s.priceFrom })}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <p className="text-[13px] text-muted-foreground">No active services yet. Add services in Settings first.</p>
        )}
      </section>

      {/* Time */}
      <section>
        <SlotPicker
          key={serviceId}
          serviceId={serviceId || null}
          timezone={timezone}
          staffOptions={staffForService}
          maxAdvanceDays={maxAdvanceDays}
          selected={slot}
          onSelect={setSlot}
        />
      </section>

      <Field label="Notes (optional)">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Visible to your team only" className="min-h-[60px]" />
      </Field>

      {slot && service ? (
        <div className="rounded-md bg-surface px-3 py-2.5 text-[13px]">
          <span className="font-medium">{service.name}</span> with <span className="font-medium">{slot.staffName}</span> ·{" "}
          {DateTime.fromISO(slot.startsAt).setZone(timezone).toFormat("cccc d LLLL, h:mm a")}
        </div>
      ) : null}
      {error ? (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={!slot || !service || !customerReady || pending}>
          {pending ? "Booking…" : "Book appointment"}
        </Button>
      </div>
    </div>
  );
}

function CustomerSearch({ onPick, onCreateNew }: { onPick: (c: CustomerHit) => void; onCreateNew: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[] | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const search = (value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) {
      setHits(null);
      return;
    }
    timer.current = setTimeout(() => {
      const id = ++seq.current;
      start(async () => {
        const res = await searchCustomersAction(value);
        if (id === seq.current) setHits(res.ok ? (res.data ?? []) : []);
      });
    }, 220);
  };

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => search(e.target.value)} placeholder="Search by name, phone or email" className="pl-8" autoFocus />
      </div>
      {hits ? (
        <ul className="max-h-48 overflow-y-auto rounded-md border">
          {hits.length ? (
            hits.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onPick(c)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted">
                  <Avatar name={c.name} className="size-7" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{c.name ?? "Unnamed customer"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2.5 text-[13px] text-muted-foreground">
              {pending ? "Searching…" : (
                <>
                  No match.{" "}
                  <button type="button" onClick={onCreateNew} className="font-medium text-primary hover:underline">
                    Create a new customer
                  </button>
                </>
              )}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
