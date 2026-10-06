/** Services, staff, staff availability and blackout dates. */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db as rootDb, type Tx } from "@/db";
import { availability, blackoutDates, serviceStaff, services, staff } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, notFound, type Ctx } from "../context";
import { validateHours } from "./business";

async function inTx<T>(ctx: Ctx, fn: (tx: Tx) => Promise<T>) {
  return ctx.tx ? fn(ctx.tx) : rootDb.transaction(fn);
}

// ─── Services ────────────────────────────────────────────────────────
export type ServiceInput = {
  name: string;
  description?: string | null;
  category?: string | null;
  priceCents?: number | null;
  priceIsFrom?: boolean;
  durationMinutes: number;
  bufferMinutes?: number | null;
  onlineBookingEnabled?: boolean;
  active?: boolean;
  staffIds?: string[];
};

function validateService(input: Partial<ServiceInput>) {
  if (input.name !== undefined && !input.name.trim()) throw invalid("Service name is required.");
  if (input.durationMinutes !== undefined && (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0 || input.durationMinutes > 1440))
    throw invalid("Duration must be between 1 and 1440 minutes.");
  if (input.priceCents != null && (!Number.isInteger(input.priceCents) || input.priceCents < 0))
    throw invalid("Price must be a positive amount.");
  if (input.bufferMinutes != null && (input.bufferMinutes < 0 || input.bufferMinutes > 240))
    throw invalid("Buffer must be between 0 and 240 minutes.");
}

/** Ensure every staff id belongs to this business — never trust ids from the client. */
async function assertStaffInBusiness(ctx: Ctx, staffIds: string[], tx: Tx) {
  if (!staffIds.length) return;
  const rows = await tx
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.businessId, ctx.businessId), inArray(staff.id, staffIds)));
  if (rows.length !== new Set(staffIds).size) throw notFound("Staff member");
}

export async function listServices(ctx: Ctx, opts: { includeInactive?: boolean } = {}) {
  const rows = await dbOf(ctx)
    .select()
    .from(services)
    .where(
      opts.includeInactive
        ? eq(services.businessId, ctx.businessId)
        : and(eq(services.businessId, ctx.businessId), eq(services.active, true)),
    )
    .orderBy(asc(services.name));
  const links = await dbOf(ctx)
    .select({ serviceId: serviceStaff.serviceId, staffId: serviceStaff.staffId })
    .from(serviceStaff)
    .where(eq(serviceStaff.businessId, ctx.businessId));
  return rows.map((s) => ({ ...s, staffIds: links.filter((l) => l.serviceId === s.id).map((l) => l.staffId) }));
}

export async function getService(ctx: Ctx, serviceId: string) {
  const s = await dbOf(ctx).query.services.findFirst({
    where: and(eq(services.businessId, ctx.businessId), eq(services.id, serviceId)),
  });
  if (!s) throw notFound("Service");
  return s;
}

export async function createService(ctx: Ctx, input: ServiceInput) {
  assertCan(ctx, "business.manage");
  validateService(input);
  return inTx(ctx, async (tx) => {
    await assertStaffInBusiness(ctx, input.staffIds ?? [], tx);
    const { staffIds, ...values } = input;
    const [s] = await tx
      .insert(services)
      .values({ ...values, name: values.name.trim(), businessId: ctx.businessId })
      .returning();
    if (staffIds?.length)
      await tx
        .insert(serviceStaff)
        .values(staffIds.map((staffId) => ({ businessId: ctx.businessId, serviceId: s!.id, staffId })));
    await audit({ ...ctx, tx }, {
      action: "service.updated",
      summary: `Service "${s!.name}" created`,
      entityType: "service",
      entityId: s!.id,
    });
    return s!;
  });
}

export async function updateService(ctx: Ctx, serviceId: string, patch: Partial<ServiceInput>) {
  assertCan(ctx, "business.manage");
  validateService(patch);
  return inTx(ctx, async (tx) => {
    const existing = await getService({ ...ctx, tx }, serviceId);
    const { staffIds, ...values } = patch;
    const [s] = await tx
      .update(services)
      .set(values)
      .where(and(eq(services.businessId, ctx.businessId), eq(services.id, serviceId)))
      .returning();
    if (staffIds) {
      await assertStaffInBusiness(ctx, staffIds, tx);
      await tx.delete(serviceStaff).where(and(eq(serviceStaff.businessId, ctx.businessId), eq(serviceStaff.serviceId, serviceId)));
      if (staffIds.length)
        await tx.insert(serviceStaff).values(staffIds.map((staffId) => ({ businessId: ctx.businessId, serviceId, staffId })));
    }
    const priceChanged = patch.priceCents !== undefined && patch.priceCents !== existing.priceCents;
    await audit({ ...ctx, tx }, {
      action: "service.updated",
      summary: `Service "${s!.name}" updated${priceChanged ? " (price changed)" : ""}`,
      entityType: "service",
      entityId: serviceId,
      details: { changes: Object.keys(patch), ...(priceChanged ? { oldPriceCents: existing.priceCents, newPriceCents: patch.priceCents } : {}) },
    });
    return s!;
  });
}

/** Services are archived, not deleted, so past appointments keep their history. */
export async function archiveService(ctx: Ctx, serviceId: string) {
  return updateService(ctx, serviceId, { active: false });
}

// ─── Staff ───────────────────────────────────────────────────────────
export type StaffInput = {
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  userId?: string | null;
  active?: boolean;
};

export async function listStaff(ctx: Ctx, opts: { includeInactive?: boolean } = {}) {
  return dbOf(ctx)
    .select()
    .from(staff)
    .where(
      opts.includeInactive
        ? eq(staff.businessId, ctx.businessId)
        : and(eq(staff.businessId, ctx.businessId), eq(staff.active, true)),
    )
    .orderBy(asc(staff.name));
}

export async function getStaff(ctx: Ctx, staffId: string) {
  const s = await dbOf(ctx).query.staff.findFirst({ where: and(eq(staff.businessId, ctx.businessId), eq(staff.id, staffId)) });
  if (!s) throw notFound("Staff member");
  return s;
}

export async function createStaff(ctx: Ctx, input: StaffInput) {
  assertCan(ctx, "business.manage");
  if (!input.name?.trim()) throw invalid("Staff name is required.");
  const [s] = await dbOf(ctx)
    .insert(staff)
    .values({ ...input, name: input.name.trim(), businessId: ctx.businessId })
    .returning();
  await audit(ctx, { action: "staff.updated", summary: `Staff member "${s!.name}" added`, entityType: "staff", entityId: s!.id });
  return s!;
}

export async function updateStaff(ctx: Ctx, staffId: string, patch: Partial<StaffInput>) {
  assertCan(ctx, "business.manage");
  await getStaff(ctx, staffId);
  if (patch.name !== undefined && !patch.name.trim()) throw invalid("Staff name is required.");
  const [s] = await dbOf(ctx)
    .update(staff)
    .set(patch)
    .where(and(eq(staff.businessId, ctx.businessId), eq(staff.id, staffId)))
    .returning();
  await audit(ctx, { action: "staff.updated", summary: `Staff member "${s!.name}" updated`, entityType: "staff", entityId: staffId });
  return s!;
}

// ─── Staff availability (working hours + breaks) ─────────────────────
export type AvailabilityInput = { kind: "work" | "break"; weekday: number; startTime: string; endTime: string }[];

export async function getStaffAvailability(ctx: Ctx, staffId?: string) {
  return dbOf(ctx)
    .select()
    .from(availability)
    .where(
      staffId
        ? and(eq(availability.businessId, ctx.businessId), eq(availability.staffId, staffId))
        : eq(availability.businessId, ctx.businessId),
    )
    .orderBy(asc(availability.weekday), asc(availability.startTime));
}

export async function setStaffAvailability(ctx: Ctx, staffId: string, rows: AvailabilityInput) {
  assertCan(ctx, "business.manage");
  validateHours(rows.map((r) => ({ weekday: r.weekday, openTime: r.startTime, closeTime: r.endTime })));
  await getStaff(ctx, staffId);
  await inTx(ctx, async (tx) => {
    await tx.delete(availability).where(and(eq(availability.businessId, ctx.businessId), eq(availability.staffId, staffId)));
    if (rows.length)
      await tx.insert(availability).values(rows.map((r) => ({ ...r, staffId, businessId: ctx.businessId })));
  });
  await audit(ctx, { action: "staff.updated", summary: "Staff availability updated", entityType: "staff", entityId: staffId });
}

// ─── Blackout dates ──────────────────────────────────────────────────
export async function listBlackouts(ctx: Ctx) {
  return dbOf(ctx).select().from(blackoutDates).where(eq(blackoutDates.businessId, ctx.businessId)).orderBy(asc(blackoutDates.startDate));
}

export async function addBlackout(ctx: Ctx, input: { startDate: string; endDate: string; reason?: string; staffId?: string | null }) {
  assertCan(ctx, "business.manage");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) throw invalid("Dates must be YYYY-MM-DD.");
  if (input.endDate < input.startDate) throw invalid("End date must be on or after start date.");
  if (input.staffId) await getStaff(ctx, input.staffId);
  const [row] = await dbOf(ctx)
    .insert(blackoutDates)
    .values({ businessId: ctx.businessId, startDate: input.startDate, endDate: input.endDate, reason: input.reason ?? null, staffId: input.staffId ?? null })
    .returning();
  await audit(ctx, {
    action: "business.updated",
    summary: `Blackout ${input.startDate} → ${input.endDate} added${input.reason ? ` (${input.reason})` : ""}`,
    entityType: "blackout",
    entityId: row!.id,
  });
  return row!;
}

export async function removeBlackout(ctx: Ctx, id: string) {
  assertCan(ctx, "business.manage");
  await dbOf(ctx).delete(blackoutDates).where(and(eq(blackoutDates.businessId, ctx.businessId), eq(blackoutDates.id, id)));
}
