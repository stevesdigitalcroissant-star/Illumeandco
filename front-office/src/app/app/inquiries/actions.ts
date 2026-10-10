"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/lib/action";
import { requireUser } from "@/lib/session";
import { setInquiryStatus } from "@/server/services/sales";

export async function setInquiryStatusAction(id: string, status: "new" | "contacted" | "closed") {
  return run(async () => {
    const { user } = await requireUser();
    if (!["new", "contacted", "closed"].includes(status)) throw new Error("Unknown status");
    await setInquiryStatus(user.email, String(id), status);
    revalidatePath("/app/inquiries");
  });
}
