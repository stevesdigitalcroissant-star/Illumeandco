"use server";
import { revalidatePath } from "next/cache";
import { moneyToCents, num, optStr, run, str, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/session";
import { invalid } from "@/server/context";
import { BUSINESS_TYPES } from "@/server/defaults";
import { setBusinessHours, updateBusiness, type BusinessUpdate } from "@/server/services/business";
import {
  addBlackout,
  archiveService,
  createService,
  createStaff,
  removeBlackout,
  setStaffAvailability,
  updateService,
  updateStaff,
  type AvailabilityInput,
} from "@/server/services/catalog";
import { rotateWebhookSecret } from "@/server/integrations/connectors";
import { updateSenders } from "@/server/services/senders";
import { updateAlertsConfig } from "@/server/services/alerts";
import { updateWhatsappTemplates } from "@/server/services/whatsapp-templates";
import { ingestEvent } from "@/server/integrations/ingest";
import { updateRecoveryConfig } from "@/server/recovery/config";
import { addExistingMember, changeMemberRole, inviteNewMember, listMembers, removeMember } from "@/server/services/team";

const revalidate = () => revalidatePath("/app/settings");
type Prev = ActionResult<unknown> | null;

function intRange(v: number | null, min: number, max: number, label: string) {
  if (v == null || !Number.isInteger(v) || v < min || v > max) throw invalid(`${label} must be a whole number between ${min} and ${max}.`);
  return v;
}

// ─── Business profile + booking engine ───────────────────────────────
export async function saveBusinessAction(_prev: Prev, fd: FormData) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const type = str(fd, "type");
    if (!BUSINESS_TYPES.some((t) => t.value === type)) throw invalid("Choose a business type.");
    const currency = str(fd, "currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw invalid("Currency must be a 3-letter code such as AED or USD.");
    const website = optStr(fd, "website");
    if (website && !/^https?:\/\//i.test(website)) throw invalid("Website must start with http:// or https://.");
    const email = optStr(fd, "email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("Please enter a valid email address.");
    const patch: BusinessUpdate = {
      name: str(fd, "name"),
      type: type as BusinessUpdate["type"],
      description: optStr(fd, "description"),
      address: optStr(fd, "address"),
      city: optStr(fd, "city"),
      country: optStr(fd, "country"),
      phone: optStr(fd, "phone"),
      email,
      website,
      timezone: str(fd, "timezone"),
      currency,
      slotIntervalMinutes: intRange(num(fd, "slotIntervalMinutes"), 5, 240, "Slot interval"),
      defaultBufferMinutes: intRange(num(fd, "defaultBufferMinutes"), 0, 240, "Default buffer"),
      minNoticeMinutes: intRange(num(fd, "minNoticeMinutes"), 0, 10080, "Minimum notice"),
      maxAdvanceDays: intRange(num(fd, "maxAdvanceDays"), 1, 730, "Booking window"),
    };
    await updateBusiness(ctx, patch);
    revalidatePath("/app", "layout");
  }, "Business details saved.");
}

export async function savePoliciesAction(_prev: Prev, fd: FormData) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const clip = (k: string) => {
      const v = str(fd, k);
      if (v.length > 2000) throw invalid("Each policy must be 2,000 characters or fewer.");
      return v || undefined;
    };
    await updateBusiness(ctx, { policies: { cancellation: clip("cancellation"), refund: clip("refund"), late: clip("late"), booking: clip("booking") } });
    revalidate();
  }, "Policies saved.");
}

// ─── Opening hours ───────────────────────────────────────────────────
export async function saveHoursAction(rows: { weekday: number; openTime: string; closeTime: string }[]) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const clean = (Array.isArray(rows) ? rows : []).map((r) => ({ weekday: Number(r.weekday), openTime: String(r.openTime), closeTime: String(r.closeTime) }));
    assertNoOverlap(clean.map((r) => ({ weekday: r.weekday, start: r.openTime, end: r.closeTime })));
    await setBusinessHours(ctx, clean);
    revalidate();
  }, "Opening hours saved.");
}

function assertNoOverlap(rows: { weekday: number; start: string; end: string }[]) {
  const sorted = [...rows].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    if (a.weekday === b.weekday && b.start < a.end) throw invalid("Time ranges on the same day can't overlap.");
  }
}

// ─── Services ────────────────────────────────────────────────────────
export type ServiceForm = {
  name: string;
  description: string;
  category: string;
  price: string;
  priceIsFrom: boolean;
  durationMinutes: number;
  bufferMinutes: string;
  onlineBookingEnabled: boolean;
  staffIds: string[];
};

export async function saveServiceAction(id: string | null, f: ServiceForm) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const input = {
      name: String(f.name ?? "").trim(),
      description: String(f.description ?? "").trim() || null,
      category: String(f.category ?? "").trim() || null,
      priceCents: moneyToCents(String(f.price ?? "")),
      priceIsFrom: Boolean(f.priceIsFrom),
      durationMinutes: Number(f.durationMinutes),
      bufferMinutes: String(f.bufferMinutes ?? "").trim() === "" ? null : Number(f.bufferMinutes),
      onlineBookingEnabled: Boolean(f.onlineBookingEnabled),
      staffIds: (Array.isArray(f.staffIds) ? f.staffIds : []).map(String),
    };
    if (id) await updateService(ctx, String(id), input);
    else await createService(ctx, input);
    revalidate();
  }, id ? "Service saved." : "Service added.");
}

export async function setServiceActiveAction(id: string, active: boolean) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    if (active) await updateService(ctx, String(id), { active: true });
    else await archiveService(ctx, String(id));
    revalidate();
  }, active ? "Service restored." : "Service archived.");
}

// ─── Staff ───────────────────────────────────────────────────────────
export type StaffForm = { name: string; title: string; email: string; phone: string; userId: string };

export async function saveStaffAction(id: string | null, f: StaffForm) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const userId = String(f.userId ?? "") || null;
    // A linked login must belong to this organization's team.
    if (userId && !(await listMembers(ctx)).some((m) => m.userId === userId)) throw invalid("That team member was not found.");
    const input = {
      name: String(f.name ?? "").trim(),
      title: String(f.title ?? "").trim() || null,
      email: String(f.email ?? "").trim() || null,
      phone: String(f.phone ?? "").trim() || null,
      userId,
    };
    if (id) await updateStaff(ctx, String(id), input);
    else await createStaff(ctx, input);
    revalidate();
  }, id ? "Staff member saved." : "Staff member added.");
}

export async function setStaffActiveAction(id: string, active: boolean) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    await updateStaff(ctx, String(id), { active: Boolean(active) });
    revalidate();
  }, active ? "Staff member reactivated." : "Staff member deactivated.");
}

export async function saveStaffAvailabilityAction(staffId: string, rows: AvailabilityInput) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const clean: AvailabilityInput = (Array.isArray(rows) ? rows : []).map((r) => ({
      kind: r.kind === "break" ? "break" : "work",
      weekday: Number(r.weekday),
      startTime: String(r.startTime),
      endTime: String(r.endTime),
    }));
    assertNoOverlap(clean.filter((r) => r.kind === "work").map((r) => ({ weekday: r.weekday, start: r.startTime, end: r.endTime })));
    await setStaffAvailability(ctx, String(staffId), clean);
    revalidate();
  }, "Working hours saved.");
}

// ─── Blackouts ───────────────────────────────────────────────────────
export async function addBlackoutAction(_prev: Prev, fd: FormData) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const startDate = str(fd, "startDate");
    await addBlackout(ctx, { startDate, endDate: str(fd, "endDate") || startDate, reason: str(fd, "reason") || undefined, staffId: optStr(fd, "staffId") });
    revalidate();
  }, "Closure added.");
}

export async function removeBlackoutAction(id: string) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    await removeBlackout(ctx, String(id));
    revalidate();
  }, "Closure removed.");
}

// ─── Team ────────────────────────────────────────────────────────────
export async function addMemberAction(input: { mode: "existing" | "invite"; name: string; email: string; role: string }) {
  return run(async () => {
    const { ctx } = await requirePermission("members.manage");
    const res =
      input.mode === "invite"
        ? await inviteNewMember(ctx, { name: String(input.name ?? ""), email: String(input.email ?? ""), role: String(input.role) })
        : { ...(await addExistingMember(ctx, { email: String(input.email ?? ""), role: String(input.role) })), temporaryPassword: null };
    revalidate();
    return { name: res.name, email: res.email, temporaryPassword: res.temporaryPassword };
  });
}

export async function changeRoleAction(memberId: string, role: string) {
  return run(async () => {
    const { ctx } = await requirePermission("members.manage");
    await changeMemberRole(ctx, String(memberId), String(role));
    revalidatePath("/app", "layout");
  }, "Role updated.");
}

export async function removeMemberAction(memberId: string) {
  return run(async () => {
    const { ctx } = await requirePermission("members.manage");
    await removeMember(ctx, String(memberId));
    revalidate();
  }, "Removed from the team.");
}

export async function saveWhatsappTemplatesAction(input: Record<string, { contentSid: string; variables: string }>) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    await updateWhatsappTemplates(ctx, input);
    revalidate();
  }, "Saved.");
}

// ─── Try it: simulated events (go through the real pipeline, labelled "test") ──
export async function simulateEventAction(input: { type: "call.missed" | "lead.created"; name: string; phone: string; email: string; service: string; message: string }) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const payload =
      input.type === "call.missed"
        ? { from: input.phone, callerName: input.name || undefined, reason: "no_answer" }
        : { name: input.name || undefined, phone: input.phone || undefined, email: input.email || undefined, service: input.service || undefined, message: input.message || undefined, source: "test form" };
    const r = await ingestEvent(ctx.businessId, { connector: "test", externalId: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: input.type, payload });
    revalidate();
    return { status: r.event.status, result: r.event.result ?? "" };
  });
}

// ─── Staff alerts ────────────────────────────────────────────────────
export async function saveAlertsAction(input: { instant: boolean; digest: boolean; digestHour: number; smsTo: string; emailTo: string }) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    await updateAlertsConfig(ctx, { ...input, digestHour: Number(input.digestHour) });
    revalidate();
  }, "Saved.");
}

// ─── Integrations & missed-call recovery ─────────────────────────────
export async function saveSendersAction(_prev: Prev, fd: FormData) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    await updateSenders(ctx, { smsFrom: optStr(fd, "smsFrom"), whatsappFrom: optStr(fd, "whatsappFrom") });
    revalidate();
  }, "Saved.");
}

export async function rotateWebhookSecretAction() {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    const secret = await rotateWebhookSecret(ctx);
    revalidate();
    return { secret };
  });
}

export async function saveRecoveryAction(worker: "missedCall" | "leads", input: { enabled: boolean; auto: boolean; template: string }) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    await updateRecoveryConfig(ctx, worker === "leads" ? "leads" : "missedCall", { enabled: Boolean(input.enabled), auto: Boolean(input.auto), template: String(input.template ?? "") });
    revalidate();
  }, "Saved.");
}
