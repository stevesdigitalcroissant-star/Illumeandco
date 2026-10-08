"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/action";
import { requirePermission } from "@/lib/session";
import type { Daypart } from "@/db/schema";
import { invalid } from "@/server/context";
import { addToWaitlist, confirmSlotBooked, dismissSlot, offerSlot, removeFromWaitlist } from "@/server/recovery/slots";
import { updateSlotConfig } from "@/server/recovery/slot-config";

const refresh = () => {
  revalidatePath("/app/slots");
  revalidatePath("/app");
};

export async function offerSlotAction(slotId: string) {
  const { ctx } = await requirePermission("appointments.manage");
  const r = await run(async () => {
    const res = await offerSlot(ctx, slotId);
    if (!res.sent) throw invalid(res.detail);
    return res;
  });
  refresh();
  return r.ok ? { ...r, message: r.data?.detail } : r;
}

export async function confirmSlotAction(slotId: string, valueMajor: string) {
  const { ctx } = await requirePermission("appointments.manage");
  const n = valueMajor.trim() ? Math.round(Number(valueMajor.replace(/[^\d.]/g, "")) * 100) : null;
  const r = await run(() => confirmSlotBooked(ctx, slotId, { valueCents: Number.isFinite(n) ? n : null }), "Marked as recovered.");
  refresh();
  return r;
}

export async function dismissSlotAction(slotId: string) {
  const { ctx } = await requirePermission("appointments.manage");
  const r = await run(() => dismissSlot(ctx, slotId), "Dismissed.");
  refresh();
  return r;
}

export type WaitlistForm = { customerId: string; serviceId: string; staffId: string; earliestDate: string; latestDate: string; dayparts: Daypart[]; notes: string };

export async function addWaitlistAction(f: WaitlistForm) {
  const { ctx } = await requirePermission("appointments.manage");
  const r = await run(
    () =>
      addToWaitlist(ctx, {
        customerId: f.customerId,
        serviceId: f.serviceId,
        staffId: f.staffId || null,
        earliestDate: f.earliestDate,
        latestDate: f.latestDate || null,
        dayparts: f.dayparts,
        notes: f.notes || null,
        source: "staff",
      }),
    "Added to the waitlist.",
  );
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function removeWaitlistAction(id: string) {
  const { ctx } = await requirePermission("appointments.manage");
  const r = await run(() => removeFromWaitlist(ctx, id), "Removed.");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}

export async function saveSlotSettingsAction(input: { enabled: boolean; autoOffer: boolean; batchSize: number; offerMinutes: number; template: string }) {
  const { ctx } = await requirePermission("business.manage");
  const r = await run(() => updateSlotConfig(ctx, { ...input, batchSize: Number(input.batchSize), offerMinutes: Number(input.offerMinutes) }), "Saved.");
  refresh();
  return r.ok ? { ok: true as const, message: r.message } : r;
}
