"use server";
import { assertCanAddLocation } from "@/server/services/plan-limits";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { moneyToCents, num, optStr, run, str, type ActionResult } from "@/lib/action";
import { requireBusiness, requireUser } from "@/lib/session";
import type { AiPermissions } from "@/db/schema";
import { membershipsFor, setActiveBusiness } from "@/server/auth";
import { invalid, roleCan } from "@/server/context";
import { BUSINESS_TYPES } from "@/server/defaults";
import { updateAgent, updateAiPermissions } from "@/server/services/ai-config";
import {
  createBusiness,
  isValidTimezone,
  ONBOARDING_STEPS,
  setBusinessHours,
  setOnboardingStep,
  updateBusiness,
  type HoursInput,
} from "@/server/services/business";
import { archiveService, createService, createStaff, updateService, updateStaff } from "@/server/services/catalog";
import { addSource, formatFaqs, listSources, updateSourceContent } from "@/server/services/knowledge";
import { CURRENCIES, EMOJI_OPTIONS, FAQ_SOURCE_TITLE, LANGUAGES, ONBOARDING_PERMISSIONS, TONES } from "./options";

const LAST = ONBOARDING_STEPS.length;

/** Resolve the active business for onboarding; only people who can manage it may run setup. */
async function manager() {
  const r = await requireBusiness();
  if (!roleCan(r.role, "business.manage")) redirect("/app");
  return r;
}

function nextUrl(step: number) {
  return step >= LAST ? "/app" : `/onboarding?step=${step + 1}`;
}

async function advance(step: number): Promise<never> {
  const { ctx } = await manager();
  await setOnboardingStep(ctx, step >= LAST ? LAST + 1 : step + 1);
  revalidatePath("/app", "layout");
  redirect(nextUrl(step));
}

// ─── Step 1: create (or rename) the business ─────────────────────────
export async function createBusinessAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const { user, token } = await requireUser();
  const name = str(fd, "name");
  const r = await run(async () => {
    if (!name) throw invalid("Please enter your business name.");
    if (name.length > 120) throw invalid("That name is too long.");
    const orgs = await membershipsFor(user.id);
    const owned = orgs.find((m) => m.role === "owner");
    if (!owned) throw invalid("Only an organization owner can create a business.");
    await assertCanAddLocation(owned.organizationId);
    const business = await createBusiness(owned.organizationId, { name });
    await setActiveBusiness(token, business.id);
    return business.id;
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  redirect("/onboarding?step=2");
}

export async function renameBusinessAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const { ctx } = await manager();
  const r = await run(() => updateBusiness(ctx, { name: str(fd, "name") }));
  if (!r.ok) return r;
  return advance(1);
}

// ─── Skip ────────────────────────────────────────────────────────────
export async function skipStepAction(stepInput: number) {
  const step = Math.trunc(Number(stepInput));
  if (!Number.isFinite(step) || step < 2 || step > LAST) redirect("/onboarding");
  await advance(step);
}

/** Continue from a step whose data is saved as you go (services, staff). */
export async function continueStepAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  await skipStepAction(Number(fd.get("step")));
  return { ok: true };
}

// ─── Step 2: type ────────────────────────────────────────────────────
export async function saveTypeAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const { ctx } = await manager();
  const type = str(fd, "type");
  const r = await run(async () => {
    const match = BUSINESS_TYPES.find((t) => t.value === type);
    if (!match) throw invalid("Please choose a business type.");
    await updateBusiness(ctx, { type: match.value });
  });
  if (!r.ok) return r;
  return advance(2);
}

// ─── Step 3: location ────────────────────────────────────────────────
export async function saveLocationAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const { ctx } = await manager();
  const r = await run(async () => {
    const timezone = str(fd, "timezone");
    if (!isValidTimezone(timezone)) throw invalid("Please choose a valid timezone.");
    const currency = str(fd, "currency").toUpperCase();
    if (!CURRENCIES.some((c) => c.code === currency)) throw invalid("Please choose a currency.");
    const email = optStr(fd, "email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("Please enter a valid email address.");
    let website = optStr(fd, "website");
    if (website) {
      if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
      try {
        new URL(website);
      } catch {
        throw invalid("Please enter a valid website address.");
      }
    }
    await updateBusiness(ctx, {
      address: optStr(fd, "address"),
      city: optStr(fd, "city"),
      country: optStr(fd, "country"),
      timezone,
      currency,
      phone: optStr(fd, "phone"),
      email,
      website,
    });
  });
  if (!r.ok) return r;
  return advance(3);
}

// ─── Step 4: opening hours ───────────────────────────────────────────
export async function saveHoursAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const { ctx } = await manager();
  const r = await run(async () => {
    const rows: HoursInput = [];
    for (let d = 1; d <= 7; d++) {
      if (fd.get(`open_${d}`) !== "on") continue;
      rows.push({ weekday: d, openTime: str(fd, `from_${d}`), closeTime: str(fd, `to_${d}`) });
    }
    await setBusinessHours(ctx, rows);
  });
  if (!r.ok) return r;
  return advance(4);
}

// ─── Step 5: services ────────────────────────────────────────────────
function serviceInput(fd: FormData) {
  const name = str(fd, "name");
  if (!name) throw invalid("Service name is required.");
  const rawPrice = str(fd, "price");
  const priceCents = moneyToCents(rawPrice);
  if (rawPrice && priceCents === null) throw invalid("Please enter a valid price.");
  const duration = num(fd, "durationMinutes");
  if (duration === null || !Number.isInteger(duration)) throw invalid("Please enter the duration in whole minutes.");
  return {
    name,
    description: optStr(fd, "description"),
    priceCents,
    priceIsFrom: fd.get("priceIsFrom") === "on",
    durationMinutes: duration,
    onlineBookingEnabled: fd.get("onlineBookingEnabled") === "on",
    staffIds: fd.getAll("staffIds").filter((v): v is string => typeof v === "string" && v.length > 0),
  };
}

export async function saveServiceAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const { ctx } = await manager();
  const id = str(fd, "id");
  const r = await run(async () => {
    const input = serviceInput(fd);
    if (id) await updateService(ctx, id, input);
    else await createService(ctx, input);
  }, id ? "Service updated." : "Service added.");
  revalidatePath("/onboarding");
  return r;
}

export async function removeServiceAction(id: string): Promise<ActionResult<unknown>> {
  const { ctx } = await manager();
  const r = await run(() => archiveService(ctx, id), "Service removed.");
  revalidatePath("/onboarding");
  return r;
}

// ─── Step 6: staff ───────────────────────────────────────────────────
export async function saveStaffAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const { ctx } = await manager();
  const id = str(fd, "id");
  const r = await run(async () => {
    const name = str(fd, "name");
    if (!name) throw invalid("Staff name is required.");
    const email = optStr(fd, "email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("Please enter a valid email address.");
    const input = { name, title: optStr(fd, "title"), email, phone: optStr(fd, "phone") };
    if (id) await updateStaff(ctx, id, input);
    else await createStaff(ctx, input);
  }, id ? "Team member updated." : "Team member added.");
  revalidatePath("/onboarding");
  return r;
}

export async function removeStaffAction(id: string): Promise<ActionResult<unknown>> {
  const { ctx } = await manager();
  const r = await run(() => updateStaff(ctx, id, { active: false }), "Team member removed.");
  revalidatePath("/onboarding");
  return r;
}

// ─── Step 7: FAQs ────────────────────────────────────────────────────
export async function saveFaqsAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const { ctx } = await manager();
  const r = await run(async () => {
    let pairs: { q: string; a: string }[] = [];
    try {
      const parsed = JSON.parse(String(fd.get("faqs") ?? "[]"));
      if (Array.isArray(parsed))
        pairs = parsed
          .map((p) => ({ q: String(p?.q ?? "").trim(), a: String(p?.a ?? "").trim() }))
          .filter((p) => p.q || p.a);
    } catch {
      throw invalid("Could not read your FAQs. Please try again.");
    }
    if (pairs.some((p) => !p.q || !p.a)) throw invalid("Each FAQ needs both a question and an answer.");
    if (pairs.length > 100) throw invalid("Please add at most 100 FAQs here; you can add more in the knowledge base.");
    const existing = (await listSources(ctx)).find((s) => s.kind === "faq" && s.title === FAQ_SOURCE_TITLE);
    if (!pairs.length) return; // nothing entered — nothing to save
    const content = formatFaqs(pairs);
    if (existing) await updateSourceContent(ctx, existing.id, { content });
    else await addSource(ctx, { kind: "faq", title: FAQ_SOURCE_TITLE, content });
  });
  if (!r.ok) return r;
  return advance(7);
}

// ─── Step 8: policies ────────────────────────────────────────────────
export async function savePoliciesAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const { ctx } = await manager();
  const r = await run(async () => {
    const policies = {
      cancellation: str(fd, "cancellation").slice(0, 4000) || undefined,
      refund: str(fd, "refund").slice(0, 4000) || undefined,
      late: str(fd, "late").slice(0, 4000) || undefined,
      booking: str(fd, "booking").slice(0, 4000) || undefined,
    };
    await updateBusiness(ctx, { policies });
  });
  if (!r.ok) return r;
  return advance(8);
}

// ─── Step 9: calendar (built-in calendar is the booking system) ──────
export async function confirmCalendarAction(): Promise<ActionResult<unknown>> {
  return advance(9);
}

// ─── Step 10: AI receptionist ────────────────────────────────────────
export async function saveReceptionistAction(_: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const { ctx } = await manager();
  const r = await run(async () => {
    const tone = str(fd, "tone");
    if (!TONES.some((t) => t.value === tone)) throw invalid("Please choose a tone.");
    const emojiUsage = str(fd, "emojiUsage");
    if (!EMOJI_OPTIONS.some((e) => e.value === emojiUsage)) throw invalid("Please choose an emoji setting.");
    const languages = fd
      .getAll("languages")
      .map(String)
      .filter((l) => LANGUAGES.some((x) => x.code === l));
    if (!languages.length) throw invalid("Choose at least one language.");
    await updateAgent(ctx, {
      name: str(fd, "name").slice(0, 60),
      tone,
      emojiUsage,
      greeting: optStr(fd, "greeting"),
      languages,
    });
    const perms: Partial<AiPermissions> = {};
    for (const key of ONBOARDING_PERMISSIONS) perms[key] = fd.get(`perm_${key}`) === "on";
    // Never available to the AI, regardless of what the form says.
    perms.issue_refunds = false;
    perms.change_prices = false;
    await updateAiPermissions(ctx, perms);
  });
  if (!r.ok) return r;
  return advance(10);
}
