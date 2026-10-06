/**
 * Conversations, messages and the human-handoff state machine.
 *
 *   owner=ai,    status=new|ai_handling     → AI replies
 *   handoff requested                       → owner=human, status=waiting, handoffRequestedAt set
 *                                             (inbox shows 🔴 HUMAN REQUIRED; AI is silent)
 *   employee takes over                     → owner=human, status=human_handling, assignedUserId
 *   employee returns control                → owner=ai, status=ai_handling
 *   resolved                                → status=resolved (a new customer message reopens it)
 *
 * The AI may only respond while owner = "ai" (enforced in the orchestrator).
 */
import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  appointments,
  conversations,
  customers,
  leads,
  messages,
  notifications,
  users,
} from "@/db/schema";
import { audit } from "../audit";
import { getChannel } from "../channels/registry";
import type { ChannelKind } from "../channels/types";
import { assertCan, dbOf, forbidden, invalid, isRestrictedStaff, notFound, type Ctx } from "../context";
import { getBusiness } from "./business";
import { cancelPendingFollowUps } from "./followups";

export type ConversationStatus = (typeof conversations.$inferSelect)["status"];
type MessageRole = (typeof messages.$inferSelect)["role"];

function staffVisibility(ctx: Ctx): SQL | undefined {
  if (!isRestrictedStaff(ctx)) return undefined;
  // Staff see conversations assigned to them, plus unclaimed handoffs so someone can pick them up.
  return or(
    eq(conversations.assignedUserId, ctx.actor.userId),
    and(isNull(conversations.assignedUserId), isNotNull(conversations.handoffRequestedAt), eq(conversations.owner, "human")),
  );
}

export async function createConversation(
  ctx: Ctx,
  input: { customerId: string; channel: ChannelKind; channelIdentityHash?: string | null },
) {
  const [c] = await dbOf(ctx)
    .insert(conversations)
    .values({
      businessId: ctx.businessId,
      customerId: input.customerId,
      channel: input.channel,
      channelIdentityHash: input.channelIdentityHash ?? null,
    })
    .returning();
  return c!;
}

export async function getConversation(ctx: Ctx, conversationId: string) {
  const [c] = await dbOf(ctx)
    .select()
    .from(conversations)
    .where(and(eq(conversations.businessId, ctx.businessId), eq(conversations.id, conversationId), staffVisibility(ctx)))
    .limit(1);
  if (!c) throw notFound("Conversation");
  return c;
}

export async function findConversationByIdentity(ctx: Ctx, channel: ChannelKind, identityHash: string) {
  const [c] = await dbOf(ctx)
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, ctx.businessId),
        eq(conversations.channel, channel),
        eq(conversations.channelIdentityHash, identityHash),
      ),
    )
    .orderBy(desc(conversations.createdAt))
    .limit(1);
  return c ?? null;
}

export async function listMessages(ctx: Ctx, conversationId: string, opts: { afterId?: string; limit?: number } = {}) {
  await getConversation(ctx, conversationId);
  const rows = await dbOf(ctx)
    .select()
    .from(messages)
    .where(and(eq(messages.businessId, ctx.businessId), eq(messages.conversationId, conversationId)))
    .orderBy(messages.createdAt, messages.id)
    .limit(opts.limit ?? 500);
  if (opts.afterId) {
    const idx = rows.findIndex((m) => m.id === opts.afterId);
    return idx >= 0 ? rows.slice(idx + 1) : rows;
  }
  return rows;
}

/** Append a message and keep the conversation summary fields in sync. */
export async function appendMessage(
  ctx: Ctx,
  input: {
    conversationId: string;
    role: MessageRole;
    content: string;
    authorUserId?: string | null;
    deliveryStatus?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const content = input.content.trim();
  if (!content) throw invalid("Message cannot be empty.");
  if (content.length > 4000) throw invalid("Message is too long.");
  const conv = await getConversation(ctx, input.conversationId);
  const now = new Date();
  const [m] = await dbOf(ctx)
    .insert(messages)
    .values({
      businessId: ctx.businessId,
      conversationId: conv.id,
      role: input.role,
      content,
      channel: conv.channel,
      authorUserId: input.authorUserId ?? null,
      deliveryStatus: input.deliveryStatus ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();

  const patch: Partial<typeof conversations.$inferInsert> = {};
  if (input.role !== "system") {
    patch.lastMessageAt = now;
    patch.lastMessagePreview = content.slice(0, 140);
  }
  if (input.role === "customer") {
    patch.lastCustomerMessageAt = now;
    if (conv.status === "resolved") patch.status = conv.owner === "ai" ? "ai_handling" : "waiting";
  }
  if (input.role === "ai" && conv.status === "new") patch.status = "ai_handling";
  if (Object.keys(patch).length)
    await dbOf(ctx).update(conversations).set(patch).where(eq(conversations.id, conv.id));
  return m!;
}

/** Timeline event visible in the inbox (bookings, handoffs…). Not shown to customers. */
export async function addEvent(ctx: Ctx, conversationId: string, text: string, metadata: Record<string, unknown> = {}) {
  return appendMessage(ctx, { conversationId, role: "system", content: text, metadata: { event: true, ...metadata } });
}

export async function requestHandoff(ctx: Ctx, conversationId: string, reason: string) {
  const conv = await getConversation(ctx, conversationId);
  if (conv.owner === "human" && conv.handoffRequestedAt) return conv; // already waiting for a human
  const [c] = await dbOf(ctx)
    .update(conversations)
    .set({ owner: "human", status: "waiting", handoffRequestedAt: new Date(), handoffReason: reason.slice(0, 500) })
    .where(eq(conversations.id, conv.id))
    .returning();
  const customer = await dbOf(ctx).query.customers.findFirst({ where: eq(customers.id, conv.customerId) });
  const who = customer?.name ?? customer?.email ?? customer?.phone ?? "a website visitor";
  await dbOf(ctx).insert(notifications).values({
    businessId: ctx.businessId,
    kind: "handoff",
    title: `Human required — ${who.charAt(0).toUpperCase()}${who.slice(1)}`,
    body: reason,
    link: `/app/inbox?c=${conv.id}`,
  });
  await addEvent(ctx, conv.id, `Handed off to a human: ${reason}`, { kind: "handoff" });
  // A human is now responsible — automated follow-ups must stop.
  await cancelPendingFollowUps(ctx, conv.customerId, "Human took over the conversation");
  await audit(ctx, {
    action: "conversation.handoff_requested",
    summary: `Conversation with ${who} handed to a human — ${reason}`,
    entityType: "conversation",
    entityId: conv.id,
    details: { reason },
  });
  return c!;
}

export async function takeOver(ctx: Ctx, conversationId: string) {
  if (ctx.actor.type !== "user") throw forbidden("Only team members can take over a conversation.");
  assertCan(ctx, "conversations.reply");
  const conv = await getConversation(ctx, conversationId);
  const [c] = await dbOf(ctx)
    .update(conversations)
    .set({ owner: "human", status: "human_handling", assignedUserId: ctx.actor.userId, handoffRequestedAt: conv.handoffRequestedAt })
    .where(eq(conversations.id, conv.id))
    .returning();
  await addEvent(ctx, conv.id, `${ctx.actor.name} took over the conversation. The AI is paused.`, { kind: "takeover" });
  await cancelPendingFollowUps(ctx, conv.customerId, "Human took over the conversation");
  await audit(ctx, {
    action: "conversation.taken_over",
    summary: `${ctx.actor.name} took over the conversation`,
    entityType: "conversation",
    entityId: conv.id,
  });
  return c!;
}

export async function returnToAi(ctx: Ctx, conversationId: string) {
  if (ctx.actor.type !== "user") throw forbidden();
  assertCan(ctx, "conversations.reply");
  const conv = await getConversation(ctx, conversationId);
  const [c] = await dbOf(ctx)
    .update(conversations)
    .set({ owner: "ai", status: "ai_handling", handoffRequestedAt: null, handoffReason: null })
    .where(eq(conversations.id, conv.id))
    .returning();
  await addEvent(ctx, conv.id, `${ctx.actor.name} returned the conversation to the AI.`, { kind: "return_to_ai" });
  await audit(ctx, {
    action: "conversation.returned_to_ai",
    summary: `${ctx.actor.name} returned the conversation to the AI receptionist`,
    entityType: "conversation",
    entityId: conv.id,
  });
  return c!;
}

export async function resolveConversation(ctx: Ctx, conversationId: string) {
  assertCan(ctx, "conversations.reply");
  const conv = await getConversation(ctx, conversationId);
  const [c] = await dbOf(ctx)
    .update(conversations)
    .set({ status: "resolved", handoffRequestedAt: null })
    .where(eq(conversations.id, conv.id))
    .returning();
  await audit(ctx, { action: "conversation.resolved", summary: "Conversation marked resolved", entityType: "conversation", entityId: conv.id });
  return c!;
}

export async function assignConversation(ctx: Ctx, conversationId: string, userId: string | null) {
  assertCan(ctx, "conversations.view_all");
  const conv = await getConversation(ctx, conversationId);
  await dbOf(ctx).update(conversations).set({ assignedUserId: userId }).where(eq(conversations.id, conv.id));
  await audit(ctx, {
    action: "conversation.assigned",
    summary: userId ? "Conversation assigned" : "Conversation unassigned",
    entityType: "conversation",
    entityId: conv.id,
    details: { userId },
  });
}

/** A team member replies. Replying while the AI owns the conversation takes it over first. */
export async function sendHumanReply(ctx: Ctx, conversationId: string, content: string) {
  if (ctx.actor.type !== "user") throw forbidden();
  assertCan(ctx, "conversations.reply");
  let conv = await getConversation(ctx, conversationId);
  if (conv.owner === "ai" || conv.status !== "human_handling") conv = await takeOver(ctx, conversationId);
  const customer = await dbOf(ctx).query.customers.findFirst({ where: eq(customers.id, conv.customerId) });
  const business = await getBusiness(ctx);
  const delivery = await getChannel(conv.channel).send({
    businessId: ctx.businessId,
    businessName: business.name,
    to: { name: customer?.name ?? null, email: customer?.email ?? null, phone: customer?.phone ?? null },
    text: content,
  });
  const m = await appendMessage(ctx, {
    conversationId,
    role: "human",
    content,
    authorUserId: ctx.actor.userId,
    deliveryStatus: delivery.status,
    metadata: delivery.ok ? {} : { deliveryError: delivery.detail },
  });
  await audit(ctx, {
    action: "message.sent",
    summary: `${ctx.actor.name} replied to ${customer?.name ?? "customer"} (${delivery.status.replaceAll("_", " ")})`,
    entityType: "conversation",
    entityId: conversationId,
    details: { messageId: m.id, delivery: delivery.status },
  });
  return { message: m, delivery };
}

export type ConversationFilters = {
  status?: ConversationStatus | "needs_human";
  channel?: ChannelKind;
  owner?: "ai" | "human";
  search?: string;
  limit?: number;
};

export async function listConversations(ctx: Ctx, filters: ConversationFilters = {}) {
  const conds: (SQL | undefined)[] = [eq(conversations.businessId, ctx.businessId), staffVisibility(ctx)];
  if (filters.status === "needs_human")
    conds.push(and(eq(conversations.owner, "human"), isNotNull(conversations.handoffRequestedAt), isNull(conversations.assignedUserId)));
  else if (filters.status) conds.push(eq(conversations.status, filters.status));
  if (filters.channel) conds.push(eq(conversations.channel, filters.channel));
  if (filters.owner) conds.push(eq(conversations.owner, filters.owner));
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    conds.push(
      or(
        ilike(customers.name, q),
        ilike(customers.email, q),
        ilike(customers.phone, q),
        ilike(conversations.lastMessagePreview, q),
      ),
    );
  }
  const rows = await dbOf(ctx)
    .select({
      conversation: conversations,
      customer: { id: customers.id, name: customers.name, email: customers.email, phone: customers.phone },
      assignee: { id: users.id, name: users.name },
      leadStatus: sql<string | null>`(select ${leads.status}::text from ${leads} where ${leads.customerId} = ${customers.id} and ${leads.businessId} = ${ctx.businessId} order by ${leads.createdAt} desc limit 1)`,
      nextAppointment: sql<{ startsAt: string; status: string } | null>`(select json_build_object('startsAt', a.starts_at, 'status', a.status) from ${appointments} a where a.customer_id = ${customers.id} and a.business_id = ${ctx.businessId} and a.status in ('booked','confirmed') and a.starts_at > now() order by a.starts_at limit 1)`,
    })
    .from(conversations)
    .innerJoin(customers, eq(customers.id, conversations.customerId))
    .leftJoin(users, eq(users.id, conversations.assignedUserId))
    .where(and(...conds))
    .orderBy(desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`))
    .limit(filters.limit ?? 200);
  return rows.map((r) => ({ ...r, needsHuman: r.conversation.owner === "human" && !!r.conversation.handoffRequestedAt && !r.conversation.assignedUserId }));
}

export async function countNeedsHuman(ctx: Ctx) {
  const [r] = await dbOf(ctx)
    .select({ n: sql<number>`count(*)::int` })
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, ctx.businessId),
        eq(conversations.owner, "human"),
        isNotNull(conversations.handoffRequestedAt),
        isNull(conversations.assignedUserId),
        inArray(conversations.status, ["waiting", "human_handling", "new", "ai_handling"]),
      ),
    );
  return r?.n ?? 0;
}

export async function recentConversationForCustomer(ctx: Ctx, customerId: string) {
  const [c] = await dbOf(ctx)
    .select()
    .from(conversations)
    .where(and(eq(conversations.businessId, ctx.businessId), eq(conversations.customerId, customerId)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  return c ?? null;
}
