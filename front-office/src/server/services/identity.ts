/**
 * Customer identity resolution for conversations.
 *
 * A website visitor starts as an anonymous customer. When they share contact
 * details, either the anonymous record is filled in, or — if those details
 * already belong to a customer of this business — the conversation (and the
 * visitor's leads/follow-ups) is re-linked to the existing customer so their
 * history stays in one place.
 */
import { and, eq } from "drizzle-orm";
import { db as rootDb, type Tx } from "@/db";
import { appointments, conversations, customers, followUps, leads, reviews } from "@/db/schema";
import { audit } from "../audit";
import { dbOf, invalid, notFound, type Ctx } from "../context";
import { findCustomerByContact, normalizeCustomerEmail, normalizePhone } from "./customers";

export async function attachContactDetails(
  ctx: Ctx,
  input: { conversationId: string; customerId: string; name?: string | null; email?: string | null; phone?: string | null },
): Promise<{ customerId: string; merged: boolean }> {
  const email = normalizeCustomerEmail(input.email);
  const phone = normalizePhone(input.phone);
  const name = input.name?.trim().slice(0, 120) || null;
  if (!email && !phone && !name) throw invalid("No contact details provided.");

  const run = async (tx: Tx): Promise<{ customerId: string; merged: boolean }> => {
    const c = { ...ctx, tx };
    const current = await tx.query.customers.findFirst({
      where: and(eq(customers.businessId, ctx.businessId), eq(customers.id, input.customerId)),
    });
    if (!current) throw notFound("Customer");
    const match = email || phone ? await findCustomerByContact(c, { email, phone }) : null;

    if (match && match.id !== current.id) {
      // Returning customer: move this visitor's records onto the known customer.
      const scope = (table: typeof conversations | typeof leads | typeof followUps | typeof appointments | typeof reviews) =>
        and(eq(table.businessId, ctx.businessId), eq(table.customerId, current.id));
      await tx.update(conversations).set({ customerId: match.id }).where(scope(conversations));
      await tx.update(leads).set({ customerId: match.id }).where(scope(leads));
      await tx.update(followUps).set({ customerId: match.id }).where(scope(followUps));
      await tx.update(appointments).set({ customerId: match.id }).where(scope(appointments));
      await tx.update(reviews).set({ customerId: match.id }).where(scope(reviews));
      const patch: Partial<typeof customers.$inferInsert> = { lastSeenAt: new Date() };
      if (name && !match.name) patch.name = name;
      if (email && !match.email) patch.email = email;
      if (phone && !match.phone) patch.phone = phone;
      await tx.update(customers).set(patch).where(eq(customers.id, match.id));
      // Only an anonymous shell is removed; a real customer record is never deleted.
      if (!current.email && !current.phone) await tx.delete(customers).where(eq(customers.id, current.id));
      await audit(c, {
        action: "customer.updated",
        summary: `Recognised returning customer ${match.name ?? name ?? ""} — conversation linked to existing record`.replace("  ", " "),
        entityType: "customer",
        entityId: match.id,
        details: { mergedFrom: current.id },
      });
      return { customerId: match.id, merged: true };
    }

    const patch: Partial<typeof customers.$inferInsert> = { lastSeenAt: new Date() };
    if (name) patch.name = name;
    if (email) patch.email = email;
    if (phone) patch.phone = phone;
    await tx.update(customers).set(patch).where(eq(customers.id, current.id));
    const wasAnonymous = !current.name && !current.email && !current.phone;
    await audit(c, {
      action: wasAnonymous ? "customer.created" : "customer.updated",
      summary: wasAnonymous
        ? `Customer ${name ?? email ?? phone} captured from conversation`
        : `Customer ${name ?? current.name ?? ""} contact details updated`,
      entityType: "customer",
      entityId: current.id,
      details: { fields: Object.keys(patch).filter((k) => k !== "lastSeenAt") },
    });
    return { customerId: current.id, merged: false };
  };
  return ctx.tx ? run(ctx.tx) : rootDb.transaction(run);
}

export async function conversationCustomerId(ctx: Ctx, conversationId: string) {
  const c = await dbOf(ctx).query.conversations.findFirst({
    where: and(eq(conversations.businessId, ctx.businessId), eq(conversations.id, conversationId)),
  });
  if (!c) throw notFound("Conversation");
  return c.customerId;
}
