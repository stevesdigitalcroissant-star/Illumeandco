"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, Clock, Copy, Pencil, Plus, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState, Notice, Table } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";
import {
  addMemberAction,
  changeRoleAction,
  removeBlackoutAction,
  removeMemberAction,
  rotateWebhookSecretAction,
  saveHoursAction,
  saveAlertsAction,
  saveRecoveryAction,
  saveWhatsappTemplatesAction,
  simulateEventAction,
  saveServiceAction,
  saveStaffAction,
  saveStaffAvailabilityAction,
  setServiceActiveAction,
  setStaffActiveAction,
  type ServiceForm,
  type StaffForm,
} from "./actions";
import { fromWeek, toWeek, WeekEditor, WEEKDAYS, type Week } from "./hours-editor";

function Msg({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (!state.ok) return <span className="text-[13px] text-danger" role="alert">{state.error}</span>;
  return state.message ? <span className="text-[13px] text-success">{state.message}</span> : null;
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const exec = <T,>(fn: () => Promise<ActionResult<T>>, onOk?: (r: ActionResult<T>) => void) =>
    start(async () => {
      const r = await fn();
      setState(r as ActionResult<unknown>);
      if (r.ok) {
        router.refresh();
        onOk?.(r);
      }
    });
  return { pending, state, setState, exec };
}

export function CardFooter({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 flex items-center justify-end gap-3 rounded-b-lg border-t bg-background/95 px-5 py-3 backdrop-blur">{children}</div>;
}

// ─── Opening hours ───────────────────────────────────────────────────
export function HoursCard({ initial }: { initial: { weekday: number; start: string; end: string }[] }) {
  const [week, setWeek] = useState<Week>(() => toWeek(initial));
  const { pending, state, setState, exec } = useAction();
  const rows = fromWeek(week);
  const dirty = JSON.stringify(rows) !== JSON.stringify(fromWeek(toWeek(initial)));
  return (
    <Card>
      <CardHeader title="Opening hours" description="When customers can book. Turn a day off to close it; add a split shift for a midday closure. Times are in your business timezone." />
      <div className="p-5">
        <WeekEditor value={week} onChange={(w) => { setState(null); setWeek(w); }} />
        {!rows.length ? <Notice tone="warning" className="mt-3">With every day closed, nobody — including the AI — can book appointments.</Notice> : null}
      </div>
      <CardFooter>
        <span className="mr-auto">{dirty && !state ? <span className="text-[13px] text-muted-foreground">Unsaved changes</span> : <Msg state={state} />}</span>
        {dirty ? <Button size="sm" variant="ghost" onClick={() => setWeek(toWeek(initial))}>Discard</Button> : null}
        <Button size="sm" disabled={pending || !dirty} onClick={() => exec(() => saveHoursAction(rows.map((r) => ({ weekday: r.weekday, openTime: r.start, closeTime: r.end }))))}>
          {pending ? "Saving…" : "Save hours"}
        </Button>
      </CardFooter>
    </Card>
  );
}

// ─── Services ────────────────────────────────────────────────────────
export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  priceCents: number | null;
  priceLabel: string;
  priceIsFrom: boolean;
  durationMinutes: number;
  bufferMinutes: number | null;
  onlineBookingEnabled: boolean;
  active: boolean;
  staffIds: string[];
};
type StaffLite = { id: string; name: string; active: boolean };

function ServiceDialog({ service, staff, currency, defaultBuffer, trigger }: { service: ServiceRow | null; staff: StaffLite[]; currency: string; defaultBuffer: number; trigger: React.ReactNode }) {
  const blank: ServiceForm = { name: "", description: "", category: "", price: "", priceIsFrom: false, durationMinutes: 30, bufferMinutes: "", onlineBookingEnabled: true, staffIds: staff.filter((s) => s.active).map((s) => s.id) };
  const fromRow = (s: ServiceRow): ServiceForm => ({
    name: s.name,
    description: s.description ?? "",
    category: s.category ?? "",
    price: s.priceCents == null ? "" : String(s.priceCents / 100),
    priceIsFrom: s.priceIsFrom,
    durationMinutes: s.durationMinutes,
    bufferMinutes: s.bufferMinutes == null ? "" : String(s.bufferMinutes),
    onlineBookingEnabled: s.onlineBookingEnabled,
    staffIds: s.staffIds,
  });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<ServiceForm>(service ? fromRow(service) : blank);
  const { pending, state, setState, exec } = useAction();
  const set = (p: Partial<ServiceForm>) => setF({ ...f, ...p });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setF(service ? fromRow(service) : blank); setState(null); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent wide title={service ? `Edit ${service.name}` : "Add a service"} description="The AI quotes exactly these prices and durations.">
        <form className="space-y-4" action={() => exec(() => saveServiceAction(service?.id ?? null, f), () => setOpen(false))}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} required maxLength={120} /></Field>
            <Field label="Category" hint="Optional, e.g. Cosmetic"><Input value={f.category} onChange={(e) => set({ category: e.target.value })} maxLength={80} /></Field>
          </div>
          <Field label="Description" hint="What the AI can tell customers about this service.">
            <Textarea value={f.description} onChange={(e) => set({ description: e.target.value })} maxLength={2000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={`Price (${currency})`} hint="Leave empty for “price on request”.">
              <Input inputMode="decimal" value={f.price} onChange={(e) => set({ price: e.target.value })} placeholder="e.g. 650" />
            </Field>
            <Field label="Duration (minutes)"><Input type="number" min={5} max={1440} value={f.durationMinutes} onChange={(e) => set({ durationMinutes: Number(e.target.value) })} required /></Field>
            <Field label="Buffer after (minutes)" hint={`Empty = business default (${defaultBuffer} min).`}>
              <Input type="number" min={0} max={240} value={f.bufferMinutes} onChange={(e) => set({ bufferMinutes: e.target.value })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <label className="flex items-center gap-2.5 text-sm"><Switch checked={f.priceIsFrom} onCheckedChange={(c) => set({ priceIsFrom: c })} /> “From” price (starting at)</label>
            <label className="flex items-center gap-2.5 text-sm"><Switch checked={f.onlineBookingEnabled} onCheckedChange={(c) => set({ onlineBookingEnabled: c })} /> Bookable online &amp; by the AI</label>
          </div>
          <div>
            <Label>Who performs it</Label>
            {staff.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {staff.map((s) => {
                  const on = f.staffIds.includes(s.id);
                  return (
                    <button key={s.id} type="button" aria-pressed={on} onClick={() => set({ staffIds: on ? f.staffIds.filter((x) => x !== s.id) : [...f.staffIds, s.id] })} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px]", on ? "border-primary bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted", !s.active && "opacity-60")}>
                      {on ? <Check className="size-3.5" /> : null}{s.name}{!s.active ? " (inactive)" : ""}
                    </button>
                  );
                })}
              </div>
            ) : <p className="mt-1 text-[13px] text-muted-foreground">Add staff first so this service can be booked.</p>}
            {staff.length && !f.staffIds.length ? <p className="mt-2 text-xs text-warning">With nobody assigned, this service can&apos;t be booked.</p> : null}
          </div>
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <span className="mr-auto"><Msg state={state} /></span>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : service ? "Save service" : "Add service"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ServicesCard({ services, staff, currency, defaultBuffer }: { services: ServiceRow[]; staff: StaffLite[]; currency: string; defaultBuffer: number }) {
  const [showArchived, setShowArchived] = useState(false);
  const { pending, state, exec } = useAction();
  const visible = services.filter((s) => showArchived || s.active);
  const archivedCount = services.filter((s) => !s.active).length;
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? "—";
  return (
    <Card>
      <CardHeader
        title="Services"
        description="What customers can book. Archived services keep their booking history but can't be booked."
        action={<ServiceDialog service={null} staff={staff} currency={currency} defaultBuffer={defaultBuffer} trigger={<Button size="sm"><Plus /> Add service</Button>} />}
      />
      {visible.length ? (
        <Table>
          <thead>
            <tr><th>Service</th><th>Price</th><th>Duration</th><th>Staff</th><th>Online</th><th className="w-24"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id} className={cn(!s.active && "opacity-60")}>
                <td>
                  <p className="font-medium">{s.name} {!s.active ? <Badge tone="outline" className="ml-1">Archived</Badge> : null}</p>
                  {s.category ? <p className="text-xs text-muted-foreground">{s.category}</p> : null}
                </td>
                <td className="whitespace-nowrap tabular">{s.priceLabel}</td>
                <td className="whitespace-nowrap tabular">{s.durationMinutes} min{s.bufferMinutes ? <span className="text-xs text-muted-foreground"> +{s.bufferMinutes} buffer</span> : null}</td>
                <td className="max-w-[220px] text-[13px] text-muted-foreground">{s.staffIds.length ? s.staffIds.map(staffName).join(", ") : <span className="text-warning">Nobody assigned</span>}</td>
                <td>{s.onlineBookingEnabled ? <Badge tone="success">On</Badge> : <Badge tone="outline">Off</Badge>}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <ServiceDialog service={s} staff={staff} currency={currency} defaultBuffer={defaultBuffer} trigger={<Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${s.name}`}><Pencil /></Button>} />
                    {s.active ? (
                      <Button variant="ghost" size="icon" className="size-8" aria-label={`Archive ${s.name}`} title="Archive" disabled={pending} onClick={() => confirm(`Archive "${s.name}"? It will no longer be bookable.`) && exec(() => setServiceActiveAction(s.id, false))}><Archive /></Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="size-8" aria-label={`Restore ${s.name}`} title="Restore" disabled={pending} onClick={() => exec(() => setServiceActiveAction(s.id, true))}><RotateCcw /></Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No services yet" description="Add the services customers can book, with prices and durations." />
      )}
      <div className="flex items-center justify-between border-t px-5 py-3">
        <Msg state={state} />
        {archivedCount ? (
          <label className="ml-auto flex items-center gap-2 text-[13px] text-muted-foreground"><Switch checked={showArchived} onCheckedChange={setShowArchived} /> Show {archivedCount} archived</label>
        ) : null}
      </div>
    </Card>
  );
}

// ─── Staff ───────────────────────────────────────────────────────────
export type StaffRow = { id: string; name: string; title: string | null; email: string | null; phone: string | null; userId: string | null; active: boolean; work: { weekday: number; start: string; end: string }[]; breaks: { weekday: number; start: string; end: string }[] };
type MemberLite = { userId: string; name: string; email: string };

function StaffDialog({ member, members, trigger }: { member: StaffRow | null; members: MemberLite[]; trigger: React.ReactNode }) {
  const init = (): StaffForm => ({ name: member?.name ?? "", title: member?.title ?? "", email: member?.email ?? "", phone: member?.phone ?? "", userId: member?.userId ?? "" });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<StaffForm>(init);
  const { pending, state, setState, exec } = useAction();
  const set = (p: Partial<StaffForm>) => setF({ ...f, ...p });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setF(init()); setState(null); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={member ? `Edit ${member.name}` : "Add a staff member"} description="Staff are the people appointments are booked with.">
        <form className="space-y-4" action={() => exec(() => saveStaffAction(member?.id ?? null, f), () => setOpen(false))}>
          <Field label="Name"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} required maxLength={120} /></Field>
          <Field label="Title" hint="e.g. Dentist, Senior stylist"><Input value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          </div>
          <Field label="Dashboard login" hint="Optional. Link a team member so they see their own appointments and conversations.">
            <NativeSelect value={f.userId} onChange={(e) => set({ userId: e.target.value })}>
              <option value="">Not linked</option>
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.name} ({m.email})</option>)}
            </NativeSelect>
          </Field>
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <span className="mr-auto"><Msg state={state} /></span>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : member ? "Save" : "Add staff member"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AvailabilityDialog({ member }: { member: StaffRow }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(member.work.length > 0);
  const [work, setWork] = useState<Week>(() => toWeek(member.work));
  const [breaks, setBreaks] = useState<Week>(() => toWeek(member.breaks));
  const { pending, state, setState, exec } = useAction();
  const save = () => {
    const rows = [
      ...(custom ? fromWeek(work).map((r) => ({ kind: "work" as const, weekday: r.weekday, startTime: r.start, endTime: r.end })) : []),
      ...fromWeek(breaks).map((r) => ({ kind: "break" as const, weekday: r.weekday, startTime: r.start, endTime: r.end })),
    ];
    exec(() => saveStaffAvailabilityAction(member.id, rows), () => setOpen(false));
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setCustom(member.work.length > 0); setWork(toWeek(member.work)); setBreaks(toWeek(member.breaks)); setState(null); } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Working hours for ${member.name}`} title="Working hours"><Clock /></Button>
      </DialogTrigger>
      <DialogContent wide title={`${member.name} — working hours`} description="Appointments are only offered inside working hours, outside breaks, and within business opening hours.">
        <div className="space-y-5">
          <label className="flex items-center gap-2.5 text-sm">
            <Switch checked={custom} onCheckedChange={(c) => { setCustom(c); if (c && !fromWeek(work).length) setWork(toWeek([1, 2, 3, 4, 5].map((d) => ({ weekday: d, start: "09:00", end: "17:00" })))); }} />
            Custom working hours {custom ? "" : <span className="text-muted-foreground">— currently follows business opening hours</span>}
          </label>
          {custom ? <WeekEditor value={work} onChange={setWork} closedLabel="Not working" /> : null}
          <div>
            <p className="mb-2 text-sm font-medium">Breaks</p>
            <WeekEditor value={breaks} onChange={setBreaks} closedLabel="No break" addLabel="Add break" defaultInterval={{ start: "13:00", end: "14:00" }} />
          </div>
          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <span className="mr-auto"><Msg state={state} /></span>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save hours"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function summarize(rows: { weekday: number; start: string; end: string }[]) {
  if (!rows.length) return null;
  const days = [...new Set(rows.map((r) => r.weekday))].sort();
  return days.map((d) => `${WEEKDAYS[d - 1]!.slice(0, 3)} ${rows.filter((r) => r.weekday === d).map((r) => `${r.start}–${r.end}`).join(", ")}`).join(" · ");
}

export function StaffCard({ staff, members }: { staff: StaffRow[]; members: MemberLite[] }) {
  const { pending, state, exec } = useAction();
  return (
    <Card>
      <CardHeader title="Staff" description="Deactivated staff can't be booked but keep their appointment history." action={<StaffDialog member={null} members={members} trigger={<Button size="sm"><Plus /> Add staff</Button>} />} />
      {staff.length ? (
        <Table>
          <thead><tr><th>Name</th><th>Working hours</th><th>Login</th><th>Active</th><th className="w-24"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {staff.map((s) => {
              const linked = members.find((m) => m.userId === s.userId);
              return (
                <tr key={s.id} className={cn(!s.active && "opacity-60")}>
                  <td><p className="font-medium">{s.name}</p>{s.title ? <p className="text-xs text-muted-foreground">{s.title}</p> : null}</td>
                  <td className="max-w-[340px] text-[13px] text-muted-foreground">
                    {summarize(s.work) ?? "Business opening hours"}
                    {s.breaks.length ? <span className="block text-xs">Breaks: {summarize(s.breaks)}</span> : null}
                  </td>
                  <td className="text-[13px]">{linked ? linked.name : <span className="text-muted-foreground">—</span>}</td>
                  <td><Switch checked={s.active} disabled={pending} onCheckedChange={(c) => exec(() => setStaffActiveAction(s.id, c))} aria-label={`${s.name} active`} /></td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <AvailabilityDialog member={s} />
                      <StaffDialog member={s} members={members} trigger={<Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${s.name}`}><Pencil /></Button>} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No staff yet" description="Add the people customers book with." />
      )}
      {state ? <div className="border-t px-5 py-3"><Msg state={state} /></div> : null}
    </Card>
  );
}

// ─── Blackouts ───────────────────────────────────────────────────────
export function RemoveBlackoutButton({ id }: { id: string }) {
  const { pending, state, exec } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      {state && !state.ok ? <Msg state={state} /> : null}
      <Button variant="ghost" size="icon" className="size-8" aria-label="Remove closure" disabled={pending} onClick={() => exec(() => removeBlackoutAction(id))}><Trash2 /></Button>
    </span>
  );
}

// ─── Team ────────────────────────────────────────────────────────────
export type MemberRow = { id: string; userId: string; name: string; email: string; role: "owner" | "manager" | "staff"; isMe: boolean };

function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "invite">("existing");
  const [f, setF] = useState({ name: "", email: "", role: "staff" });
  const [created, setCreated] = useState<{ name: string; email: string; temporaryPassword: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const { pending, state, setState, exec } = useAction();
  const reset = () => { setF({ name: "", email: "", role: "staff" }); setCreated(null); setState(null); setCopied(false); };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button size="sm"><UserPlus /> Add member</Button></DialogTrigger>
      <DialogContent title="Add a team member" description="Members can sign in to this dashboard with the role you choose.">
        {created ? (
          <div className="space-y-4">
            <Notice tone="success">{created.name} ({created.email}) was added to the team.</Notice>
            {created.temporaryPassword ? (
              <div className="space-y-2">
                <Label>Temporary password — shown only once</Label>
                <div className="flex gap-2">
                  <Input readOnly value={created.temporaryPassword} className="font-mono" onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(created.temporaryPassword!); setCopied(true); }}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</Button>
                </div>
                <p className="text-xs text-muted-foreground">Share it securely. It can&apos;t be shown again. No email is sent automatically.</p>
              </div>
            ) : null}
            <div className="flex justify-end border-t pt-4"><Button onClick={() => setOpen(false)}>Done</Button></div>
          </div>
        ) : (
          <form className="space-y-4" action={() => exec(() => addMemberAction({ mode, ...f, role: f.role }), (r) => { if (r.ok && r.data) setCreated(r.data); })}>
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-[13px]" role="radiogroup">
              {(["existing", "invite"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setState(null); }} className={cn("rounded px-3 py-1.5", mode === m ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
                  {m === "existing" ? "Existing account" : "Create account"}
                </button>
              ))}
            </div>
            {mode === "invite" ? <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field> : null}
            <Field label="Email" hint={mode === "existing" ? "They must already have an AI Front Office account." : "We'll create an account with a temporary password for you to share."}>
              <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
            </Field>
            <Field label="Role">
              <NativeSelect value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </NativeSelect>
            </Field>
            <div className="flex items-center justify-end gap-2 border-t pt-4">
              <span className="mr-auto"><Msg state={state} /></span>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Adding…" : mode === "invite" ? "Create & add" : "Add to team"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TeamCard({ members, canManage }: { members: MemberRow[]; canManage: boolean }) {
  const { pending, state, exec } = useAction();
  const owners = members.filter((m) => m.role === "owner").length;
  return (
    <Card>
      <CardHeader title="Team members" description="People who can sign in to this organization's dashboard." action={canManage ? <AddMemberDialog /> : null} />
      <Table>
        <thead><tr><th>Name</th><th>Role</th><th className="w-16"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {members.map((m) => {
            const lastOwner = m.role === "owner" && owners <= 1;
            return (
              <tr key={m.id}>
                <td><p className="font-medium">{m.name} {m.isMe ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null}</p><p className="text-xs text-muted-foreground">{m.email}</p></td>
                <td>
                  {canManage ? (
                    <NativeSelect value={m.role} disabled={pending || lastOwner} title={lastOwner ? "Every organization needs at least one owner" : undefined} onChange={(e) => exec(() => changeRoleAction(m.id, e.target.value))} className="h-8 w-32" aria-label={`Role for ${m.name}`}>
                      <option value="owner">Owner</option>
                      <option value="manager">Manager</option>
                      <option value="staff">Staff</option>
                    </NativeSelect>
                  ) : (
                    <Badge tone={m.role === "owner" ? "primary" : "neutral"} className="capitalize">{m.role}</Badge>
                  )}
                </td>
                <td className="text-right">
                  {canManage && !lastOwner ? (
                    <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove ${m.name}`} disabled={pending} onClick={() => confirm(`Remove ${m.name} from the team? They will lose access immediately.`) && exec(() => removeMemberAction(m.id))}><Trash2 /></Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      {state || !canManage ? (
        <div className="border-t px-5 py-3 text-[13px]">{state ? <Msg state={state} /> : <span className="text-muted-foreground">Only owners can add, remove or change members.</span>}</div>
      ) : null}
    </Card>
  );
}

// ─── Integrations: webhook secret + missed-call recovery ─────────────
export function WebhookSecretButton({ hasSecret, disabled }: { hasSecret: boolean; disabled: boolean }) {
  const { pending, state, exec } = useAction();
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      {secret ? (
        <div className="space-y-1.5">
          <Label>Signing secret — shown only once</Label>
          <div className="flex gap-2">
            <Input readOnly value={secret} className="font-mono" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(secret); setCopied(true); }}>{copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">Store it in your phone system or automation tool. It&apos;s stored encrypted and can&apos;t be shown again — rotate to get a new one.</p>
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant={hasSecret ? "outline" : "default"}
          disabled={disabled || pending}
          onClick={() => {
            if (hasSecret && !confirm("Rotate the secret? Anything using the current secret will stop working until you update it.")) return;
            exec(() => rotateWebhookSecretAction(), (r) => { if (r.ok && r.data) { setSecret(r.data.secret); setCopied(false); } });
          }}
        >
          <RotateCcw /> {hasSecret ? "Rotate secret" : "Generate signing secret"}
        </Button>
        <Msg state={state && !state.ok ? state : null} />
      </div>
    </div>
  );
}

export type RecoveryCardCopy = {
  title: string;
  description: string;
  enabledLabel: string;
  enabledHint: string;
  autoLabel: string;
  autoHint: string;
  messageLabel: string;
  messageHint: string;
};

export function RecoveryCard({
  worker,
  copy,
  initial,
  canSend,
  sendHint,
}: {
  worker: "missedCall" | "leads";
  copy: RecoveryCardCopy;
  initial: { enabled: boolean; auto: boolean; template: string };
  canSend: boolean;
  sendHint: string | null;
}) {
  const [f, setF] = useState(initial);
  const { pending, state, exec } = useAction();
  return (
    <Card>
      <CardHeader title={copy.title} description={copy.description} />
      <div className="space-y-4 px-5 pb-5">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">{copy.enabledLabel}</span>
            <span className="block text-[13px] text-muted-foreground">{copy.enabledHint}</span>
          </span>
          <Switch checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} aria-label={copy.enabledLabel} />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">{copy.autoLabel}</span>
            <span className="block text-[13px] text-muted-foreground">{copy.autoHint}</span>
          </span>
          <Switch checked={f.auto} disabled={!f.enabled} onCheckedChange={(v) => setF({ ...f, auto: v })} aria-label={copy.autoLabel} />
        </label>
        {!canSend && sendHint ? <Notice tone="warning">{sendHint}</Notice> : null}
        <Field label={copy.messageLabel} hint={copy.messageHint}>
          <Textarea rows={3} value={f.template} maxLength={480} onChange={(e) => setF({ ...f, template: e.target.value })} />
        </Field>
        <div className="flex items-center justify-end gap-3">
          <span className="mr-auto"><Msg state={state} /></span>
          <Button size="sm" disabled={pending} onClick={() => exec(() => saveRecoveryAction(worker, f))}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Staff alerts ────────────────────────────────────────────────────
export function AlertsCard({ initial, hint }: { initial: { instant: boolean; digest: boolean; digestHour: number; smsTo: string[]; emailTo: string[] }; hint: string | null }) {
  const [f, setF] = useState({ ...initial, smsTo: initial.smsTo.join(", "), emailTo: initial.emailTo.join(", ") });
  const { pending, state, exec } = useAction();
  return (
    <Card>
      <CardHeader title="Staff alerts" description="When something only a person can do comes up — a missed caller to call back, a new lead to reach, an accepted slot to book, a customer asking for a person — your team is told straight away, not just in the dashboard." />
      <div className="space-y-4 px-5 pb-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Text alerts to" hint="Phone numbers, comma-separated (international format)"><Input value={f.smsTo} placeholder="+15125550142" onChange={(e) => setF({ ...f, smsTo: e.target.value })} /></Field>
          <Field label="Email alerts to" hint="Email addresses, comma-separated"><Input value={f.emailTo} placeholder="frontdesk@clinic.com" onChange={(e) => setF({ ...f, emailTo: e.target.value })} /></Field>
        </div>
        <label className="flex items-center justify-between gap-4">
          <span><span className="block text-sm font-medium">Instant alerts</span><span className="block text-[13px] text-muted-foreground">Sent 07:00–22:00 your time; anything later goes out in the morning.</span></span>
          <Switch checked={f.instant} onCheckedChange={(v) => setF({ ...f, instant: v })} aria-label="Instant alerts" />
        </label>
        <label className="flex items-center justify-between gap-4">
          <span><span className="block text-sm font-medium">Morning summary</span><span className="block text-[13px] text-muted-foreground">What needs the team today and what was recovered yesterday.</span></span>
          <span className="flex items-center gap-2">
            <NativeSelect className="h-8 w-24" value={f.digestHour} disabled={!f.digest} onChange={(e) => setF({ ...f, digestHour: Number(e.target.value) })} aria-label="Summary time">
              {[5, 6, 7, 8, 9, 10, 11, 12].map((h) => <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>)}
            </NativeSelect>
            <Switch checked={f.digest} onCheckedChange={(v) => setF({ ...f, digest: v })} aria-label="Morning summary" />
          </span>
        </label>
        {hint ? <Notice tone="warning">{hint}</Notice> : null}
        <div className="flex items-center justify-end gap-3">
          <span className="mr-auto"><Msg state={state} /></span>
          <Button size="sm" disabled={pending} onClick={() => exec(() => saveAlertsAction(f))}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </Card>
  );
}

// ─── WhatsApp templates ──────────────────────────────────────────────
export function WhatsappTemplatesCard({ purposes, initial }: { purposes: { purpose: string; label: string; vars: string[] }[]; initial: Record<string, { contentSid: string; variables: string[] }> }) {
  const [f, setF] = useState<Record<string, { contentSid: string; variables: string }>>(
    Object.fromEntries(purposes.map((p) => [p.purpose, { contentSid: initial[p.purpose]?.contentSid ?? "", variables: initial[p.purpose]?.variables.join(", ") ?? "" }])),
  );
  const { pending, state, exec } = useAction();
  return (
    <Card>
      <CardHeader
        title="WhatsApp templates"
        description="WhatsApp only allows free text within 24 hours of the customer's last message. Outside that window, messages you start must use a template Meta approved. Without one, the message goes by SMS instead."
      />
      <div className="space-y-3 px-5 pb-5">
        {purposes.map((p) => (
          <div key={p.purpose} className="grid gap-2 sm:grid-cols-[1fr_1.2fr_1.2fr] sm:items-end">
            <p className="text-sm font-medium sm:pb-2">{p.label}</p>
            <Field label="Content SID"><Input className="font-mono" placeholder="HX…" value={f[p.purpose]!.contentSid} onChange={(e) => setF({ ...f, [p.purpose]: { ...f[p.purpose]!, contentSid: e.target.value } })} /></Field>
            <Field label="Variables in order ({{1}}, {{2}}…)" hint={`Available: ${p.vars.join(", ")}`}>
              <Input placeholder={p.vars.slice(0, 2).join(", ")} value={f[p.purpose]!.variables} onChange={(e) => setF({ ...f, [p.purpose]: { ...f[p.purpose]!, variables: e.target.value } })} />
            </Field>
          </div>
        ))}
        <div className="flex items-center justify-end gap-3 pt-1">
          <span className="mr-auto"><Msg state={state} /></span>
          <Button size="sm" disabled={pending} onClick={() => exec(() => saveWhatsappTemplatesAction(f))}>{pending ? "Saving…" : "Save templates"}</Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Try it ──────────────────────────────────────────────────────────
export function SimulateCard() {
  const [type, setType] = useState<"call.missed" | "lead.created">("call.missed");
  const [f, setF] = useState({ name: "", phone: "", email: "", service: "", message: "" });
  const [pending, start] = useTransition();
  const [out, setOut] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  return (
    <Card>
      <CardHeader title="Try it" description="Send a test missed call or website lead through the real recovery pipeline — exactly what happens when your phone system or form sends one. Test events are labelled “Test”." />
      <div className="space-y-3 px-5 pb-5">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1 text-[13px]" role="radiogroup">
          {(["call.missed", "lead.created"] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => { setType(t); setOut(null); }} className={cn("rounded px-3 py-1.5", type === t ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
              {t === "call.missed" ? "Missed call" : "Website lead"}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" hint="Optional"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Sara Ahmed" /></Field>
          <Field label="Phone" hint={type === "call.missed" ? "The caller's number" : "Phone or email needed"}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+15125550142" /></Field>
          {type === "lead.created" ? (
            <>
              <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="sara@example.com" /></Field>
              <Field label="Service they asked about"><Input value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })} placeholder="Teeth whitening" /></Field>
              <Field label="Their message" className="sm:col-span-2"><Input value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Is it painful? How much is it?" /></Field>
            </>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-3">
          {out ? <span className={cn("mr-auto text-[13px]", out.ok ? "text-success" : "text-danger")}>{out.text}</span> : null}
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await simulateEventAction({ type, ...f });
                setOut(r.ok ? { ok: r.data!.status === "processed", text: `${r.data!.status}: ${r.data!.result}` } : { ok: false, text: r.error });
                router.refresh();
              })
            }
          >
            {pending ? "Sending…" : type === "call.missed" ? "Simulate missed call" : "Simulate new lead"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
