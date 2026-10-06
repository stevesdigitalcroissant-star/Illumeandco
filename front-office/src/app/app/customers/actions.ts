"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { optStr, run, str, type ActionResult } from "@/lib/action";
import { requireBusiness } from "@/lib/session";
import { invalid } from "@/server/context";
import { createCustomer, getCustomer, updateCustomer } from "@/server/services/customers";

const parseTags = (raw: string) =>
  [...new Set(raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20).map((t) => t.slice(0, 40));

export async function updateCustomerAction(customerId: string, _prev: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const { ctx } = await requireBusiness();
  const res = await run(async () => {
    const existing = await getCustomer(ctx, customerId);
    const optedOut = fd.get("optedOut") === "on";
    await updateCustomer(ctx, customerId, {
      name: optStr(fd, "name"),
      phone: optStr(fd, "phone"),
      email: optStr(fd, "email"),
      notes: optStr(fd, "notes"),
      tags: parseTags(str(fd, "tags")),
      ...(optedOut !== existing.optedOut ? { optedOut } : {}),
    });
  }, "Saved");
  revalidatePath(`/app/customers/${customerId}`);
  revalidatePath("/app/customers");
  return res;
}

export async function createCustomerAction(_prev: ActionResult<unknown> | null, fd: FormData): Promise<ActionResult<unknown>> {
  const { ctx } = await requireBusiness();
  const res = await run(async () => {
    const name = str(fd, "name");
    const phone = optStr(fd, "phone");
    const email = optStr(fd, "email");
    if (!name) throw invalid("Enter the customer's name.");
    if (!phone && !email) throw invalid("Add a phone number or an email.");
    return createCustomer(ctx, { name, phone, email, source: "manual" });
  });
  if (!res.ok) return res;
  revalidatePath("/app/customers");
  // Existing customer with the same contact details is reused rather than duplicated.
  redirect(`/app/customers/${res.data!.customer.id}${res.data!.created ? "" : "?existing=1"}`);
}
