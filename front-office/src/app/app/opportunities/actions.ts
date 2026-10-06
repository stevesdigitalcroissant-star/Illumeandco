"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/action";
import { requirePermission } from "@/lib/session";
import { dismissOpportunity, followUpNow } from "@/server/services/opportunities";
import { CHANNEL_LABELS } from "@/components/status";

export async function followUpOpportunityAction(key: string) {
  const { ctx } = await requirePermission("leads.manage");
  const res = await run(async () => {
    const r = await followUpNow(ctx, key);
    return r.sent
      ? { sent: true as const, detail: `Sent via ${CHANNEL_LABELS[r.channel ?? ""] ?? r.channel ?? "an available channel"}.` }
      : { sent: false as const, detail: r.reason ?? "The follow-up was not sent." };
  });
  revalidatePath("/app/opportunities");
  revalidatePath("/app");
  return res;
}

export async function dismissOpportunityAction(key: string) {
  const { ctx } = await requirePermission("leads.manage");
  const res = await run(() => dismissOpportunity(ctx, key), "Dismissed");
  revalidatePath("/app/opportunities");
  revalidatePath("/app");
  return res;
}
