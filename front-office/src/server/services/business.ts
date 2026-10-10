import { and, asc, eq } from "drizzle-orm";
import { countryName, isCountryCode } from "@/lib/countries";
import { randomBytes } from "node:crypto";
import { db as rootDb } from "@/db";
import {
  aiAgents,
  aiSettings,
  businessHours,
  businesses,
  type BusinessPolicies,
} from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, notFound, type Ctx } from "../context";
import {
  DEFAULT_AI_PERMISSIONS,
  DEFAULT_FOLLOW_UP,
  DEFAULT_MISSED_OPPORTUNITIES,
  DEFAULT_REMINDERS,
  DEFAULT_REVIEWS,
  DEFAULT_WIDGET,
} from "../defaults";
import type { Tx } from "@/db";
import { DateTime } from "luxon";

export const ONBOARDING_STEPS = [
  "Business name",
  "Business type",
  "Location",
  "Opening hours",
  "Services",
  "Staff",
  "FAQs",
  "Policies",
  "Calendar",
  "AI receptionist",
] as const;

export function isValidTimezone(tz: string) {
  return DateTime.local().setZone(tz).isValid;
}

/** Create a business with all per-tenant defaults (AI agent, AI settings). */
export async function createBusiness(
  organizationId: string,
  input: { name: string; type?: (typeof businesses.$inferInsert)["type"]; timezone?: string; currency?: string; isDemo?: boolean },
  tx: Tx = rootDb,
) {
  const name = input.name.trim();
  if (!name) throw invalid("Business name is required.");
  const timezone = input.timezone ?? "UTC";
  if (!isValidTimezone(timezone)) throw invalid(`Unknown timezone "${timezone}".`);
  const [business] = await tx
    .insert(businesses)
    .values({
      organizationId,
      name,
      type: input.type ?? "other",
      timezone,
      currency: input.currency ?? "USD",
      publicKey: `pk_${randomBytes(12).toString("hex")}`,
      isDemo: input.isDemo ?? false,
      onboardingStep: 2,
    })
    .returning();
  await tx.insert(aiAgents).values({ businessId: business!.id, name: "Front Desk" });
  await tx.insert(aiSettings).values({
    businessId: business!.id,
    permissions: DEFAULT_AI_PERMISSIONS,
    followUp: DEFAULT_FOLLOW_UP,
    reminders: DEFAULT_REMINDERS,
    reviews: DEFAULT_REVIEWS,
    widget: { ...DEFAULT_WIDGET, title: `Chat with ${name}` },
    missedOpportunities: DEFAULT_MISSED_OPPORTUNITIES,
  });
  return business!;
}

export async function getBusiness(ctx: Ctx) {
  const b = await dbOf(ctx).query.businesses.findFirst({ where: eq(businesses.id, ctx.businessId) });
  if (!b) throw notFound("Business");
  return b;
}

export type BusinessUpdate = Partial<
  Pick<
    typeof businesses.$inferInsert,
    | "name"
    | "type"
    | "description"
    | "timezone"
    | "currency"
    | "address"
    | "city"
    | "country"
    | "countryCode"
    | "phone"
    | "email"
    | "website"
    | "slotIntervalMinutes"
    | "defaultBufferMinutes"
    | "minNoticeMinutes"
    | "maxAdvanceDays"
  >
> & { policies?: BusinessPolicies };

export async function updateBusiness(ctx: Ctx, patch: BusinessUpdate) {
  assertCan(ctx, "business.manage");
  if (patch.timezone && !isValidTimezone(patch.timezone)) throw invalid(`Unknown timezone "${patch.timezone}".`);
  if (patch.name !== undefined && !patch.name.trim()) throw invalid("Business name is required.");
  if (patch.countryCode !== undefined && patch.countryCode !== null) {
    if (!isCountryCode(patch.countryCode)) throw invalid("Please choose a country.");
    patch = { ...patch, countryCode: patch.countryCode.toUpperCase(), country: patch.country ?? countryName(patch.countryCode) };
  }
  if (patch.currency !== undefined && !/^[A-Z]{3}$/.test(patch.currency)) throw invalid("Currency must be a 3-letter code such as USD.");
  if (patch.slotIntervalMinutes !== undefined && (patch.slotIntervalMinutes < 5 || patch.slotIntervalMinutes > 240))
    throw invalid("Slot interval must be between 5 and 240 minutes.");
  const [b] = await dbOf(ctx)
    .update(businesses)
    .set(patch)
    .where(eq(businesses.id, ctx.businessId))
    .returning();
  await audit(ctx, {
    action: "business.updated",
    summary: `Business settings updated (${Object.keys(patch).join(", ")})`,
    entityType: "business",
    entityId: ctx.businessId,
  });
  return b!;
}

export async function setOnboardingStep(ctx: Ctx, step: number) {
  const b = await getBusiness(ctx);
  const next = Math.max(b.onboardingStep, step);
  await dbOf(ctx)
    .update(businesses)
    .set({
      onboardingStep: next,
      onboardingCompletedAt: step > ONBOARDING_STEPS.length ? (b.onboardingCompletedAt ?? new Date()) : b.onboardingCompletedAt,
    })
    .where(eq(businesses.id, ctx.businessId));
}

// ─── Opening hours ───────────────────────────────────────────────────
export type HoursInput = { weekday: number; openTime: string; closeTime: string }[];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateHours(rows: HoursInput) {
  for (const r of rows) {
    if (r.weekday < 1 || r.weekday > 7) throw invalid("Weekday must be 1 (Mon) to 7 (Sun).");
    if (!TIME_RE.test(r.openTime) || !TIME_RE.test(r.closeTime)) throw invalid("Times must be HH:MM (24h).");
    if (r.openTime >= r.closeTime) throw invalid("Closing time must be after opening time.");
  }
}

export async function getBusinessHours(ctx: Ctx) {
  return dbOf(ctx)
    .select()
    .from(businessHours)
    .where(eq(businessHours.businessId, ctx.businessId))
    .orderBy(asc(businessHours.weekday), asc(businessHours.openTime));
}

export async function setBusinessHours(ctx: Ctx, rows: HoursInput) {
  assertCan(ctx, "business.manage");
  validateHours(rows);
  const run = async (tx: Tx) => {
    await tx.delete(businessHours).where(eq(businessHours.businessId, ctx.businessId));
    if (rows.length)
      await tx.insert(businessHours).values(rows.map((r) => ({ ...r, businessId: ctx.businessId })));
  };
  if (ctx.tx) await run(ctx.tx);
  else await rootDb.transaction(run);
  await audit(ctx, { action: "business.updated", summary: "Opening hours updated", entityType: "business", entityId: ctx.businessId });
}

export async function getAgent(ctx: Ctx) {
  const agent = await dbOf(ctx).query.aiAgents.findFirst({
    where: and(eq(aiAgents.businessId, ctx.businessId), eq(aiAgents.kind, "receptionist")),
  });
  if (!agent) throw notFound("AI agent");
  return agent;
}

export async function getAiSettings(ctx: Ctx) {
  const s = await dbOf(ctx).query.aiSettings.findFirst({ where: eq(aiSettings.businessId, ctx.businessId) });
  if (!s) throw notFound("AI settings");
  return s;
}

export async function getBusinessByPublicKey(publicKey: string) {
  return rootDb.query.businesses.findFirst({ where: eq(businesses.publicKey, publicKey) });
}
