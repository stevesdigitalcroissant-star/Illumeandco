import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { appointments, conversations, customers, staff, type CustomerMemory } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, isRestrictedStaff, notFound, type Ctx } from "../context";

export type CustomerInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  source?: string | null;
  tags?: string[];
};

export function normalizePhone(phone: string | null | undefined) {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) throw invalid("That phone number doesn't look right.");
  return (trimmed.startsWith("+") ? "+" : "") + digits;
}

export function normalizeCustomerEmail(email: string | null | undefined) {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw invalid("That email address doesn't look right.");
  return e;
}

/** Staff only see customers they have a conversation or appointment with. */
function staffVisibility(ctx: Ctx): SQL | undefined {
  if (!isRestrictedStaff(ctx)) return undefined;
  const userId = ctx.actor.userId;
  return sql`(exists (select 1 from ${conversations} c where c.customer_id = ${customers.id} and c.business_id = ${ctx.businessId} and c.assigned_user_id = ${userId})
    or exists (select 1 from ${appointments} a join ${staff} s on s.id = a.staff_id where a.customer_id = ${customers.id} and a.business_id = ${ctx.businessId} and s.user_id = ${userId}))`;
}

export async function listCustomers(ctx: Ctx, opts: { search?: string; limit?: number } = {}) {
  const conds: (SQL | undefined)[] = [eq(customers.businessId, ctx.businessId), staffVisibility(ctx)];
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    conds.push(or(ilike(customers.name, q), ilike(customers.email, q), ilike(customers.phone, q)));
  }
  return dbOf(ctx)
    .select()
    .from(customers)
    .where(and(...conds))
    .orderBy(desc(sql`coalesce(${customers.lastSeenAt}, ${customers.createdAt})`))
    .limit(opts.limit ?? 200);
}

export async function getCustomer(ctx: Ctx, customerId: string) {
  const [c] = await dbOf(ctx)
    .select()
    .from(customers)
    .where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, customerId), staffVisibility(ctx)))
    .limit(1);
  if (!c) throw notFound("Customer");
  return c;
}

/** Find a customer by email or phone within this business. */
export async function findCustomerByContact(ctx: Ctx, contact: { email?: string | null; phone?: string | null }) {
  const email = normalizeCustomerEmail(contact.email);
  const phone = normalizePhone(contact.phone);
  if (!email && !phone) return null;
  const conds = [];
  if (email) conds.push(sql`lower(${customers.email}) = ${email}`);
  if (phone) conds.push(eq(customers.phone, phone));
  const [c] = await dbOf(ctx)
    .select()
    .from(customers)
    .where(and(eq(customers.businessId, ctx.businessId), or(...conds)))
    .limit(1);
  return c ?? null;
}

export async function createCustomer(ctx: Ctx, input: CustomerInput) {
  const email = normalizeCustomerEmail(input.email);
  const phone = normalizePhone(input.phone);
  const existing = await findCustomerByContact(ctx, { email, phone });
  if (existing) return { customer: existing, created: false };
  const [c] = await dbOf(ctx)
    .insert(customers)
    .values({
      businessId: ctx.businessId,
      name: input.name?.trim() || null,
      email,
      phone,
      notes: input.notes ?? null,
      source: input.source ?? null,
      tags: input.tags ?? [],
      lastSeenAt: new Date(),
    })
    .returning();
  await audit(ctx, {
    action: "customer.created",
    summary: `Customer ${c!.name ?? email ?? phone ?? "(anonymous)"} created`,
    entityType: "customer",
    entityId: c!.id,
    details: { source: input.source ?? null },
  });
  return { customer: c!, created: true };
}

/** Anonymous visitor (e.g. website chat before they share details). */
export async function createAnonymousCustomer(ctx: Ctx, source: string) {
  const [c] = await dbOf(ctx)
    .insert(customers)
    .values({ businessId: ctx.businessId, source, lastSeenAt: new Date() })
    .returning();
  return c!;
}

export async function updateCustomer(ctx: Ctx, customerId: string, patch: CustomerInput & { optedOut?: boolean }) {
  assertCan(ctx, "customers.edit");
  const existing = await getCustomer(ctx, customerId);
  const values: Partial<typeof customers.$inferInsert> = {};
  if (patch.name !== undefined) values.name = patch.name?.trim() || null;
  if (patch.email !== undefined) values.email = normalizeCustomerEmail(patch.email);
  if (patch.phone !== undefined) values.phone = normalizePhone(patch.phone);
  if (patch.notes !== undefined) values.notes = patch.notes;
  if (patch.tags !== undefined) values.tags = patch.tags;
  if (patch.optedOut !== undefined) values.optedOut = patch.optedOut;

  // If the new email/phone belongs to another customer in this business, refuse rather than silently merge.
  if (values.email || values.phone) {
    const other = await findCustomerByContact(ctx, { email: values.email, phone: values.phone });
    if (other && other.id !== customerId)
      throw invalid("Another customer already uses that email or phone number.");
  }
  const [c] = await dbOf(ctx)
    .update(customers)
    .set(values)
    .where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, customerId)))
    .returning();
  const changed = Object.keys(values).filter(
    (k) => JSON.stringify((existing as Record<string, unknown>)[k]) !== JSON.stringify((values as Record<string, unknown>)[k]),
  );
  if (changed.length) {
    await audit(ctx, {
      action: patch.optedOut ? "customer.opted_out" : "customer.updated",
      summary: patch.optedOut
        ? `${c!.name ?? "Customer"} opted out of messages`
        : `Customer ${c!.name ?? ""} updated (${changed.join(", ")})`.replace("  ", " "),
      entityType: "customer",
      entityId: customerId,
      details: { changed },
    });
  }
  return c!;
}

export async function touchCustomer(ctx: Ctx, customerId: string) {
  await dbOf(ctx)
    .update(customers)
    .set({ lastSeenAt: new Date() })
    .where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, customerId)));
}

/** Store a durable, non-sensitive fact about the customer (preferences, language…). */
export async function rememberFact(ctx: Ctx, customerId: string, key: string, value: string) {
  const c = await getCustomer(ctx, customerId);
  const facts = c.memory.facts.filter((f) => f.key !== key);
  facts.push({ key, value: value.slice(0, 300), at: new Date().toISOString() });
  const memory: CustomerMemory = { facts: facts.slice(-30) };
  await dbOf(ctx).update(customers).set({ memory }).where(and(eq(customers.businessId, ctx.businessId), eq(customers.id, customerId)));
}
