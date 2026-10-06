"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarCheck, MessageSquare, NotebookPen, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Avatar, Table } from "@/components/ui/misc";
import { LEAD_LABELS } from "@/components/status";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { sourceLabel } from "../customers/labels";
import { followUpLeadAction, updateLeadNotesAction, updateLeadStatusAction } from "./actions";

export type LeadRow = {
  id: string;
  status: string;
  source: string;
  service: string | null;
  notes: string | null;
  lostReason: string | null;
  lastContactAt: string;
  nextFollowUpAt: string | null;
  conversationId: string | null;
  appointment: { startsAt: string; status: string } | null;
  customer: { id: string; name: string | null; email: string | null; phone: string | null };
};

const STATUS_DOT: Record<string, string> = {
  new: "bg-info",
  contacted: "bg-muted-foreground",
  qualified: "bg-primary",
  appointment_booked: "bg-success",
  completed: "bg-success",
  lost: "bg-danger",
};


export function LeadsTable({ rows, timezone }: { rows: LeadRow[]; timezone: string }) {
  return (
    <Table>
      <thead>
        <tr>
          <th>Lead</th>
          <th>Interested in</th>
          <th>Status</th>
          <th>Last contact</th>
          <th>Follow-up</th>
          <th>Appointment</th>
          <th className="text-right"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <LeadRowView key={r.id} row={r} timezone={timezone} />
        ))}
      </tbody>
    </Table>
  );
}

function LeadRowView({ row, timezone }: { row: LeadRow; timezone: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const name = row.customer.name ?? row.customer.email ?? row.customer.phone ?? "Website visitor";

  const changeStatus = (status: string) =>
    start(async () => {
      const res = await updateLeadStatusAction(row.id, status);
      setResult(res.ok ? null : { ok: false, text: res.error });
    });

  const followUp = () =>
    start(async () => {
      setResult(null);
      const res = await followUpLeadAction(row.id);
      if (!res.ok) setResult({ ok: false, text: res.error });
      else if (res.data?.sent) setResult({ ok: true, text: `Follow-up sent. ${res.data.detail}` });
      else setResult({ ok: false, text: `Not sent — ${res.data?.detail ?? "unknown reason"}` });
    });

  return (
    <tr className={cn(pending && "opacity-70")}>
      <td className="min-w-48">
        <Link href={`/app/customers/${row.customer.id}`} className="group flex items-center gap-3">
          <Avatar name={row.customer.name} />
          <div className="min-w-0">
            <p className="truncate font-medium group-hover:underline">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[row.customer.phone, row.customer.email].filter(Boolean).join(" · ") || "No contact details yet"}
            </p>
          </div>
        </Link>
        {row.notes ? <p className="mt-1.5 line-clamp-2 max-w-xs text-xs text-muted-foreground">{row.notes}</p> : null}
        {result ? (
          <p role="status" className={cn("mt-1.5 max-w-xs text-xs", result.ok ? "text-success" : "text-danger")}>
            {result.text}
          </p>
        ) : null}
      </td>
      <td className="min-w-36">
        {row.service ?? <span className="text-muted-foreground">General enquiry</span>}
        <span className="block text-xs leading-relaxed text-muted-foreground">
          via {sourceLabel(row.source)}
          {row.conversationId ? (
            <>
              <br />
              <Link href={`/app/inbox?c=${row.conversationId}`} className="inline-flex items-center gap-0.5 hover:text-foreground hover:underline">
                <MessageSquare className="size-3" /> Conversation
              </Link>
            </>
          ) : null}
        </span>
      </td>
      <td>
        <div className="relative w-44">
          <span className={cn("pointer-events-none absolute left-2.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full", STATUS_DOT[row.status] ?? "bg-muted-foreground")} />
          <NativeSelect
            aria-label={`Status for ${name}`}
            value={row.status}
            disabled={pending}
            onChange={(e) => changeStatus(e.target.value)}
            className="h-8 pl-6 text-[13px]"
          >
            {Object.entries(LEAD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </div>
      </td>
      <td className="whitespace-nowrap text-muted-foreground" title={fmtDateTime(row.lastContactAt, timezone)}>
        {fmtRelative(row.lastContactAt)}
      </td>
      <td className="whitespace-nowrap text-muted-foreground">{row.nextFollowUpAt ? fmtDateTime(row.nextFollowUpAt, timezone, "d LLL, h:mm a") : "—"}</td>
      <td className="whitespace-nowrap">
        {row.appointment ? (
          <Link href="/app/appointments" className="inline-flex items-center gap-1.5 text-[13px] hover:underline">
            <CalendarCheck className="size-3.5 text-success" />
            {fmtDateTime(row.appointment.startsAt, timezone, "d LLL, h:mm a")}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td>
        <div className="flex items-center justify-end gap-1">
          <NotesDialog leadId={row.id} name={name} notes={row.notes} />
          <Button variant="outline" size="sm" onClick={followUp} disabled={pending}>
            <Send /> {pending ? "Working…" : "Follow up"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function NotesDialog({ leadId, name, notes }: { leadId: string; name: string; notes: string | null }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValue(notes ?? "");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" title="Edit notes" aria-label="Edit notes">
          <NotebookPen />
        </Button>
      </DialogTrigger>
      <DialogContent title={`Notes · ${name}`} description="Internal notes — never shown to the customer.">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await updateLeadNotesAction(leadId, value);
              if (res.ok) setOpen(false);
              else setError(res.error);
            });
          }}
          className="space-y-4"
        >
          <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={6} placeholder="e.g. Prefers evenings, asked about payment plans" autoFocus />
          {error ? <p className="text-[13px] text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save notes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
