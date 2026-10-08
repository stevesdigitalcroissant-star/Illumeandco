import { eq } from "drizzle-orm";
import { aiSettings, type RecoveryConfig } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, type Ctx } from "../context";
import { getAiSettings } from "../services/business";

export async function updateSlotConfig(ctx: Ctx, input: RecoveryConfig["slots"]) {
  assertCan(ctx, "business.manage");
  const template = input.template.trim();
  if (template.length < 10 || template.length > 480) throw invalid("The offer message must be between 10 and 480 characters.");
  if (!/\{\{\s*when\s*\}\}/.test(template)) throw invalid("The offer message must include {{when}} so customers know which time is offered.");
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 10) throw invalid("Offer at most 1–10 people at once.");
  if (!Number.isInteger(input.offerMinutes) || input.offerMinutes < 10 || input.offerMinutes > 24 * 60) throw invalid("Offers must stay open between 10 minutes and 24 hours.");
  const current = await getAiSettings(ctx);
  const slots = { enabled: Boolean(input.enabled), autoOffer: Boolean(input.autoOffer), batchSize: input.batchSize, offerMinutes: input.offerMinutes, template };
  await dbOf(ctx).update(aiSettings).set({ recovery: { ...current.recovery, slots } }).where(eq(aiSettings.businessId, ctx.businessId));
  await audit(ctx, {
    action: "ai.settings_updated",
    summary: `Slot recovery ${slots.enabled ? "on" : "off"}, ${slots.autoOffer ? "offers sent automatically" : "offers need a person's approval"}, ${slots.batchSize} at a time`,
    entityType: "ai_settings",
    entityId: ctx.businessId,
    details: { slots },
  });
  return slots;
}
