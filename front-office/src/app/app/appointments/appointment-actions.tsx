"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { DateTime } from "luxon";
import { Ban, CalendarClock, Check, CheckCheck, MoreHorizontal, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Slot } from "@/server/services/availability";
import { cancelAppointmentAction, rescheduleAppointmentAction, setOutcomeAction } from "./actions";
import { SlotPicker, type StaffOption } from "./slot-picker";

export type ApptSummary = {
  id: string;
  status: string;
  startsAt: string;
  /** Computed on the server: the start time has passed. */
  started: boolean;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  customerName: string;
};

const itemClass = "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground";

export function AppointmentActions({
  appt,
  timezone,
  staffOptions,
  maxAdvanceDays,
  align = "end",
}: {
  appt: ApptSummary;
  timezone: string;
  staffOptions: StaffOption[];
  maxAdvanceDays: number;
  align?: "start" | "end";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"reschedule" | "cancel" | null>(null);
  const active = appt.status === "booked" || appt.status === "confirmed";
  const started = appt.started;
  if (!active) return null;

  const outcome = (o: "completed" | "no_show" | "confirmed") =>
    start(async () => {
      setError(null);
      const res = await setOutcomeAction(appt.id, o);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });

  return (
    <div className={cn("flex flex-col gap-1", align === "end" ? "items-end" : "items-start")}>
      <div className="flex items-center gap-1">
        {started ? (
          <Button size="sm" variant="outline" onClick={() => outcome("completed")} disabled={pending}>
            <CheckCheck /> Completed
          </Button>
        ) : appt.status === "booked" ? (
          <Button size="sm" variant="outline" onClick={() => outcome("confirmed")} disabled={pending}>
            <Check /> Confirm
          </Button>
        ) : null}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button size="icon" variant="ghost" className="size-8" aria-label="More actions" disabled={pending}>
              <MoreHorizontal />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align={align} sideOffset={4} className="z-50 min-w-48 rounded-lg border bg-background p-1 shadow-lg">
              {appt.status === "booked" && started ? (
                <DropdownMenu.Item className={itemClass} onSelect={() => outcome("confirmed")}>
                  <Check /> Confirm
                </DropdownMenu.Item>
              ) : null}
              {!started ? (
                <DropdownMenu.Item className={itemClass} onSelect={() => outcome("completed")}>
                  <CheckCheck /> Mark completed
                </DropdownMenu.Item>
              ) : null}
              <DropdownMenu.Item className={itemClass} onSelect={() => outcome("no_show")}>
                <UserX /> Mark no-show
              </DropdownMenu.Item>
              <DropdownMenu.Item className={itemClass} onSelect={() => setDialog("reschedule")}>
                <CalendarClock /> Reschedule…
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item className={cn(itemClass, "text-danger [&_svg]:text-danger")} onSelect={() => setDialog("cancel")}>
                <Ban /> Cancel appointment…
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {error ? (
        <p role="alert" className="max-w-56 text-right text-xs text-danger">
          {error}
        </p>
      ) : null}

      <Dialog open={dialog === "reschedule"} onOpenChange={(o) => setDialog(o ? "reschedule" : null)}>
        {dialog === "reschedule" ? (
          <DialogContent title="Reschedule appointment" description={`${appt.serviceName} for ${appt.customerName}`} wide>
            <RescheduleForm appt={appt} timezone={timezone} staffOptions={staffOptions} maxAdvanceDays={maxAdvanceDays} onDone={() => setDialog(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
      <Dialog open={dialog === "cancel"} onOpenChange={(o) => setDialog(o ? "cancel" : null)}>
        {dialog === "cancel" ? (
          <DialogContent title="Cancel appointment?" description={`${appt.serviceName} for ${appt.customerName} · ${DateTime.fromISO(appt.startsAt).setZone(timezone).toFormat("ccc d LLL, h:mm a")}`}>
            <CancelForm appt={appt} onDone={() => setDialog(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function RescheduleForm({
  appt,
  timezone,
  staffOptions,
  maxAdvanceDays,
  onDone,
}: {
  appt: ApptSummary;
  timezone: string;
  staffOptions: StaffOption[];
  maxAdvanceDays: number;
  onDone: () => void;
}) {
  const router = useRouter();
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = DateTime.fromISO(appt.startsAt).setZone(timezone);

  const submit = () =>
    start(async () => {
      if (!slot) return;
      setError(null);
      const res = await rescheduleAppointmentAction(appt.id, slot.startsAt, slot.staffId);
      if (!res.ok) return setError(res.error);
      setDone(`Moved to ${res.data!.label} with ${res.data!.staffName}.`);
      router.refresh();
      setTimeout(onDone, 1200);
    });

  if (done)
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-5" />
        </span>
        <p className="text-sm font-medium">{done}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Reminders were rescheduled to match.</p>
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="rounded-md bg-surface px-3 py-2.5 text-[13px]">
        Currently <span className="font-medium">{current.toFormat("cccc d LLLL, h:mm a")}</span> with <span className="font-medium">{appt.staffName}</span>
      </div>
      <SlotPicker
        serviceId={appt.serviceId}
        timezone={timezone}
        staffOptions={staffOptions}
        initialStaffId={staffOptions.some((s) => s.id === appt.staffId) ? appt.staffId : ""}
        excludeAppointmentId={appt.id}
        maxAdvanceDays={maxAdvanceDays}
        selected={slot}
        onSelect={setSlot}
      />
      {slot ? (
        <p className="text-[13px]">
          New time: <span className="font-medium">{DateTime.fromISO(slot.startsAt).setZone(timezone).toFormat("cccc d LLLL, h:mm a")}</span> with{" "}
          <span className="font-medium">{slot.staffName}</span>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Keep current time
        </Button>
        <Button onClick={submit} disabled={!slot || pending}>
          {pending ? "Rescheduling…" : "Reschedule"}
        </Button>
      </div>
    </div>
  );
}

function CancelForm({ appt, onDone }: { appt: ApptSummary; onDone: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const res = await cancelAppointmentAction(appt.id, reason);
          if (!res.ok) return setError(res.error);
          router.refresh();
          onDone();
        });
      }}
    >
      <Field label="Reason" hint="Kept in the audit log. Pending reminders for this appointment are stopped.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Customer called to cancel" autoFocus />
      </Field>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Keep appointment
        </Button>
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel appointment"}
        </Button>
      </div>
    </form>
  );
}
