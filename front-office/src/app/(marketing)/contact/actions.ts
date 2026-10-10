"use server";
import { headers } from "next/headers";
import { run, str, type ActionResult } from "@/lib/action";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { submitInquiry, type InquiryInput } from "@/server/services/sales";

export async function contactSalesAction(_: ActionResult<void> | null, fd: FormData): Promise<ActionResult<void>> {
  // Bots fill every field, including this hidden one; people never see it.
  if (str(fd, "website")) return { ok: true, message: "Thanks — we'll be in touch soon." };
  const ip = clientIp(await headers());
  if (!(await rateLimit(`contact:${ip}`, 5, 3600_000)).ok) return { ok: false, error: "Too many requests. Please try again later." };
  return run(async () => {
    await submitInquiry({
      name: str(fd, "name"),
      email: str(fd, "email"),
      phone: str(fd, "phone"),
      organization: str(fd, "organization"),
      locations: str(fd, "locations") as InquiryInput["locations"],
      message: str(fd, "message"),
    });
  }, "Thanks — we've got your details and will be in touch soon.");
}
