"use server";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireBusiness } from "@/lib/session";

export async function markNotificationsReadAction() {
  const { ctx } = await requireBusiness();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.businessId, ctx.businessId), isNull(notifications.readAt)));
  revalidatePath("/app", "layout");
}
