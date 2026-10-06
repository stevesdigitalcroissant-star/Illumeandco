import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, followUps, messages } from "@/db/schema";
import { handleInbound } from "@/server/ai/orchestrator";
import { runTick } from "@/server/jobs/tick";
import { takeOver } from "@/server/services/conversations";
import { updateLead } from "@/server/services/leads";
import { createClinic, visitor } from "./helpers";

const pending = (customerId: string) =>
  db.select().from(followUps).where(and(eq(followUps.customerId, customerId), eq(followUps.status, "scheduled")));
const allFor = (customerId: string) => db.select().from(followUps).where(eq(followUps.customerId, customerId));
const HOURS = 3600_000;

async function inquiry() {
  const c = await createClinic();
  const id = visitor();
  const r = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "How much is a dental consultation?" });
  return { c, id, r };
}

describe("AI follow-ups", () => {
  it("schedules a follow-up when someone asks about a service and disappears, then sends it", async () => {
    const { c, r } = await inquiry();
    const [f] = await pending(r.customerId);
    expect(f).toBeTruthy();
    expect(f!.reason).toMatch(/consultation/i);

    const report = await runTick({ now: new Date(Date.now() + 25 * HOURS), businessId: c.business.id });
    expect(report.followUps).toBe(1);
    const sent = (await allFor(r.customerId)).find((x) => x.id === f!.id)!;
    expect(sent.status).toBe("sent");
    const [msg] = await db.select().from(messages).where(and(eq(messages.conversationId, r.conversationId), eq(messages.role, "ai"))).orderBy(messages.createdAt).offset(1);
    expect(msg?.content).toMatch(/consultation/i);
    // Next attempt is queued (max attempts = 2)
    expect(await pending(r.customerId)).toHaveLength(1);
  });

  it("respects the maximum number of follow-ups", async () => {
    const { c, r } = await inquiry();
    await runTick({ now: new Date(Date.now() + 25 * HOURS), businessId: c.business.id });
    await runTick({ now: new Date(Date.now() + 50 * HOURS), businessId: c.business.id });
    await runTick({ now: new Date(Date.now() + 100 * HOURS), businessId: c.business.id });
    const all = await allFor(r.customerId);
    expect(all.filter((x) => x.status === "sent")).toHaveLength(2);
    expect(all.filter((x) => x.status === "scheduled")).toHaveLength(0);
  });

  it("stops when the customer replies", async () => {
    const { c, id, r } = await inquiry();
    const [f] = await pending(r.customerId);
    await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "thanks, I'll think about it" });
    const after = (await allFor(r.customerId)).find((x) => x.id === f!.id)!;
    expect(after.status).toBe("cancelled");
    expect(after.statusReason).toBe("Customer replied");
  });

  it("stops when the customer opts out", async () => {
    const { c, id, r } = await inquiry();
    const res = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "STOP" });
    expect(res.reply).toMatch(/unsubscribed/);
    expect(await pending(r.customerId)).toHaveLength(0);
    const cust = await db.query.customers.findFirst({ where: eq(customers.id, r.customerId) });
    expect(cust?.optedOut).toBe(true);
    // Even a manually inserted follow-up won't be sent
    await db.insert(followUps).values({ businessId: c.business.id, customerId: r.customerId, scheduledFor: new Date(), createdBy: "system" });
    await runTick({ now: new Date(Date.now() + HOURS), businessId: c.business.id });
    const [f] = (await allFor(r.customerId)).filter((x) => x.createdBy === "system");
    expect(f!.status).toBe("cancelled");
    expect(f!.statusReason).toBe("Customer opted out");
  });

  it("stops when an appointment is booked", async () => {
    const { c, r } = await inquiry();
    const [f] = await pending(r.customerId);
    // Booking happens through another path (e.g. staff on the phone)
    const { updateCustomer } = await import("@/server/services/customers");
    await updateCustomer(c.ctx, r.customerId, { name: "Sarah", phone: "+971501112233" });
    const { bookAppointment } = await import("@/server/services/appointments");
    const { at } = await import("./helpers");
    await bookAppointment(c.ctx, { serviceId: c.services.consultation.id, startsAt: at("10:00", 2), customerId: r.customerId, source: "staff" });
    const after = (await allFor(r.customerId)).find((x) => x.id === f!.id)!;
    expect(after.status).toBe("cancelled");
    expect(after.statusReason).toBe("Appointment booked");
  });

  it("stops when a human takes over", async () => {
    const { c, r } = await inquiry();
    const [f] = await pending(r.customerId);
    await takeOver(c.ctx, r.conversationId);
    const after = (await allFor(r.customerId)).find((x) => x.id === f!.id)!;
    expect(after.status).toBe("cancelled");
    expect(after.statusReason).toBe("Human took over the conversation");
  });

  it("checks stop conditions again at send time (lead marked lost)", async () => {
    const { c, r } = await inquiry();
    const [f] = await pending(r.customerId);
    await updateLead(c.ctx, f!.leadId!, { status: "lost", lostReason: "Went elsewhere" });
    await runTick({ now: new Date(Date.now() + 25 * HOURS), businessId: c.business.id });
    const after = (await allFor(r.customerId)).find((x) => x.id === f!.id)!;
    expect(after.status).toBe("cancelled");
    expect(after.statusReason).toBe("Lead marked lost");
  });
});
