import { eq } from "drizzle-orm";
import { aiSettings, type RecoveryConfig } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, type Ctx } from "../context";
import { getAiSettings } from "../services/business";

export async function updateMissedCallConfig(ctx: Ctx, patch: Partial<RecoveryConfig["missedCall"]>) {
  assertCan(ctx, "business.manage");
  const current = await getAiSettings(ctx);
  const next = { ...current.recovery.missedCall, ...patch };
  next.template = next.template.trim();
  if (next.template.length < 10 || next.template.length > 480) throw invalid("The text-back message must be between 10 and 480 characters.");
  await dbOf(ctx)
    .update(aiSettings)
    .set({ recovery: { ...current.recovery, missedCall: next } })
    .where(eq(aiSettings.businessId, ctx.businessId));
  await audit(ctx, {
    action: "ai.settings_updated",
    summary: `Missed-call recovery ${next.enabled ? "on" : "off"}, automatic text-back ${next.textBack ? "on" : "off"}`,
    entityType: "ai_settings",
    entityId: ctx.businessId,
    details: { missedCall: next },
  });
  return next;
}
