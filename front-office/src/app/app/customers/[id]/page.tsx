import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, Brain, CalendarDays, CalendarPlus, History, MessageSquare, Target, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Avatar, EmptyState, Notice } from "@/components/ui/misc";
import { AppointmentStatusBadge, CHANNEL_LABELS, ConversationStatusBadge, LeadStatusBadge } from "@/components/status";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { requireBusiness } from "@/lib/session";
import { cn, formatMoney } from "@/lib/utils";
import { AppError, roleCan } from "@/server/context";
import { listAppointments } from "@/server/services/appointments";
import { customerActivity, customerConversations, customerLeads } from "@/server/services/customer-profile";
import { getCustomer } from "@/server/services/customers";
import { AppointmentActions } from "../../appointments/appointment-actions";
import { bookingOptions } from "../../appointments/data";
import { NewAppointmentDialog } from "../../appointments/new-appointment-dialog";
import { sourceLabel } from "../labels";
import { CustomerDetailsForm } from "./details-form";

export const metadata = { title: "Customer" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ existing?: string }> }) {
  const { ctx, business, role } = await requireBusiness();
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  let customer;
  try {
    customer = await getCustomer(ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "not_found") notFound();
    throw e;
  }
  const tz = business.timezone;
  const now = new Date();
  const [appts, convs, leadRows, activity, opts] = await Promise.all([
    listAppointments(ctx, { customerId: id }),
    customerConversations(ctx, id),
    customerLeads(ctx, id),
    customerActivity(ctx, id),
    bookingOptions(ctx),
  ]);
  const upcoming = appts.filter((a) => a.appointment.startsAt >= now && (a.appointment.status === "booked" || a.appointment.status === "confirmed"));
  const past = appts.filter((a) => !upcoming.includes(a)).reverse();
  const completed = appts.filter((a) => a.appointment.status === "completed");
  const lifetime = completed.reduce((s, a) => s + (a.appointment.priceCents ?? 0), 0);
  const displayName = customer.name ?? customer.email ?? customer.phone ?? "Website visitor";
  const showLeads = roleCan(role, "leads.manage");

  return (
    <>
      <Link href="/app/customers" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Customers
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={customer.name} className="size-12 text-sm" />
          <div>
            <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight">
              {displayName}
              {customer.optedOut ? <Badge tone="danger">Opted out</Badge> : null}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Customer since {fmtDateTime(customer.createdAt, tz, "d LLL yyyy")}
              {customer.source ? ` · via ${sourceLabel(customer.source)}` : ""}
              {customer.lastSeenAt ? ` · last seen ${fmtRelative(customer.lastSeenAt)}` : ""}
            </p>
          </div>
        </div>
        <NewAppointmentDialog
          services={opts.services}
          staff={opts.staff}
          timezone={tz}
          currency={business.currency}
          maxAdvanceDays={business.maxAdvanceDays}
          presetCustomer={{ id: customer.id, name: customer.name, phone: customer.phone, email: customer.email }}
          trigger={
            <Button>
              <CalendarPlus /> Book appointment
            </Button>
          }
        />
      </div>
      {sp.existing ? (
        <Notice className="mb-5">A customer with that phone or email already existed, so we opened their profile instead of creating a duplicate.</Notice>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MiniStat label="Upcoming" value={upcoming.length} />
        <MiniStat label="Completed visits" value={completed.length} />
        <MiniStat label="No-shows" value={appts.filter((a) => a.appointment.status === "no_show").length} />
        <MiniStat label="Completed value" value={formatMoney(lifetime, business.currency)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Upcoming appointments" />
            {upcoming.length ? (
              <ul>
                {upcoming.map(({ appointment: a, service, staff }) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 border-t px-5 py-3 first:border-t-0">
                    <div className="w-28 shrink-0">
                      <p className="text-sm font-medium tabular">{fmtDateTime(a.startsAt, tz, "ccc d LLL")}</p>
                      <p className="text-xs text-muted-foreground tabular">{fmtDateTime(a.startsAt, tz, "h:mm a")}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{service.name}</p>
                      <p className="truncate text-xs text-muted-foreground">with {staff.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {a.source === "ai" ? <Badge tone="primary">AI</Badge> : null}
                      <AppointmentStatusBadge status={a.status} />
                    </div>
                    <AppointmentActions
                      appt={{
                        id: a.id,
                        status: a.status,
                        startsAt: a.startsAt.toISOString(),
                        started: a.startsAt <= now,
                        serviceId: service.id,
                        serviceName: service.name,
                        staffId: staff.id,
                        staffName: staff.name,
                        customerName: customer.name ?? "customer",
                      }}
                      timezone={tz}
                      staffOptions={opts.staffFor(service.id)}
                      maxAdvanceDays={business.maxAdvanceDays}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<CalendarDays />} title="Nothing booked" description="Use “Book appointment” to schedule their next visit." className="py-10" />
            )}
          </Card>

          <Card>
            <CardHeader title="Appointment history" />
            {past.length ? (
              <ul>
                {past.map(({ appointment: a, service, staff }) => (
                  <li key={a.id} className="flex items-center gap-3 border-t px-5 py-2.5 first:border-t-0">
                    <span className="w-28 shrink-0 text-[13px] tabular text-muted-foreground">{fmtDateTime(a.startsAt, tz, "d LLL yyyy")}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {service.name} <span className="text-muted-foreground">· {staff.name}</span>
                    </span>
                    {a.priceCents != null && a.status === "completed" ? <span className="hidden text-[13px] tabular text-muted-foreground sm:inline">{formatMoney(a.priceCents, business.currency)}</span> : null}
                    <AppointmentStatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No past appointments" className="py-10" />
            )}
          </Card>

          <Card>
            <CardHeader title="Conversations" />
            {convs.length ? (
              <ul>
                {convs.map(({ conversation: c, assigneeName }) => (
                  <li key={c.id} className="border-t first:border-t-0">
                    <Link href={`/app/inbox?c=${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface">
                      <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {CHANNEL_LABELS[c.channel] ?? c.channel}
                          {assigneeName ? <span className="font-normal text-muted-foreground"> · {assigneeName}</span> : null}
                        </p>
                        <p className="truncate text-[13px] text-muted-foreground">{c.lastMessagePreview ?? "No messages yet"}</p>
                      </div>
                      <ConversationStatusBadge status={c.status} />
                      <span className="hidden w-16 text-right text-xs text-muted-foreground sm:block">{fmtRelative(c.lastMessageAt ?? c.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No conversations" description={role === "staff" ? "Only conversations assigned to you are shown." : undefined} className="py-10" />
            )}
          </Card>

          {showLeads ? (
            <Card>
              <CardHeader title="Leads" action={<Link href="/app/leads" className="text-[13px] text-muted-foreground hover:text-foreground">All leads</Link>} />
              {leadRows.length ? (
                <ul>
                  {leadRows.map(({ lead: l, serviceName }) => (
                    <li key={l.id} className="flex items-center gap-3 border-t px-5 py-3 first:border-t-0">
                      <Target className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{serviceName ?? l.serviceInterest ?? "General enquiry"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {sourceLabel(l.source)} · created {fmtRelative(l.createdAt)}
                          {l.notes ? ` · ${l.notes}` : ""}
                        </p>
                      </div>
                      <LeadStatusBadge status={l.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No leads" className="py-10" />
              )}
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Activity" />
            {activity.length ? (
              <ol className="relative px-5 py-3">
                {activity.map((a, i) => (
                  <li key={a.id} className="relative flex gap-3 pb-4 last:pb-1">
                    {i < activity.length - 1 ? <span className="absolute left-[11px] top-6 bottom-0 w-px bg-border" /> : null}
                    <span
                      className={cn(
                        "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background",
                        a.actorType === "ai" ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {a.actorType === "ai" ? <Bot className="size-3" /> : a.entityType === "appointment" ? <CalendarDays className="size-3" /> : a.actorType === "user" ? <UserRound className="size-3" /> : <History className="size-3" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] leading-snug">{a.summary}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground" title={fmtDateTime(a.createdAt, tz)}>
                        {a.actorLabel} · {fmtRelative(a.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState icon={<History />} title="No activity yet" className="py-8" />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <CustomerDetailsForm
                customer={{ id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, notes: customer.notes, tags: customer.tags, optedOut: customer.optedOut }}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="AI memory" description="Preferences the AI remembered from conversations. Never medical data." />
            {customer.memory.facts.length ? (
              <dl className="divide-y">
                {customer.memory.facts.map((f) => (
                  <div key={f.key} className="flex gap-3 px-5 py-2.5">
                    <Brain className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <dt className="text-xs capitalize text-muted-foreground">{f.key.replace(/_/g, " ")}</dt>
                      <dd className="text-[13px]">{f.value}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            ) : (
              <EmptyState icon={<Brain />} title="Nothing remembered yet" description="As the AI learns preferences (language, preferred staff, times) they'll appear here." className="py-8" />
            )}
          </Card>

        </div>
      </div>
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular">{value}</p>
    </div>
  );
}
