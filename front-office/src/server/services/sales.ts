/**
 * "Contact sales" for larger organizations that want a custom plan.
 *
 * Every request is saved. If email is configured (RESEND_API_KEY, EMAIL_FROM
 * and SALES_EMAIL), the sales inbox is also emailed; otherwise the request
 * waits in the list at /app/inquiries, visible only to platform admins
 * (PLATFORM_ADMINS, comma-separated login emails).
 */
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { salesInquiries } from "@/db/schema";
import { AppError, forbidden } from "../context";

export const LOCATION_OPTIONS = ["1", "2–5", "6–20", "21–50", "50+"] as const;

const inquirySchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(200),
  phone: z.string().trim().max(40).optional().transform((v) => v || null),
  organization: z.string().trim().min(2, "Please enter your organization's name.").max(160),
  locations: z.enum(LOCATION_OPTIONS, { message: "Choose how many locations you have." }),
  message: z.string().trim().max(3000).optional().transform((v) => v || null),
});
export type InquiryInput = z.input<typeof inquirySchema>;

export function salesEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.SALES_EMAIL);
}

export async function submitInquiry(input: InquiryInput) {
  const parsed = inquirySchema.safeParse(input);
  if (!parsed.success) throw new AppError("invalid", parsed.error.issues[0]?.message ?? "Please check the form.");
  const v = parsed.data;
  const [row] = await db.insert(salesInquiries).values(v).returning();
  if (salesEmailConfigured()) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: process.env.SALES_EMAIL!.split(",").map((s) => s.trim()).filter(Boolean),
          reply_to: v.email,
          subject: `Custom plan enquiry — ${v.organization} (${v.locations} locations)`,
          text: [`Name: ${v.name}`, `Email: ${v.email}`, `Phone: ${v.phone ?? "—"}`, `Organization: ${v.organization}`, `Locations: ${v.locations}`, "", v.message ?? "(no message)"].join("\n"),
        }),
      });
      if (res.ok) await db.update(salesInquiries).set({ emailedAt: new Date() }).where(eq(salesInquiries.id, row!.id));
      else console.error("[sales] notification email failed", res.status);
    } catch (e) {
      console.error("[sales] notification email failed", (e as Error).message);
    }
  }
  return row!;
}

export function isPlatformAdmin(email: string | null | undefined) {
  if (!email) return false;
  const admins = (process.env.PLATFORM_ADMINS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase());
}

export async function listInquiries(viewerEmail: string) {
  if (!isPlatformAdmin(viewerEmail)) throw forbidden();
  return db.select().from(salesInquiries).orderBy(desc(salesInquiries.createdAt)).limit(200);
}

export async function setInquiryStatus(viewerEmail: string, id: string, status: "new" | "contacted" | "closed") {
  if (!isPlatformAdmin(viewerEmail)) throw forbidden();
  await db.update(salesInquiries).set({ status }).where(eq(salesInquiries.id, id));
}
