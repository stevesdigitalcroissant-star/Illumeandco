"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/action";
import { requirePermission } from "@/lib/session";
import { setReportsTo } from "@/server/services/team-overview";

export async function setReportsToAction(memberId: string, managerMemberId: string | null) {
  return run(async () => {
    const { ctx } = await requirePermission("members.manage");
    await setReportsTo(ctx, String(memberId), managerMemberId ? String(managerMemberId) : null);
    revalidatePath("/app/team", "layout");
  }, "Saved.");
}
