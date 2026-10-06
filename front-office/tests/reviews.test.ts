import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiSettings, notifications, reviews } from "@/db/schema";
import { runTick } from "@/server/jobs/tick";
import { bookAppointment, setAppointmentOutcome } from "@/server/services/appointments";
import { createConversation } from "@/server/services/conversations";
import { createCustomer } from "@/server/services/customers";
import { submitReview } from "@/server/services/reviews";
import { at, createClinic } from "./helpers";

async function completedVisit() {
  const c = await createClinic();
  const s = await db.query.aiSettings.findFirst({ where: eq(aiSettings.businessId, c.business.id) });
  await db.update(aiSettings).set({ reviews: { ...s!.reviews, links: [{ label: "Google", url: "https://g.page/r/example" }] } }).where(eq(aiSettings.businessId, c.business.id));
  const { customer } = await createCustomer(c.ctx, { name: "Rana", phone: "+971509998877" });
  await createConversation(c.ctx, { customerId: customer.id, channel: "web_chat" });
  const r = await bookAppointment(c.ctx, { serviceId: c.services.cleaning.id, startsAt: at("10:00"), customerId: customer.id, source: "staff" });
  await setAppointmentOutcome(c.ctx, r.appointment.id, "completed");
  const review = await db.query.reviews.findFirst({ where: eq(reviews.appointmentId, r.appointment.id) });
  return { c, review: review! };
}

describe("review automation", () => {
  it("waits the configured delay, then sends the request", async () => {
    const { c, review } = await completedVisit();
    expect(review.status).toBe("scheduled");
    await runTick({ now: new Date(Date.now() + 30 * 60_000), businessId: c.business.id });
    expect((await db.query.reviews.findFirst({ where: eq(reviews.id, review.id) }))!.status).toBe("scheduled");
    await runTick({ now: new Date(Date.now() + 3 * 3600_000), businessId: c.business.id });
    const sent = (await db.query.reviews.findFirst({ where: eq(reviews.id, review.id) }))!;
    expect(sent.status).toBe("sent");
    expect(sent.statusReason).toMatch(/web_chat/);
  });

  it("positive ratings get public review links; negative ones go privately to the owner", async () => {
    const good = await completedVisit();
    const pos = await submitReview(good.review.token, { rating: 5 });
    expect(pos.positive).toBe(true);
    expect(pos.links[0]?.url).toBe("https://g.page/r/example");

    const bad = await completedVisit();
    const neg = await submitReview(bad.review.token, { rating: 2, feedback: "Waited 40 minutes." });
    expect(neg.positive).toBe(false);
    expect(neg.links).toEqual([]);
    const [n] = await db.select().from(notifications).where(eq(notifications.businessId, bad.c.business.id));
    expect(n?.kind).toBe("negative_review");
    expect(n?.body).toBe("Waited 40 minutes.");
    await expect(submitReview(bad.review.token, { rating: 5 })).rejects.toThrow(/already/);
    await expect(submitReview("not-a-real-token-123", { rating: 5 })).rejects.toThrow(/not found/);
  });
});
