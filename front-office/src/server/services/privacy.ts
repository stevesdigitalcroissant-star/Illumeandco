/**
 * Customer data rights: export everything held about a customer, and erase it.
 *
 * Erasure deletes the customer and everything linked to them (conversations
 * and messages, appointments, leads, opportunities, follow-ups, reviews,
 * waitlist entries, offers, AI action logs), and redacts their name, email
 * and phone wherever they were copied as text (audit log summaries,
 * notifications, integration event payloads). A single audit entry records
 * that an erasure happened, without the personal data.
 */
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import {
  aiActions,
  appointments,
  auditLogs,
  conversations,
  customers,
  followUps,
  integrationEvents,
  leads,
  messages,
  notifications,
  opportunities,
  reviews,
  slotOffers,
  slotRecoveries,
  waitlistEntries,
} from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, notFound, type Ctx } from "../context";

async function load(ctx: Ctx, customerId: string) {
  const c = await dbOf(ctx).query.customers.findFirst({ where: and(eq(customers.businessId, ctx.businessId), eq(customers.id, customerId)) });
  if (!c) throw notFound("Customer");
  return c;
}

export async function exportCustomerData(ctx: Ctx, customerId: string) {
  assertCan(ctx, "business.manage");
  const db = dbOf(ctx);
  const b = ctx.businessId;
  const customer = await load(ctx, customerId);
  const convs = await db.select().from(conversations).where(and(eq(conversations.businessId, b), eq(conversations.customerId, customerId)));
  const convIds = convs.map((c) => c.id);
  const byCustomer = <T extends { businessId: unknown; customerId: unknown }>(t: T) => and(eq(t.businessId as never, b), eq(t.customerId as never, customerId));
  const data = {
    exportedAt: new Date().toISOString(),
    customer,
    conversations: await Promise.all(
      convs.map(async (c) => ({ ...c, messages: await db.select().from(messages).where(and(eq(messages.businessId, b), eq(messages.conversationId, c.id))).orderBy(messages.createdAt) })),
    ),
    appointments: await db.select().from(appointments).where(byCustomer(appointments)),
    leads: await db.select().from(leads).where(byCustomer(leads)),
    opportunities: await db.select().from(opportunities).where(byCustomer(opportunities)),
    followUps: await db.select().from(followUps).where(byCustomer(followUps)),
    reviews: await db.select().from(reviews).where(byCustomer(reviews)),
    waitlist: await db.select().from(waitlistEntries).where(byCustomer(waitlistEntries)),
    slotOffers: await db.select().from(slotOffers).where(byCustomer(slotOffers)),
    aiActions: convIds.length ? await db.select().from(aiActions).where(and(eq(aiActions.businessId, b), inArray(aiActions.conversationId, convIds))) : [],
  };
  await audit(ctx, { action: "customer.exported", summary: "Customer data exported", entityType: "customer", entityId: customerId });
  return data;
}

export async function eraseCustomer(ctx: Ctx, customerId: string, opts: { now?: Date } = {}) {
  assertCan(ctx, "business.manage");
  const now = opts.now ?? new Date();
  const db = dbOf(ctx);
  const b = ctx.businessId;
  const customer = await load(ctx, customerId);
  const [upcoming] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.businessId, b), eq(appointments.customerId, customerId), inArray(appointments.status, ["booked", "confirmed"]), gt(appointments.startsAt, now)))
    .limit(1);
  if (upcoming) throw invalid("This customer has an upcoming appointment. Cancel it first, then delete their data.");

  const identifiers = [customer.name, customer.email, customer.phone].filter((v): v is string => Boolean(v && v.trim().length >= 3));
  const convIds = (await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.businessId, b), eq(conversations.customerId, customerId)))).map((c) => c.id);
  const apptIds = (await db.select({ id: appointments.id }).from(appointments).where(and(eq(appointments.businessId, b), eq(appointments.customerId, customerId)))).map((a) => a.id);

  // Rows that reference the customer without a foreign key.
  if (convIds.length) await db.delete(aiActions).where(and(eq(aiActions.businessId, b), inArray(aiActions.conversationId, convIds)));
  await db.update(slotRecoveries).set({ filledCustomerId: null }).where(and(eq(slotRecoveries.businessId, b), eq(slotRecoveries.filledCustomerId, customerId)));
  await db
    .update(integrationEvents)
    .set({ customerId: null, payload: { redacted: true }, result: "Redacted — customer data erased" })
    .where(and(eq(integrationEvents.businessId, b), eq(integrationEvents.customerId, customerId)));

  // Personal data copied as text into logs and notifications.
  const entityIds = [customerId, ...convIds, ...apptIds];
  for (const value of identifiers) {
    const like = `%${value.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const re = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await db.execute(sql`
      update ${auditLogs} set summary = regexp_replace(summary, ${re}, '[deleted customer]', 'gi'), details = '{}'::jsonb
      where business_id = ${b} and (summary ilike ${like} or details::text ilike ${like})`);
    await db.execute(sql`
      update ${notifications} set title = regexp_replace(title, ${re}, '[deleted customer]', 'gi'), body = regexp_replace(coalesce(body, ''), ${re}, '[deleted customer]', 'gi')
      where business_id = ${b} and (title ilike ${like} or body ilike ${like})`);
    await db.execute(sql`
      update ${integrationEvents} set payload = '{"redacted":true}'::jsonb
      where business_id = ${b} and payload::text ilike ${like}`);
  }
  await db.update(auditLogs).set({ details: {} }).where(and(eq(auditLogs.businessId, b), inArray(auditLogs.entityId, entityIds)));

  // Everything with a foreign key to the customer is removed by cascade
  // (conversations → messages, appointments → reminders, leads, opportunities, follow-ups, reviews, waitlist, offers).
  await db.delete(customers).where(and(eq(customers.businessId, b), eq(customers.id, customerId)));
  await audit(ctx, { action: "customer.erased", summary: "A customer's data was erased on request", entityType: "customer", entityId: null });
  return { conversations: convIds.length, appointments: apptIds.length };
}

/** Used by tests and the UI: does anything still hold this customer's identifiers? */
export async function remainingTraces(ctx: Ctx, value: string) {
  const like = `%${value}%`;
  const b = ctx.businessId;
  const [r] = (
    await dbOf(ctx).execute<{ n: string }>(sql`
      select (select count(*) from audit_logs where business_id = ${b} and (summary ilike ${like} or details::text ilike ${like}))
           + (select count(*) from notifications where business_id = ${b} and (title ilike ${like} or body ilike ${like}))
           + (select count(*) from integration_events where business_id = ${b} and payload::text ilike ${like})
           + (select count(*) from customers where business_id = ${b} and (name ilike ${like} or email ilike ${like} or phone ilike ${like}))
           + (select count(*) from messages where business_id = ${b} and content ilike ${like}) as n`)
  ).rows;
  return Number(r?.n ?? 0);
}
