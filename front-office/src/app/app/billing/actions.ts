"use server";
import { redirect } from "next/navigation";
import { run } from "@/lib/action";
import { requirePermission } from "@/lib/session";
import { createCheckoutSession, createPortalSession } from "@/server/services/billing";

/** Returns an error result, or redirects the browser to Stripe. */
export async function choosePlanAction(planId: string) {
  const res = await run(async () => {
    const { ctx, user } = await requirePermission("billing.manage");
    return createCheckoutSession(ctx, String(planId), { email: user.email });
  });
  if (res.ok && res.data) redirect(res.data);
  return res;
}

export async function manageBillingAction() {
  const res = await run(async () => {
    const { ctx } = await requirePermission("billing.manage");
    return createPortalSession(ctx);
  });
  if (res.ok && res.data) redirect(res.data);
  return res;
}
