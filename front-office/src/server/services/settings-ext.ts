/**
 * Automation settings (follow-ups, reminders, review requests, missed-opportunity
 * thresholds). Each section is validated, merged over the stored JSON for the
 * caller's business only, and audited.
 */
import { eq } from "drizzle-orm";
import {
  aiSettings,
  type FollowUpConfig,
  type MissedOpportunityConfig,
  type ReminderConfig,
  type ReviewConfig,
} from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, type Ctx } from "../context";
import { getAiSettings } from "./business";

export type AutomationSettingsPatch = {
  followUp?: Partial<FollowUpConfig>;
  reminders?: Partial<Omit<ReminderConfig, "templates">> & { templates?: Partial<ReminderConfig["templates"]> };
  reviews?: Partial<ReviewConfig>;
  missedOpportunities?: Partial<MissedOpportunityConfig>;
};

const MAX_TEMPLATE = 1000;
const STYLES = ["gentle", "direct", "value"] as const;

function intIn(v: unknown, min: number, max: number, label: string) {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw invalid(`${label} must be a whole number between ${min} and ${max}.`);
  return v;
}
function bool(v: unknown, label: string) {
  if (typeof v !== "boolean") throw invalid(`${label} must be on or off.`);
  return v;
}
function template(v: unknown, label: string, required: string[] = []) {
  if (typeof v !== "string" || !v.trim()) throw invalid(`${label} template can't be empty.`);
  if (v.length > MAX_TEMPLATE) throw invalid(`${label} template is too long (max ${MAX_TEMPLATE} characters).`);
  for (const r of required) if (!v.includes(`{{${r}}}`)) throw invalid(`${label} template must include {{${r}}}.`);
  return v.trim();
}
export function assertHttpUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw invalid(`"${raw}" is not a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw invalid("Review links must start with http:// or https://.");
  return url.toString();
}

export function validateFollowUp(c: FollowUpConfig): FollowUpConfig {
  if (!STYLES.includes(c.style)) throw invalid("Unknown follow-up style.");
  return {
    enabled: bool(c.enabled, "Follow-ups"),
    delayHours: intIn(c.delayHours, 1, 720, "Follow-up delay (hours)"),
    maxAttempts: intIn(c.maxAttempts, 1, 5, "Maximum follow-up attempts"),
    style: c.style,
    stopWhenLeadLost: bool(c.stopWhenLeadLost, "Stop when lead is lost"),
  };
}

export function validateReminders(c: ReminderConfig): ReminderConfig {
  return {
    confirmation: bool(c.confirmation, "Confirmation"),
    reminder24h: bool(c.reminder24h, "24-hour reminder"),
    sameDay: bool(c.sameDay, "Same-day reminder"),
    sameDayHoursBefore: intIn(c.sameDayHoursBefore, 1, 12, "Same-day reminder (hours before)"),
    templates: {
      confirmation: template(c.templates?.confirmation, "Confirmation"),
      reminder_24h: template(c.templates?.reminder_24h, "24-hour reminder"),
      same_day: template(c.templates?.same_day, "Same-day reminder"),
    },
  };
}

export function validateReviews(c: ReviewConfig): ReviewConfig {
  if (!Array.isArray(c.links) || c.links.length > 6) throw invalid("Add at most 6 review links.");
  return {
    enabled: bool(c.enabled, "Review requests"),
    delayHours: intIn(c.delayHours, 1, 720, "Review request delay (hours)"),
    positiveThreshold: intIn(c.positiveThreshold, 1, 5, "Positive rating threshold"),
    links: c.links.map((l) => {
      const label = (l.label ?? "").trim();
      if (!label) throw invalid("Every review link needs a label (e.g. Google).");
      if (label.length > 60) throw invalid("Review link labels must be 60 characters or fewer.");
      return { label, url: assertHttpUrl(l.url ?? "") };
    }),
    template: template(c.template, "Review request", ["review_link"]),
  };
}

export function validateMissed(c: MissedOpportunityConfig): MissedOpportunityConfig {
  return {
    staleLeadHours: intIn(c.staleLeadHours, 1, 720, "Stale lead threshold (hours)"),
    noReturnDays: intIn(c.noReturnDays, 7, 730, "No-return threshold (days)"),
  };
}

const SECTION_LABELS: Record<keyof AutomationSettingsPatch, string> = {
  followUp: "AI follow-ups",
  reminders: "appointment reminders",
  reviews: "review requests",
  missedOpportunities: "missed-opportunity thresholds",
};

export async function updateAutomationSettings(ctx: Ctx, patch: AutomationSettingsPatch) {
  assertCan(ctx, "business.manage");
  const current = await getAiSettings(ctx);
  const set: Partial<typeof aiSettings.$inferInsert> = {};
  const changed: (keyof AutomationSettingsPatch)[] = [];

  if (patch.followUp) {
    set.followUp = validateFollowUp({ ...current.followUp, ...patch.followUp });
    changed.push("followUp");
  }
  if (patch.reminders) {
    set.reminders = validateReminders({
      ...current.reminders,
      ...patch.reminders,
      templates: { ...current.reminders.templates, ...patch.reminders.templates },
    });
    changed.push("reminders");
  }
  if (patch.reviews) {
    set.reviews = validateReviews({ ...current.reviews, ...patch.reviews });
    changed.push("reviews");
  }
  if (patch.missedOpportunities) {
    set.missedOpportunities = validateMissed({ ...current.missedOpportunities, ...patch.missedOpportunities });
    changed.push("missedOpportunities");
  }
  if (!changed.length) throw invalid("Nothing to update.");

  const [row] = await dbOf(ctx).update(aiSettings).set(set).where(eq(aiSettings.businessId, ctx.businessId)).returning();
  await audit(ctx, {
    action: "ai.settings_updated",
    summary: `Automation settings updated — ${changed.map((k) => SECTION_LABELS[k]).join(", ")}`,
    entityType: "ai_settings",
    entityId: ctx.businessId,
    details: Object.fromEntries(changed.map((k) => [k, { before: current[k], after: set[k] }])),
  });
  return row!;
}
