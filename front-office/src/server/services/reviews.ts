/**
 * Review automation:
 *   appointment completed → wait N hours → send request with private rating link
 *   rating ≥ threshold → show the business's public review links
 *   rating < threshold → feedback routed privately to the owner (notification), never public
 */
import { and, desc, eq, lte } from "drizzle-orm";
import { db as rootDb } from "@/db";
import { appointments, businesses, customers, notifications, reviews, services } from "@/db/schema";
import { randomToken } from "../auth";
import { audit } from "../audit";
import { dbOf, invalid, notFound, systemCtx, type Ctx } from "../context";
import { getAiSettings, getBusiness } from "./business";
import { deliverToCustomer, renderTemplate } from "./messaging";

export async function scheduleReviewRequest(ctx: Ctx, appointmentId: string, opts: { now?: Date } = {}) {
  const settings = await getAiSettings(ctx);
  if (!settings.reviews.enabled) return null;
  const appt = await dbOf(ctx).query.appointments.findFirst({
    where: and(eq(appointments.businessId, ctx.businessId), eq(appointments.id, appointmentId)),
  });
  if (!appt) throw notFound("Appointment");
  const existing = await dbOf(ctx).query.reviews.findFirst({ where: eq(reviews.appointmentId, appointmentId) });
  if (existing) return existing;
  const now = opts.now ?? new Date();
  const [r] = await dbOf(ctx)
    .insert(reviews)
    .values({
      businessId: ctx.businessId,
      appointmentId,
      customerId: appt.customerId,
      token: randomToken(18),
      scheduledFor: new Date(now.getTime() + settings.reviews.delayHours * 3600_000),
    })
    .returning();
  return r!;
}

export function reviewLink(token: string) {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/r/${token}`;
}

export async function dueReviewRequests(now = new Date(), limit = 100) {
  return rootDb.select().from(reviews).where(and(eq(reviews.status, "scheduled"), lte(reviews.scheduledFor, now))).limit(limit);
}

export async function processReviewRequest(ctx: Ctx, review: typeof reviews.$inferSelect) {
  const [row] = await dbOf(ctx)
    .select({ customer: customers, serviceName: services.name, apptStatus: appointments.status })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.customerId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(and(eq(appointments.businessId, ctx.businessId), eq(appointments.id, review.appointmentId)));
  const settings = await getAiSettings(ctx);
  const setStatus = (status: "sent" | "skipped" | "cancelled", reason: string) =>
    dbOf(ctx).update(reviews).set({ status, statusReason: reason, sentAt: status === "sent" ? new Date() : null }).where(eq(reviews.id, review.id));
  if (!row || row.apptStatus !== "completed") return setStatus("cancelled", "Appointment not completed");
  if (!settings.reviews.enabled) return setStatus("cancelled", "Review requests turned off");
  const business = await getBusiness(ctx);
  const text = renderTemplate(settings.reviews.template, {
    customer_name: row.customer.name?.split(" ")[0] ?? "there",
    business: business.name,
    service: row.serviceName,
    review_link: reviewLink(review.token),
  });
  const delivery = await deliverToCustomer(ctx, { customerId: row.customer.id, text, subject: `How was your visit to ${business.name}?`, metadata: { reviewId: review.id } });
  if (!delivery.ok) return setStatus("skipped", delivery.detail);
  await setStatus("sent", `${delivery.channel}: ${delivery.status}`);
  await audit(ctx, {
    action: "review.requested",
    summary: `Review requested from ${row.customer.name ?? "customer"} via ${delivery.channel?.replace("_", " ")}`,
    entityType: "review",
    entityId: review.id,
  });
}

/** Public: load the rating page by token (no tenant context needed — the token is the capability). */
export async function getReviewByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null;
  const [row] = await rootDb
    .select({ review: reviews, businessName: businesses.name, businessId: businesses.id, serviceName: services.name })
    .from(reviews)
    .innerJoin(businesses, eq(businesses.id, reviews.businessId))
    .innerJoin(appointments, eq(appointments.id, reviews.appointmentId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(eq(reviews.token, token));
  return row ?? null;
}

export async function submitReview(token: string, input: { rating: number; feedback?: string }) {
  const found = await getReviewByToken(token);
  if (!found) throw notFound("Review");
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw invalid("Rating must be 1–5.");
  if (found.review.status === "responded") throw invalid("Thanks — you've already left feedback.");
  const ctx: Ctx = { businessId: found.businessId, actor: { type: "customer", customerId: found.review.customerId, name: "Customer" } };
  const settings = await getAiSettings(ctx);
  const positive = input.rating >= settings.reviews.positiveThreshold;
  const feedback = input.feedback?.trim().slice(0, 2000) || null;
  await rootDb
    .update(reviews)
    .set({ rating: input.rating, feedback, status: "responded", respondedAt: new Date(), routedTo: positive ? "public" : "private" })
    .where(eq(reviews.id, found.review.id));
  if (!positive) {
    await rootDb.insert(notifications).values({
      businessId: found.businessId,
      kind: "negative_review",
      title: `Private feedback: ${input.rating}★ for ${found.serviceName}`,
      body: feedback ?? "(no comment)",
      link: "/app/reviews",
    });
  }
  await audit(systemCtx(found.businessId, "Review system"), {
    action: "review.received",
    summary: `${input.rating}★ rating received — routed ${positive ? "to public review links" : "privately to the owner"}`,
    entityType: "review",
    entityId: found.review.id,
  });
  return { positive, links: positive ? settings.reviews.links : [] };
}

export async function listReviews(ctx: Ctx) {
  return dbOf(ctx)
    .select({ review: reviews, customerName: customers.name, serviceName: services.name })
    .from(reviews)
    .innerJoin(customers, eq(customers.id, reviews.customerId))
    .innerJoin(appointments, eq(appointments.id, reviews.appointmentId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(eq(reviews.businessId, ctx.businessId))
    .orderBy(desc(reviews.createdAt))
    .limit(200);
}
