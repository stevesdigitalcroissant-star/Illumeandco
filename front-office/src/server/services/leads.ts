import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { customers, leads, services } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, notFound, type Ctx } from "../context";

export type LeadStatus = (typeof leads.$inferSelect)["status"];
export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "appointment_booked", "completed", "lost"];
const OPEN_STATUSES: LeadStatus[] = ["new", "contacted", "qualified"];

export async function listLeads(ctx: Ctx, opts: { status?: LeadStatus; limit?: number } = {}) {
  assertCan(ctx, "leads.manage");
  return dbOf(ctx)
    .select({
      lead: leads,
      customer: { id: customers.id, name: customers.name, email: customers.email, phone: customers.phone },
      serviceName: services.name,
    })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .leftJoin(services, eq(services.id, leads.serviceId))
    .where(and(eq(leads.businessId, ctx.businessId), opts.status ? eq(leads.status, opts.status) : undefined))
    .orderBy(desc(sql`coalesce(${leads.lastContactAt}, ${leads.createdAt})`))
    .limit(opts.limit ?? 300);
}

export async function getLead(ctx: Ctx, leadId: string) {
  const l = await dbOf(ctx).query.leads.findFirst({ where: and(eq(leads.businessId, ctx.businessId), eq(leads.id, leadId)) });
  if (!l) throw notFound("Lead");
  return l;
}

export async function findOpenLead(ctx: Ctx, customerId: string) {
  const [l] = await dbOf(ctx)
    .select()
    .from(leads)
    .where(and(eq(leads.businessId, ctx.businessId), eq(leads.customerId, customerId), inArray(leads.status, OPEN_STATUSES)))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  return l ?? null;
}

export async function latestLeadForCustomer(ctx: Ctx, customerId: string) {
  const [l] = await dbOf(ctx)
    .select()
    .from(leads)
    .where(and(eq(leads.businessId, ctx.businessId), eq(leads.customerId, customerId), notInArray(leads.status, ["completed", "lost"])))
    .orderBy(desc(leads.createdAt))
    .limit(1);
  return l ?? null;
}

/**
 * Create a lead, or update the customer's open lead (one active lead per
 * customer keeps the pipeline honest).
 */
export async function upsertLead(
  ctx: Ctx,
  input: {
    customerId: string;
    source: string;
    conversationId?: string | null;
    serviceId?: string | null;
    serviceInterest?: string | null;
    notes?: string | null;
    status?: LeadStatus;
  },
) {
  if (input.serviceId) {
    const s = await dbOf(ctx).query.services.findFirst({
      where: and(eq(services.businessId, ctx.businessId), eq(services.id, input.serviceId)),
    });
    if (!s) throw notFound("Service");
  }
  const customer = await dbOf(ctx).query.customers.findFirst({
    where: and(eq(customers.businessId, ctx.businessId), eq(customers.id, input.customerId)),
  });
  if (!customer) throw notFound("Customer");

  const open = await findOpenLead(ctx, input.customerId);
  if (open) {
    const patch: Partial<typeof leads.$inferInsert> = { lastContactAt: new Date() };
    if (input.serviceId) patch.serviceId = input.serviceId;
    if (input.serviceInterest) patch.serviceInterest = input.serviceInterest;
    if (input.conversationId && !open.conversationId) patch.conversationId = input.conversationId;
    if (input.notes) patch.notes = open.notes ? `${open.notes}\n${input.notes}` : input.notes;
    if (input.status) patch.status = input.status;
    const [l] = await dbOf(ctx).update(leads).set(patch).where(eq(leads.id, open.id)).returning();
    return { lead: l!, created: false };
  }
  const [l] = await dbOf(ctx)
    .insert(leads)
    .values({
      businessId: ctx.businessId,
      customerId: input.customerId,
      source: input.source,
      conversationId: input.conversationId ?? null,
      serviceId: input.serviceId ?? null,
      serviceInterest: input.serviceInterest ?? null,
      notes: input.notes ?? null,
      status: input.status ?? "new",
      lastContactAt: new Date(),
    })
    .returning();
  await audit(ctx, {
    action: "lead.created",
    summary: `Lead created for ${customer.name ?? customer.email ?? customer.phone ?? "visitor"}${input.serviceInterest ? ` — interested in ${input.serviceInterest}` : ""}`,
    entityType: "lead",
    entityId: l!.id,
    details: { source: input.source },
  });
  return { lead: l!, created: true };
}

export async function updateLead(
  ctx: Ctx,
  leadId: string,
  patch: Partial<Pick<typeof leads.$inferInsert, "status" | "notes" | "serviceId" | "serviceInterest" | "nextFollowUpAt" | "lostReason" | "appointmentId" | "lastContactAt">>,
) {
  if (ctx.actor.type === "user") assertCan(ctx, "leads.manage");
  if (patch.status && !LEAD_STATUSES.includes(patch.status)) throw invalid("Unknown lead status.");
  const existing = await getLead(ctx, leadId);
  const [l] = await dbOf(ctx)
    .update(leads)
    .set(patch)
    .where(and(eq(leads.businessId, ctx.businessId), eq(leads.id, leadId)))
    .returning();
  if (patch.status && patch.status !== existing.status) {
    await audit(ctx, {
      action: "lead.updated",
      summary: `Lead moved from ${existing.status.replace("_", " ")} to ${patch.status.replace("_", " ")}`,
      entityType: "lead",
      entityId: leadId,
      details: { from: existing.status, to: patch.status },
    });
  }
  return l!;
}
