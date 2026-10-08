import { eq } from "drizzle-orm";
import { aiSettings, type RecoveryConfig } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, type Ctx } from "../context";
import { getAiSettings } from "../services/business";

export type RecoveryWorker = "missedCall" | "leads";
const LABEL: Record<RecoveryWorker, [string, string]> = { missedCall: ["Missed-call recovery", "automatic text-back"], leads: ["Lead recovery", "automatic first message"] };

/** Update one worker's settings. `auto` is the worker's "AI acts on its own" switch (textBack / firstTouch). */
export async function updateRecoveryConfig(ctx: Ctx, worker: RecoveryWorker, input: { enabled: boolean; auto: boolean; template: string }) {
  assertCan(ctx, "business.manage");
  if (!(worker in LABEL)) throw invalid("Unknown recovery worker.");
  const template = input.template.trim();
  if (template.length < 10 || template.length > 480) throw invalid("The message must be between 10 and 480 characters.");
  const current = await getAiSettings(ctx);
  const next: RecoveryConfig =
    worker === "missedCall"
      ? { ...current.recovery, missedCall: { enabled: input.enabled, textBack: input.auto, template } }
      : { ...current.recovery, leads: { enabled: input.enabled, firstTouch: input.auto, template } };
  await dbOf(ctx).update(aiSettings).set({ recovery: next }).where(eq(aiSettings.businessId, ctx.businessId));
  const [name, auto] = LABEL[worker];
  await audit(ctx, {
    action: "ai.settings_updated",
    summary: `${name} ${input.enabled ? "on" : "off"}, ${auto} ${input.auto ? "on" : "off"}`,
    entityType: "ai_settings",
    entityId: ctx.businessId,
    details: { [worker]: next[worker] },
  });
  return next;
}
