import "server-only";
import type { Ctx } from "@/server/context";
import { listServices, listStaff } from "@/server/services/catalog";
import type { ServiceOption } from "./new-appointment-dialog";
import type { StaffOption } from "./slot-picker";

/** Serialisable service/staff options for the booking & reschedule dialogs. */
export async function bookingOptions(ctx: Ctx) {
  const [svc, stf] = await Promise.all([listServices(ctx), listStaff(ctx)]);
  const staff: StaffOption[] = stf.map((s) => ({ id: s.id, name: s.name }));
  const services: ServiceOption[] = svc.map((s) => ({
    id: s.id,
    name: s.name,
    durationMinutes: s.durationMinutes,
    priceCents: s.priceCents,
    priceFrom: s.priceIsFrom,
    staffIds: s.staffIds,
  }));
  const staffFor = (serviceId: string): StaffOption[] => {
    const ids = services.find((s) => s.id === serviceId)?.staffIds ?? [];
    return ids.length ? staff.filter((s) => ids.includes(s.id)) : staff;
  };
  return { services, staff, staffFor };
}
