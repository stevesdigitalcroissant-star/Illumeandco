import { DateTime } from "luxon";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, PageHeader, Table } from "@/components/ui/misc";
import { Stat } from "@/components/stat";
import { requirePermission } from "@/lib/session";
import { formatMoney } from "@/lib/utils";
import { isAllowed } from "@/server/ai/permissions";
import { getChannel } from "@/server/channels/registry";
import { roleCan } from "@/server/context";
import { getAiSettings } from "@/server/services/business";
import { listServices, listStaff } from "@/server/services/catalog";
import { listCustomers } from "@/server/services/customers";
import { listSlots, listWaitlist, rankCandidates } from "@/server/recovery/slots";
import { AddWaitlistForm, RemoveWaitlistButton, SlotActions, SlotSettingsCard } from "./slots-client";

export const metadata = { title: "Slot recovery" };

const STATUS: Record<string, { label: string; tone: "warning" | "primary" | "danger" | "success" | "neutral" }> = {
  open: { label: "Open", tone: "warning" },
  offering: { label: "Offers out", tone: "primary" },
  pending_staff: { label: "Accepted — confirm", tone: "danger" },
  filled: { label: "Filled", tone: "success" },
  expired: { label: "Expired", tone: "neutral" },
  dismissed: { label: "Dismissed", tone: "neutral" },
};
const OFFER_TONE = { sent: "primary", accepted: "success", declined: "neutral", expired: "neutral", taken: "neutral", failed: "danger" } as const;

export default async function SlotsPage() {
  const { ctx, business, role } = await requirePermission("appointments.view_all");
  const tz = business.timezone;
  const money = (c: number | null | undefined) => (c == null ? null : formatMoney(c, business.currency));
  const when = (d: Date) => DateTime.fromJSDate(d).setZone(tz).toFormat("ccc d LLL, h:mm a");
  const [open, closed, waitlist, settings, services, staff, customers] = await Promise.all([
    listSlots(ctx, { open: true, limit: 20 }),
    listSlots(ctx, { limit: 20 }),
    listWaitlist(ctx),
    getAiSettings(ctx),
    listServices(ctx),
    listStaff(ctx),
    listCustomers(ctx, { limit: 300 }),
  ]);
  // Rank candidates for the slots that still need someone (sequential: each check uses the availability engine).
  const ranked = new Map<string, Awaited<ReturnType<typeof rankCandidates>>>();
  for (const r of open.slice(0, 10)) if (r.slot.status !== "pending_staff") ranked.set(r.slot.id, await rankCandidates(ctx, r.slot, undefined, { need: 4 }));

  const d30 = new Date().getTime() - 30 * 86400_000;
  const recent = closed.filter((r) => (r.slot.closedAt?.getTime() ?? 0) >= d30);
  const recovered = recent.filter((r) => r.slot.status === "filled" && r.slot.filledBy);
  const cfg = settings.recovery.slots;
  const canSend = isAllowed(settings.permissions, "send_messages");
  const phone = getChannel("sms").isConfigured() || getChannel("whatsapp").isConfigured() || getChannel("email").isConfigured();
  const warning = !phone
    ? "Offers need SMS, WhatsApp or email — configuration required. Until then slots and candidates are listed, but no offers can be delivered."
    : !canSend
      ? "The AI's \"Send messages\" permission is off, so offers can't be sent."
      : null;

  return (
    <>
      <PageHeader title="Slot recovery" description="When an appointment is cancelled or moved, the empty time is offered to the best-fitting people on your waitlist. First to reply YES gets it." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open slots" value={open.filter((r) => r.slot.status !== "pending_staff").length} sub={`${money(open.reduce((s, r) => s + (r.slot.lostValueCents ?? 0), 0)) ?? "—"} at risk`} />
        <Stat label="Need you" value={open.filter((r) => r.slot.status === "pending_staff").length} sub="Accepted, waiting for your team to book" tone={open.some((r) => r.slot.status === "pending_staff") ? "danger" : "default"} />
        <Stat label="Recovered · 30 days" value={recovered.length} sub={`${money(recovered.reduce((s, r) => s + (r.slot.filledValueCents ?? 0), 0))} booked through offers`} />
        <Stat label="On the waitlist" value={waitlist.length} sub="Active entries" />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Open slots" description="Candidates are ranked by fit, value, waiting time and reliability — every point is explained." />
          {open.length ? (
            <ul className="divide-y">
              {open.map(({ slot, serviceName, staffName, filledName, offers }) => {
                const cands = ranked.get(slot.id) ?? [];
                const eligible = cands.filter((c) => !c.blocked);
                return (
                  <li key={slot.id} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={STATUS[slot.status]!.tone}>{STATUS[slot.status]!.label}</Badge>
                          <span className="font-medium">{when(slot.startsAt)}</span>
                          <span className="text-[13px] text-muted-foreground">
                            {[staffName, slot.label, slot.source === "external" ? "your booking system" : `${slot.source === "reschedule" ? "moved" : "cancelled"} ${serviceName ?? "appointment"}`].filter(Boolean).join(" · ")}
                            {slot.lostValueCents != null ? ` · ${money(slot.lostValueCents)}` : ""}
                          </span>
                        </div>
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          {slot.status === "pending_staff" ? `${filledName ?? "A customer"} accepted — book them in${slot.source === "external" ? " your booking system" : ""}, then mark it recovered.` : slot.statusNote}
                        </p>
                      </div>
                      {roleCan(role, "appointments.manage") ? <SlotActions slotId={slot.id} status={slot.status} canOffer={eligible.length > 0 && !warning} /> : null}
                    </div>
                    {offers.length ? (
                      <div className="flex flex-wrap gap-2 text-[13px]">
                        {offers.map(({ offer, name, phone: p }) => (
                          <span key={offer.id} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1">
                            {name ?? p ?? "Customer"} <Badge tone={OFFER_TONE[offer.status]}>{offer.status}</Badge>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {slot.status !== "pending_staff" ? (
                      cands.length ? (
                        <ol className="space-y-1.5 text-[13px]">
                          {cands.slice(0, 4).map((c) => (
                            <li key={c.entry.id} className="flex flex-wrap items-baseline gap-x-2">
                              <span className={c.blocked ? "text-muted-foreground line-through" : "font-medium"}>{c.customer.name ?? c.customer.phone ?? c.customer.email ?? "Customer"}</span>
                              <span className="tabular text-muted-foreground">{c.score}/100</span>
                              <span className="text-muted-foreground">{c.serviceName}</span>
                              <span className="text-xs text-muted-foreground">— {c.blocked ?? c.reasons.join(" · ")}</span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-[13px] text-muted-foreground">Nobody is on the waitlist yet — add people below, or let the AI add them when no time suits.</p>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No open slots" description="Cancellations and reschedules in your calendar (or slot.opened events from your booking system) appear here." />
          )}
        </Card>

        <Card>
          <CardHeader title="Waitlist" description="People who want an appointment if one frees up. The AI adds people here when no suitable time is available." />
          {waitlist.length ? (
            <Table>
              <thead><tr><th>Customer</th><th>Service</th><th>Dates</th><th>Time of day</th><th>Added</th><th /></tr></thead>
              <tbody>
                {waitlist.map(({ entry, customer, serviceName, staffName }) => (
                  <tr key={entry.id}>
                    <td className="font-medium">{customer.name ?? customer.phone ?? customer.email}</td>
                    <td>{serviceName}{staffName ? <span className="text-muted-foreground"> · {staffName}</span> : null}</td>
                    <td className="whitespace-nowrap">{entry.earliestDate}{entry.latestDate ? ` → ${entry.latestDate}` : " onwards"}</td>
                    <td className="capitalize">{entry.dayparts.length ? entry.dayparts.join(", ") : "Any"}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{DateTime.fromJSDate(entry.createdAt).setZone(tz).toFormat("d LLL")} · {entry.source === "staff" ? "team" : "AI"}</td>
                    <td className="text-right">{roleCan(role, "appointments.manage") ? <RemoveWaitlistButton id={entry.id} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="The waitlist is empty" description="Add someone below." />
          )}
          {roleCan(role, "appointments.manage") ? (
            <div className="border-t pt-4">
              <AddWaitlistForm
                customers={customers.filter((c) => c.phone || c.email).map((c) => ({ id: c.id, label: [c.name, c.phone ?? c.email].filter(Boolean).join(" · ") }))}
                services={services.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))}
                staff={staff.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name }))}
                today={DateTime.now().setZone(tz).toISODate()!}
              />
            </div>
          ) : null}
        </Card>

        {recent.length ? (
          <Card>
            <CardHeader title="Last 30 days" description="Recovered means the slot was filled through an accepted offer." />
            <ul className="divide-y">
              {recent.map(({ slot, filledName, serviceName }) => (
                <li key={slot.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  {slot.status === "filled" && slot.filledBy ? <Badge tone="success">Recovered</Badge> : <Badge tone={STATUS[slot.status]!.tone}>{STATUS[slot.status]!.label}</Badge>}
                  <span className="font-medium">{when(slot.startsAt)}</span>
                  <span className="text-muted-foreground">{serviceName ?? slot.label}</span>
                  <span className="ml-auto text-[13px] text-muted-foreground">
                    {filledName ? `${filledName} · ` : ""}{slot.statusNote}{slot.filledBy && slot.filledValueCents != null ? ` · ${money(slot.filledValueCents)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {roleCan(role, "business.manage") ? <SlotSettingsCard initial={cfg} warning={warning} /> : null}
      </div>
    </>
  );
}
