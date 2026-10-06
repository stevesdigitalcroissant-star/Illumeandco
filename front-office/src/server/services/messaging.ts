/** Proactive outbound messages (follow-ups, reminders, review requests). */
import { and, desc, eq } from "drizzle-orm";
import { conversations, customers } from "@/db/schema";
import { getChannel, PROACTIVE_ORDER } from "../channels/registry";
import type { ChannelKind, DeliveryResult } from "../channels/types";
import { dbOf, notFound, type Ctx } from "../context";
import { getBusiness } from "./business";
import { appendMessage, createConversation } from "./conversations";

export { renderTemplate } from "@/lib/templates";

export type ProactiveDelivery = DeliveryResult & { channel: ChannelKind | null; conversationId: string | null; messageId: string | null };

/**
 * Deliver a message to a customer through the best available channel:
 * a configured direct channel (WhatsApp → SMS → email) the customer can be
 * reached on, else their website chat thread. Never claims delivery that did
 * not happen — the result says exactly what occurred.
 */
export async function deliverToCustomer(
  ctx: Ctx,
  input: { customerId: string; text: string; subject?: string; role?: "ai" | "system" | "human"; metadata?: Record<string, unknown> },
): Promise<ProactiveDelivery> {
  const customer = await dbOf(ctx).query.customers.findFirst({
    where: and(eq(customers.businessId, ctx.businessId), eq(customers.id, input.customerId)),
  });
  if (!customer) throw notFound("Customer");
  if (customer.optedOut)
    return { ok: false, status: "unreachable", detail: "Customer opted out of messages.", channel: null, conversationId: null, messageId: null };
  const business = await getBusiness(ctx);
  const to = { name: customer.name, email: customer.email, phone: customer.phone };

  const existing = await dbOf(ctx)
    .select()
    .from(conversations)
    .where(and(eq(conversations.businessId, ctx.businessId), eq(conversations.customerId, customer.id)))
    .orderBy(desc(conversations.lastMessageAt));

  for (const kind of PROACTIVE_ORDER) {
    const adapter = getChannel(kind);
    if (!adapter.isConfigured() || !adapter.canReach(to)) continue;
    const result = await adapter.send({ businessId: ctx.businessId, businessName: business.name, to, text: input.text, subject: input.subject });
    if (!result.ok) continue;
    const conv = existing.find((c) => c.channel === kind) ?? (await createConversation(ctx, { customerId: customer.id, channel: kind }));
    const m = await appendMessage(ctx, {
      conversationId: conv.id,
      role: input.role ?? "ai",
      content: input.text,
      deliveryStatus: result.status,
      metadata: { proactive: true, ...input.metadata },
    });
    return { ...result, channel: kind, conversationId: conv.id, messageId: m.id };
  }

  const chat = existing.find((c) => c.channel === "web_chat");
  if (chat) {
    const result = await getChannel("web_chat").send({ businessId: ctx.businessId, businessName: business.name, to, text: input.text });
    const m = await appendMessage(ctx, {
      conversationId: chat.id,
      role: input.role ?? "ai",
      content: input.text,
      deliveryStatus: result.status,
      metadata: { proactive: true, ...input.metadata },
    });
    return { ...result, channel: "web_chat", conversationId: chat.id, messageId: m.id };
  }

  return {
    ok: false,
    status: "unreachable",
    detail: "No configured channel can reach this customer (connect WhatsApp, SMS or email, or the customer must have a chat thread).",
    channel: null,
    conversationId: null,
    messageId: null,
  };
}
