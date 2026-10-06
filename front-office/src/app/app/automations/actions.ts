"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/action";
import { requirePermission } from "@/lib/session";
import { runTick, type TickReport } from "@/server/jobs/tick";
import { updateAutomationSettings, type AutomationSettingsPatch } from "@/server/services/settings-ext";

export async function saveAutomationSettingsAction(patch: AutomationSettingsPatch) {
  return run(async () => {
    const { ctx } = await requirePermission("business.manage");
    // Only pass through the known sections; validation happens in the service.
    const { followUp, reminders, reviews, missedOpportunities } = patch ?? {};
    await updateAutomationSettings(ctx, { followUp, reminders, reviews, missedOpportunities });
    revalidatePath("/app/automations");
  }, "Saved.");
}

export async function runAutomationsNowAction() {
  return run<TickReport>(async () => {
    const { ctx } = await requirePermission("business.manage");
    const report = await runTick({ businessId: ctx.businessId });
    revalidatePath("/app/automations");
    revalidatePath("/app/reviews");
    return report;
  });
}
