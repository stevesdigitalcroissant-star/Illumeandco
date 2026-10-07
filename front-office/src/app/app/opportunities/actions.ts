"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/action";
import { requirePermission } from "@/lib/session";
import { CHANNEL_LABELS } from "@/components/status";
import { closeOpportunity, followUpNow } from "@/server/opportunities/board";

const refresh = () => {
  revalidatePath("/app/opportunities");
  revalidatePath("/app");
};

export async function followUpNowAction(id: string) {
  const { ctx } = await requirePermission("leads.manage");
  const res = await run(async () => {
    const r = await followUpNow(ctx, id);
    return r.sent
      ? { sent: true as const, detail: `Follow-up sent via ${CHANNEL_LABELS[r.channel ?? ""] ?? r.channel ?? "an available channel"}.` }
      : { sent: false as const, detail: `Not sent — ${r.reason ?? "no channel could reach this customer"}.` };
  });
  refresh();
  return res;
}

export async function closeOpportunityAction(id: string, status: "lost" | "dismissed") {
  const { ctx } = await requirePermission("leads.manage");
  const res = await run(() => closeOpportunity(ctx, id, status), status === "lost" ? "Marked as lost." : "Dismissed.");
  refresh();
  return res;
}
