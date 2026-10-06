import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, EmptyState, PageHeader, Table } from "@/components/ui/misc";
import { AppointmentStatusBadge } from "@/components/status";
import { fmtDateTime } from "@/lib/format";
import { requireBusiness } from "@/lib/session";
import { cn, formatMoney } from "@/lib/utils";
import { listAppointments } from "@/server/services/appointments";
import { AppointmentActions } from "./appointment-actions";
import { bookingOptions } from "./data";
import { NewAppointmentDialog } from "./new-appointment-dialog";

export const metadata = { title: "Appointments" };

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { ctx, business } = await requireBusiness();
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "upcoming";
  const tz = business.timezone;
  const now = new Date();

  const [rows, opts] = await Promise.all([
    tab === "upcoming"
      ? listAppointments(ctx, { from: now, status: ["booked", "confirmed"] })
      : tab === "past"
        ? listAppointments(ctx, { to: now, status: ["booked", "confirmed", "completed", "no_show"] }).then((r) => r.reverse())
        : listAppointments(ctx, { status: ["cancelled"] }).then((r) => r.reverse()),
    bookingOptions(ctx),
  ]);
  const needsOutcome = tab === "past" ? rows.filter((r) => r.appointment.status === "booked" || r.appointment.status === "confirmed").length : 0;

  return (
    <>
      <PageHeader
        title="Appointments"
        description={`All times in ${tz.replace("_", " ")}.`}
        actions={
          <NewAppointmentDialog
            services={opts.services}
            staff={opts.staff}
            timezone={tz}
            currency={business.currency}
            maxAdvanceDays={business.maxAdvanceDays}
          />
        }
      />

      <div className="mb-4 flex items-center gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "upcoming" ? "/app/appointments" : `/app/appointments?tab=${t.key}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {needsOutcome ? (
        <p className="mb-3 text-[13px] text-muted-foreground">
          <span className="font-medium text-warning">{needsOutcome}</span> past appointment{needsOutcome > 1 ? "s" : ""} still need an outcome — mark them
          completed or no-show to keep reports and review requests accurate.
        </p>
      ) : null}

      <Card>
        {rows.length ? (
          <Table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Customer</th>
                <th>Service</th>
                <th>Staff</th>
                <th>Status</th>
                <th>Source</th>
                <th className="text-right">Price</th>
                <th className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ appointment: a, customer, service, staff }) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">
                    <p className="font-medium tabular">{fmtDateTime(a.startsAt, tz, "ccc d LLL")}</p>
                    <p className="text-xs text-muted-foreground tabular">
                      {fmtDateTime(a.startsAt, tz, "h:mm a")} – {fmtDateTime(a.endsAt, tz, "h:mm a")}
                    </p>
                  </td>
                  <td className="min-w-44">
                    <Link href={`/app/customers/${customer.id}`} className="group flex items-center gap-2.5">
                      <Avatar name={customer.name} className="size-7" />
                      <span className="min-w-0">
                        <span className="block truncate group-hover:underline">{customer.name ?? "Customer"}</span>
                        <span className="block truncate text-xs text-muted-foreground">{customer.phone ?? customer.email ?? ""}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap">
                    {service.name}
                    <span className="block text-xs text-muted-foreground">{service.durationMinutes} min</span>
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">{staff.name}</td>
                  <td>
                    <AppointmentStatusBadge status={a.status} />
                    {a.status === "cancelled" && a.cancelReason ? (
                      <span className="mt-1 block max-w-48 truncate text-xs text-muted-foreground" title={a.cancelReason}>
                        {a.cancelReason}
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap">
                    {a.source === "ai" ? <Badge tone="primary">AI</Badge> : <span className="text-[13px] capitalize text-muted-foreground">{a.source.replace("_", " ")}</span>}
                  </td>
                  <td className="whitespace-nowrap text-right tabular">{a.priceCents != null ? formatMoney(a.priceCents, business.currency) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="text-right">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={<CalendarDays />}
            title={tab === "upcoming" ? "No upcoming appointments" : tab === "past" ? "No past appointments yet" : "No cancellations"}
            description={
              tab === "upcoming"
                ? "Appointments booked by the AI or your team will appear here."
                : tab === "past"
                  ? "Completed and no-show appointments are kept here."
                  : "Cancelled appointments and their reasons show up here."
            }
          />
        )}
      </Card>
    </>
  );
}
