"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/action";
import { requirePermission } from "@/lib/session";
import { eraseCustomer } from "@/server/services/privacy";

export async function eraseCustomerAction(customerId: string) {
  const { ctx } = await requirePermission("business.manage");
  const r = await run(() => eraseCustomer(ctx, customerId), "Deleted.");
  revalidatePath("/app/customers");
  return r;
}
