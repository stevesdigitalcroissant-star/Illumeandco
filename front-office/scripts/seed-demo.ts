/**
 * Demo environment seed: "Dubai Smile Clinic".
 *
 * Creates a demo login and a business flagged is_demo (the dashboard shows a
 * "Demo environment" banner). Conversations are produced by sending customer
 * messages through the real AI orchestrator, so bookings, leads and audit
 * entries are genuine results of the agent — only some timestamps are
 * back-dated so the dashboard has history to show.
 *
 *   npm run db:seed-demo            # create if missing
 *   npm run db:seed-demo -- --reset # delete and recreate the demo business
 */
import "dotenv/config";
import { and, eq, inArray, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import { db, getPool } from "../src/db";
import { aiSettings, appointments, businesses, conversations, leads, messages, organizationMembers, users } from "../src/db/schema";
import { hashPassword, signUp } from "../src/server/auth";
import type { Ctx } from "../src/server/context";
import { handleInbound } from "../src/server/ai/orchestrator";
import { bookAppointment, cancelAppointment, setAppointmentOutcome } from "../src/server/services/appointments";
import { createBusiness, setBusinessHours, setOnboardingStep, updateBusiness } from "../src/server/services/business";
import { createService, createStaff } from "../src/server/services/catalog";
import { createCustomer } from "../src/server/services/customers";
import { addSource } from "../src/server/services/knowledge";
import { seedPlans } from "../src/server/services/billing";
import { createRulesProvider } from "../src/server/ai/providers/rules";
import { sweepBusiness } from "../src/server/opportunities/engine";
import { ingestEvent } from "../src/server/integrations/ingest";
import { addToWaitlist } from "../src/server/recovery/slots";

const DEMO_EMAIL = "demo@frontoffice.dev";
const DEMO_PASSWORD = "demo-front-office";
const TZ = "Asia/Dubai";

async function main() {
  await seedPlans();
  const reset = process.argv.includes("--reset");
  let user = await db.query.users.findFirst({ where: eq(users.email, DEMO_EMAIL) });
  let organizationId: string;
  if (!user) {
    const r = await signUp({ name: "Dr. Layla Mansour", email: DEMO_EMAIL, password: DEMO_PASSWORD });
    user = r.user;
    organizationId = r.organization.id;
  } else {
    await db.update(users).set({ passwordHash: await hashPassword(DEMO_PASSWORD) }).where(eq(users.id, user.id));
    const m = await db.query.organizationMembers.findFirst({ where: eq(organizationMembers.userId, user.id) });
    organizationId = m!.organizationId;
  }
  const existing = await db.query.businesses.findFirst({ where: and(eq(businesses.organizationId, organizationId), eq(businesses.isDemo, true)) });
  if (existing && !reset) {
    console.log(`Demo business already exists. Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD} (use --reset to recreate).`);
    return;
  }
  if (existing) await db.delete(businesses).where(eq(businesses.id, existing.id));

  const business = await createBusiness(organizationId, { name: "Dubai Smile Clinic", type: "dentist", timezone: TZ, currency: "AED", isDemo: true });
  const ctx: Ctx = { businessId: business.id, actor: { type: "user", userId: user.id, name: user.name, role: "owner" } };
  await updateBusiness(ctx, {
    description: "Family and cosmetic dentistry in Dubai Healthcare City.",
    address: "Building 64, Al Razi Medical Complex",
    city: "Dubai",
    country: "UAE",
    phone: "+971 4 555 0123",
    email: "hello@dubaismile.example",
    website: "https://dubaismile.example",
    policies: {
      cancellation: "Please give at least 24 hours' notice to cancel or reschedule. Late cancellations may incur a AED 100 fee.",
      late: "If you arrive more than 15 minutes late we may need to reschedule your appointment.",
      refund: "Treatment fees are non-refundable once treatment has started. Our team handles all refund requests personally.",
      booking: "New patients should arrive 10 minutes early to complete a short registration form.",
    },
  });
  // Mon–Thu & Sat 09:00–20:00, Fri 14:00–20:00, Sun closed
  await setBusinessHours(ctx, [
    ...[1, 2, 3, 4, 6].map((weekday) => ({ weekday, openTime: "09:00", closeTime: "20:00" })),
    { weekday: 5, openTime: "14:00", closeTime: "20:00" },
  ]);
  const amira = await createStaff(ctx, { name: "Dr. Amira Hassan", title: "Cosmetic Dentist" });
  const omar = await createStaff(ctx, { name: "Dr. Omar Khalid", title: "General Dentist" });
  const noor = await createStaff(ctx, { name: "Noor Saleh", title: "Dental Hygienist" });
  const consultation = await createService(ctx, { name: "Dental consultation", description: "Full check-up and treatment plan with a dentist.", priceCents: 25000, durationMinutes: 30, staffIds: [amira.id, omar.id] });
  const whitening = await createService(ctx, { name: "Teeth whitening", description: "In-clinic professional whitening, up to 8 shades brighter.", priceCents: 65000, durationMinutes: 60, bufferMinutes: 15, staffIds: [amira.id] });
  const cleaning = await createService(ctx, { name: "Cleaning", description: "Scale and polish with our hygienist.", priceCents: 30000, durationMinutes: 45, staffIds: [noor.id, omar.id] });
  await createService(ctx, { name: "Invisalign assessment", description: "Clear aligner suitability assessment and 3D scan.", priceCents: 50000, priceIsFrom: true, durationMinutes: 45, staffIds: [amira.id], onlineBookingEnabled: false });

  await addSource(ctx, {
    kind: "faq",
    title: "Patient FAQs",
    content: [
      "Q: Do you have parking?\nA: Yes — free underground parking for patients in the Al Razi complex. Bring your ticket to reception for validation.",
      "Q: Do you accept insurance?\nA: We accept most major UAE insurance plans including Daman, AXA and MetLife. Please bring your insurance card.",
      "Q: Does teeth whitening hurt?\nA: Most patients feel little or no discomfort. Some people have mild sensitivity for a day or two afterwards.",
      "Q: How long does whitening last?\nA: Results typically last 1–3 years depending on diet and habits like coffee and smoking.",
      "Q: Do you see children?\nA: Yes, we see children from age 3 for check-ups and cleanings.",
      "Q: What languages do you speak?\nA: Our team speaks English, Arabic, Hindi and Urdu.",
    ].join("\n\n"),
  });
  await addSource(ctx, {
    kind: "text",
    title: "Whitening aftercare",
    content: "After whitening, avoid coffee, tea, red wine, curry and smoking for 48 hours. Use a sensitivity toothpaste if your teeth feel sensitive.",
  });
  const s = await db.query.aiSettings.findFirst({ where: eq(aiSettings.businessId, business.id) });
  await db.update(aiSettings).set({ widget: { ...s!.widget, title: "Dubai Smile Clinic", accentColor: "#0f766e" } }).where(eq(aiSettings.businessId, business.id));
  for (let step = 2; step <= 11; step++) await setOnboardingStep(ctx, step);

  // ── Real past activity (bookings made by staff, then completed) ──────────
  const now = DateTime.now().setZone(TZ);
  const people = [
    ["Fatima Al Zahra", "+971501110001"],
    ["James Carter", "+971501110002"],
    ["Priya Nair", "+971501110003"],
    ["Ahmed Rashid", "+971501110004"],
    ["Elena Petrova", "+971501110005"],
    ["Yusuf Demir", "+971501110006"],
  ] as const;
  const customers = [];
  for (const [name, phone] of people) customers.push((await createCustomer(ctx, { name, phone, source: "walk_in" })).customer);

  // Upcoming appointments booked by staff
  const nextOpen = (days: number, hhmm: string) => {
    let d = now.plus({ days });
    while (d.weekday === 7) d = d.plus({ days: 1 });
    return DateTime.fromISO(`${d.toISODate()}T${hhmm}`, { zone: TZ }).toJSDate();
  };
  const upcoming = [
    [customers[0]!, cleaning.id, nextOpen(1, "10:00")],
    [customers[1]!, consultation.id, nextOpen(1, "16:30")],
    [customers[2]!, whitening.id, nextOpen(2, "15:00")],
    [customers[3]!, cleaning.id, nextOpen(3, "18:00")],
  ] as const;
  for (const [c, serviceId, startsAt] of upcoming) await bookAppointment(ctx, { serviceId, startsAt, customerId: c.id, source: "staff" }).catch((e) => console.warn("skip:", e.message));

  // A past, completed visit and a cancellation (back-dated)
  const pastBooking = await bookAppointment(ctx, { serviceId: cleaning.id, startsAt: nextOpen(4, "09:00"), customerId: customers[4]!.id, source: "staff" });
  await setAppointmentOutcome(ctx, pastBooking.appointment.id, "completed");
  const shiftBack = 140 * 86400_000;
  await db
    .update(appointments)
    .set({
      startsAt: sql`${appointments.startsAt} - ${`${shiftBack} milliseconds`}::interval`,
      endsAt: sql`${appointments.endsAt} - ${`${shiftBack} milliseconds`}::interval`,
      blockedUntil: sql`${appointments.blockedUntil} - ${`${shiftBack} milliseconds`}::interval`,
      createdAt: sql`${appointments.createdAt} - ${`${shiftBack} milliseconds`}::interval`,
    })
    .where(eq(appointments.id, pastBooking.appointment.id));
  // Two people waiting for an earlier consultation — the cancellation below frees a slot for them.
  for (const c of [customers[3]!, customers[0]!])
    await addToWaitlist(ctx, { customerId: c.id, serviceId: consultation.id, earliestDate: now.toISODate()!, latestDate: now.plus({ days: 14 }).toISODate(), source: "staff" });
  const toCancel = await bookAppointment(ctx, { serviceId: consultation.id, startsAt: nextOpen(5, "12:00"), customerId: customers[5]!.id, source: "staff" });
  await cancelAppointment(ctx, toCancel.appointment.id, "Travelling");

  // ── Website chat conversations, run through the real agent ───────────────
  const provider = createRulesProvider();
  const chat = async (identity: string, lines: string[]) => {
    let r;
    for (const text of lines) r = await handleInbound({ businessId: business.id, channel: "web_chat", identity, text }, { provider });
    return r!;
  };
  await chat("demo-visitor-sarah", ["Hi, how much is teeth whitening?", "Can I come tomorrow?", "2pm works", "Sarah Johnson, +971 50 123 4567"]);
  await chat("demo-visitor-maria", ["Do you have parking?", "And how much is a cleaning?"]);
  const daniel = await chat("demo-visitor-daniel", ["Hello", "Is a dental consultation expensive?", "my name is Daniel Brooks, daniel@example.com"]);
  await chat("demo-visitor-hana", ["I chipped my tooth and it hurts a lot, is that normal?"]);
  await chat("demo-visitor-khalid", ["How much is Invisalign?", "Can someone call me?"]);

  // Back-date Daniel's inquiry so it surfaces as a missed opportunity.
  const old = new Date(Date.now() - 3 * 86400_000);
  await db.update(leads).set({ createdAt: old, lastContactAt: old }).where(eq(leads.customerId, daniel.customerId));
  await db.update(messages).set({ createdAt: old }).where(eq(messages.conversationId, daniel.conversationId));
  await db.update(conversations).set({ lastMessageAt: old, lastCustomerMessageAt: old, createdAt: old }).where(eq(conversations.id, daniel.conversationId));
  // A missed call, processed by the real integration pipeline (texted back only if SMS is configured).
  await ingestEvent(business.id, {
    connector: "webhook",
    externalId: "demo-missed-call-1",
    type: "call.missed",
    occurredAt: new Date(Date.now() - 20 * 60_000),
    payload: { from: "+971501110099", reason: "after_hours", voicemailTranscript: "Hi, I wanted to ask about Invisalign for my daughter. Please call me back." },
  });
  // Let the Opportunity Engine classify everything above (leads, cancellation, lapsed customer, handoffs).
  await sweepBusiness({ businessId: business.id, actor: { type: "system", name: "Opportunity Engine" } });

  console.log("✓ Demo business created: Dubai Smile Clinic");
  console.log(`  Sign in at /login with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Widget key: ${business.publicKey}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
