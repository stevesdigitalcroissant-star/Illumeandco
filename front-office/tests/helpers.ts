import { randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import { db } from "@/db";
import { aiSettings, type AiPermissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signUp } from "@/server/auth";
import type { Ctx } from "@/server/context";
import { createBusiness, setBusinessHours, updateBusiness } from "@/server/services/business";
import { createService, createStaff } from "@/server/services/catalog";
import { addSource } from "@/server/services/knowledge";

export const TZ = "Asia/Dubai";

export function tomorrowAt(hhmm: string, days = 1) {
  return DateTime.now().setZone(TZ).plus({ days }).toISODate() + "T" + hhmm;
}
export function localDate(days = 1) {
  return DateTime.now().setZone(TZ).plus({ days }).toISODate()!;
}
export function at(hhmm: string, days = 1) {
  return DateTime.fromISO(tomorrowAt(hhmm, days), { zone: TZ }).toJSDate();
}

/** A fully set-up clinic: owner, 7-day hours 09:00–18:00, two dentists, three services, FAQs. */
export async function createClinic(name = "Dubai Smile Clinic") {
  const email = `owner-${randomBytes(6).toString("hex")}@test.dev`;
  const { user, organization } = await signUp({ name: "Olivia Owner", email, password: "correct-horse-battery" });
  const business = await createBusiness(organization.id, { name, type: "dentist", timezone: TZ, currency: "AED" });
  const ctx: Ctx = { businessId: business.id, actor: { type: "user", userId: user.id, name: user.name, role: "owner" } };
  await updateBusiness(ctx, {
    city: "Dubai",
    address: "Building 4, Dubai Healthcare City",
    country: "UAE",
    policies: { cancellation: "Please give at least 24 hours' notice to cancel or reschedule." },
  });
  await setBusinessHours(ctx, [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, openTime: "09:00", closeTime: "18:00" })));
  const amira = await createStaff(ctx, { name: "Dr. Amira Hassan", title: "Dentist" });
  const omar = await createStaff(ctx, { name: "Dr. Omar Khalid", title: "Dentist" });
  const consultation = await createService(ctx, { name: "Dental consultation", priceCents: 25000, durationMinutes: 30, staffIds: [amira.id, omar.id] });
  const whitening = await createService(ctx, { name: "Teeth whitening", priceCents: 65000, durationMinutes: 60, staffIds: [amira.id] });
  const cleaning = await createService(ctx, { name: "Cleaning", priceCents: 30000, durationMinutes: 45, staffIds: [omar.id] });
  await addSource(ctx, {
    kind: "faq",
    title: "Clinic FAQs",
    content:
      "Q: Do you have parking?\nA: Yes, free underground parking is available for patients.\n\nQ: Does teeth whitening hurt?\nA: Most patients feel little or no discomfort; some have mild sensitivity for a day.\n\nQ: Do you accept insurance?\nA: We accept most major UAE insurance plans — please bring your card.",
  });
  return { user, organization, business, ctx, staff: { amira, omar }, services: { consultation, whitening, cleaning } };
}

export async function setPermissions(businessId: string, patch: Partial<AiPermissions>) {
  const s = await db.query.aiSettings.findFirst({ where: eq(aiSettings.businessId, businessId) });
  await db.update(aiSettings).set({ permissions: { ...s!.permissions, ...patch } }).where(eq(aiSettings.businessId, businessId));
}

export const visitor = () => `visitor-${randomBytes(8).toString("hex")}`;
