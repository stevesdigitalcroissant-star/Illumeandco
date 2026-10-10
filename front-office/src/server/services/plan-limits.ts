/**
 * What each plan includes beyond the monthly allowances, enforced on the
 * server: team members, locations, WhatsApp and slot recovery.
 *
 *   Starter  — 3 team members, 1 location, SMS/email/web chat
 *   Growth   — 10 team members, 1 location, + WhatsApp, + slot recovery
 *   Pro      — unlimited team, 3 locations, everything
 *
 * During the free trial everything except extra locations is available, so a
 * business can see the full product. Without an active plan, nothing new can
 * be added (existing team members and settings are kept, never deleted).
 * Limits apply only when billing is on.
 */
import { and, eq, sql } from "drizzle-orm";
import { db as rootDb } from "@/db";
import { businesses, organizationMembers, plans } from "@/db/schema";
import { AppError, type Ctx } from "../context";
import { allowanceFor } from "./allowance";
import { DEFAULT_PLANS } from "./billing";

export type PlanLimits = {
  source: "plan" | "trial" | "unlimited" | "none";
  planName: string | null;
  maxStaff: number | null;
  maxLocations: number | null;
  whatsapp: boolean;
  slotRecovery: boolean;
};

const TRIAL_LIMITS = { maxStaff: 3, maxLocations: 1, whatsapp: true, slotRecovery: true };

async function orgOf(businessId: string) {
  const b = await rootDb.query.businesses.findFirst({ where: eq(businesses.id, businessId), columns: { organizationId: true } });
  if (!b) throw new AppError("not_found", "Business not found");
  return b.organizationId;
}

export async function planLimits(ctx: Ctx, now = new Date()): Promise<PlanLimits> {
  const a = await allowanceFor(ctx, now);
  if (a.source === "unlimited") return { source: "unlimited", planName: null, maxStaff: null, maxLocations: null, whatsapp: true, slotRecovery: true };
  if (a.source === "none") return { source: "none", planName: null, maxStaff: 0, maxLocations: 1, whatsapp: false, slotRecovery: false };
  const plan = a.plan ? await rootDb.query.plans.findFirst({ where: eq(plans.id, a.plan) }) : null;
  if (a.source === "trial") return { source: "trial", planName: plan?.name ?? null, ...TRIAL_LIMITS };
  const e = plan!.entitlements;
  return {
    source: "plan",
    planName: plan!.name,
    maxStaff: e.maxStaff,
    maxLocations: e.maxLocations,
    whatsapp: e.channels.includes("whatsapp"),
    slotRecovery: e.slotRecovery ?? e.channels.includes("whatsapp"),
  };
}

/** The cheapest plan that would allow this, for the upgrade message. */
function upgradeHint(test: (e: (typeof DEFAULT_PLANS)[number]["entitlements"]) => boolean) {
  const p = DEFAULT_PLANS.find((x) => test(x.entitlements));
  return p ? ` Upgrade to ${p.name} on the Billing page.` : " Contact us about an Enterprise plan.";
}

export const planError = (msg: string) => new AppError("forbidden", msg);

function noPlan(l: PlanLimits) {
  return l.source === "none" ? planError("Your free trial has ended. Choose a plan on the Billing page to continue.") : null;
}

export async function memberCount(organizationId: string) {
  const [r] = await rootDb.select({ n: sql<number>`count(*)::int` }).from(organizationMembers).where(eq(organizationMembers.organizationId, organizationId));
  return r?.n ?? 0;
}

export async function assertCanAddMember(ctx: Ctx, now = new Date()) {
  const l = await planLimits(ctx, now);
  const none = noPlan(l);
  if (none) throw none;
  if (l.maxStaff === null) return;
  const n = await memberCount(await orgOf(ctx.businessId));
  if (n >= l.maxStaff)
    throw planError(`Your ${l.planName ?? "trial"} plan includes up to ${l.maxStaff} team members.${upgradeHint((e) => e.maxStaff === null || e.maxStaff > l.maxStaff!)}`);
}

/** Before creating another location (business) in an organization. `ctx` is any business already in it, if one exists. */
export async function assertCanAddLocation(organizationId: string, now = new Date()) {
  const existing = await rootDb
    .select({ id: businesses.id })
    .from(businesses)
    .where(and(eq(businesses.organizationId, organizationId), eq(businesses.isDemo, false)));
  if (!existing.length) return; // the first location is always allowed
  const l = await planLimits({ businessId: existing[0]!.id, actor: { type: "system", name: "Plan limits" } }, now);
  const none = noPlan(l);
  if (none) throw none;
  if (l.maxLocations !== null && existing.length >= l.maxLocations)
    throw planError(
      `Your ${l.planName ?? "trial"} plan includes ${l.maxLocations === 1 ? "1 location" : `up to ${l.maxLocations} locations`}.${upgradeHint((e) => e.maxLocations === null || e.maxLocations > l.maxLocations!)}`,
    );
}

export async function assertFeature(ctx: Ctx, feature: "whatsapp" | "slotRecovery", now = new Date()) {
  const l = await planLimits(ctx, now);
  if (l[feature]) return;
  const none = noPlan(l);
  if (none) throw none;
  const label = feature === "whatsapp" ? "WhatsApp" : "Slot recovery";
  throw planError(`${label} isn't included in the ${l.planName} plan.${upgradeHint((e) => (feature === "whatsapp" ? e.channels.includes("whatsapp") : Boolean(e.slotRecovery)))}`);
}

export async function hasFeature(ctx: Ctx, feature: "whatsapp" | "slotRecovery", now = new Date()) {
  return (await planLimits(ctx, now))[feature];
}
