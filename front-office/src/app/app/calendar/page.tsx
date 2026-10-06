import Link from "next/link";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { requireBusiness } from "@/lib/session";
import { listAppointments } from "@/server/services/appointments";
import { getBusinessHours } from "@/server/services/business";
import { listBlackouts } from "@/server/services/catalog";
import { bookingOptions } from "../appointments/data";
import { CalendarView, type CalAppt, type CalDay } from "./calendar-view";
import { StaffFilter } from "./staff-filter";

export const metadata = { title: "Calendar" };

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string; staff?: string }> }) {
  const { ctx, business } = await requireBusiness();
  const sp = await searchParams;
  const tz = business.timezone;
  const now = DateTime.now().setZone(tz);
  const parsed = sp.week ? DateTime.fromISO(sp.week, { zone: tz }) : null;
  const weekStart = (parsed?.isValid ? parsed : now).startOf("week"); // ISO week: Monday
  const weekEnd = weekStart.plus({ days: 7 });

  const [hours, blackouts, opts] = await Promise.all([getBusinessHours(ctx), listBlackouts(ctx), bookingOptions(ctx)]);
  const staffId = opts.staff.some((s) => s.id === sp.staff) ? sp.staff : undefined;
  const rows = await listAppointments(ctx, {
    from: weekStart.toJSDate(),
    to: weekEnd.toJSDate(),
    staffId,
    status: ["booked", "confirmed", "completed", "no_show"],
  });

  const appts: CalAppt[] = rows.map(({ appointment: a, customer, service, staff }) => {
    const s = DateTime.fromJSDate(a.startsAt).setZone(tz);
    const e = DateTime.fromJSDate(a.endsAt).setZone(tz);
    const day = Math.floor(s.startOf("day").diff(weekStart, "days").days);
    const sMin = s.hour * 60 + s.minute;
    const eMin = e.hasSame(s, "day") ? e.hour * 60 + e.minute : 24 * 60;
    return {
      id: a.id,
      day,
      startMin: sMin,
      endMin: Math.max(eMin, sMin + 15),
      timeLabel: `${s.toFormat("h:mm")} – ${e.toFormat("h:mm a")}`,
      startLabel: s.toFormat("h:mm a"),
      dateLabel: s.toFormat("cccc d LLLL"),
      startsAt: a.startsAt.toISOString(),
      started: a.startsAt.getTime() <= now.toMillis(),
      status: a.status,
      source: a.source,
      customerId: customer.id,
      customerName: customer.name ?? customer.phone ?? customer.email ?? "Customer",
      customerContact: customer.phone ?? customer.email ?? null,
      serviceId: service.id,
      serviceName: service.name,
      staffId: staff.id,
      staffName: staff.name,
      notes: a.notes,
    };
  });
  // Visible hour range: business hours ±1h (fallback 08–21), widened to fit any appointment.
  const baseStart = hours.length ? Math.min(...hours.map((h) => toMin(h.openTime))) - 60 : 8 * 60;
  const baseEnd = hours.length ? Math.max(...hours.map((h) => toMin(h.closeTime))) + 60 : 21 * 60;
  const startMin = Math.max(0, Math.floor(Math.min(baseStart, ...appts.map((a) => a.startMin)) / 60) * 60);
  const endMin = Math.min(24 * 60, Math.ceil(Math.max(baseEnd, ...appts.map((a) => a.endMin)) / 60) * 60);

  const staffName = (id: string | null) => opts.staff.find((s) => s.id === id)?.name ?? "A staff member";
  const days: CalDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = weekStart.plus({ days: i });
    const iso = d.toISODate()!;
    const open = hours.filter((h) => h.weekday === d.weekday).map((h) => [toMin(h.openTime), toMin(h.closeTime)] as [number, number]);
    const covering = blackouts.filter((b) => b.startDate <= iso && b.endDate >= iso);
    const whole = covering.find((b) => !b.staffId || b.staffId === staffId);
    return {
      iso,
      weekday: d.toFormat("ccc"),
      dayNum: d.toFormat("d"),
      longLabel: d.toFormat("cccc d LLLL"),
      isToday: d.hasSame(now, "day"),
      open,
      blackout: whole ? (whole.reason ?? (whole.staffId ? `${staffName(whole.staffId)} unavailable` : "Closed")) : null,
      staffOff: whole ? [] : covering.filter((b) => b.staffId).map((b) => `${staffName(b.staffId)} off${b.reason ? ` (${b.reason})` : ""}`),
    };
  });
  const nowIn = now >= weekStart && now < weekEnd ? { day: Math.floor(now.startOf("day").diff(weekStart, "days").days), min: now.hour * 60 + now.minute } : null;

  const qs = (week: DateTime | null) => {
    const p = new URLSearchParams();
    if (week) p.set("week", week.toISODate()!);
    if (staffId) p.set("staff", staffId);
    const s = p.toString();
    return s ? `/app/calendar?${s}` : "/app/calendar";
  };
  const sameMonth = weekStart.month === weekEnd.minus({ days: 1 }).month;
  const rangeLabel = `${weekStart.toFormat(sameMonth ? "d" : "d LLL")} – ${weekEnd.minus({ days: 1 }).toFormat("d LLL yyyy")}`;
  const isThisWeek = weekStart.hasSame(now.startOf("week"), "day");

  const staffFor: Record<string, { id: string; name: string }[]> = {};
  for (const s of opts.services) staffFor[s.id] = opts.staffFor(s.id);

  return (
    <>
      <PageHeader
        title="Calendar"
        description={`Week of ${rangeLabel} · ${rows.length} appointment${rows.length === 1 ? "" : "s"} · times in ${tz.replace("_", " ")}`}
        actions={
          <>
            <StaffFilter staff={opts.staff} value={staffId ?? ""} week={sp.week && parsed?.isValid ? weekStart.toISODate()! : ""} />
            <div className="flex items-center rounded-md border bg-background">
              <Button asChild variant="ghost" size="icon" className="rounded-r-none" aria-label="Previous week">
                <Link href={qs(weekStart.minus({ weeks: 1 }))}>
                  <ChevronLeft />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="h-9 rounded-none border-x" aria-disabled={isThisWeek}>
                <Link href={qs(null)}>Today</Link>
              </Button>
              <Button asChild variant="ghost" size="icon" className="rounded-l-none" aria-label="Next week">
                <Link href={qs(weekStart.plus({ weeks: 1 }))}>
                  <ChevronRight />
                </Link>
              </Button>
            </div>
          </>
        }
      />
      <CalendarView
        days={days}
        appts={appts}
        startMin={startMin}
        endMin={endMin}
        now={nowIn}
        timezone={tz}
        maxAdvanceDays={business.maxAdvanceDays}
        staffFor={staffFor}
      />
    </>
  );
}
