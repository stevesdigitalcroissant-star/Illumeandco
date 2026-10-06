/**
 * Channel-agnostic entry point. Every channel (website chat today; SMS,
 * WhatsApp, email, voice transcripts tomorrow) normalises its payload into an
 * InboundMessage and calls handleInbound — the same brain, tools, permissions
 * and audit trail apply everywhere.
 */
import { db as rootDb } from "@/db";
import { sha256 } from "../auth";
import type { InboundMessage } from "../channels/types";
import type { Ctx } from "../context";
import { appendMessage, createConversation, findConversationByIdentity } from "../services/conversations";
import { createAnonymousCustomer, createCustomer, touchCustomer } from "../services/customers";
import { onCustomerMessage, runAgentTurn, type AgentTurnResult } from "./agent";
import type { ModelProvider } from "./providers/types";
import type { ReplyStreamSink } from "./reply-stream";

export const identityHash = (channel: string, identity: string) => sha256(`${channel}:${identity}`);

export type InboundResult = {
  conversationId: string;
  customerId: string;
  reply: string | null;
  aiActive: boolean;
  turn: AgentTurnResult | null;
};

export async function handleInbound(
  msg: InboundMessage,
  opts: { now?: Date; provider?: ModelProvider; onEvent?: ReplyStreamSink } = {},
): Promise<InboundResult> {
  const text = msg.text.trim().slice(0, 2000);
  const ctx: Ctx = { businessId: msg.businessId, actor: { type: "customer", customerId: null, name: msg.contact?.name ?? "Customer" } };
  const hash = identityHash(msg.channel, msg.identity);

  let conversation = await findConversationByIdentity(ctx, msg.channel, hash);
  if (!conversation) {
    const customer =
      msg.contact?.email || msg.contact?.phone
        ? (await createCustomer(ctx, { ...msg.contact, source: msg.channel })).customer
        : await createAnonymousCustomer(ctx, msg.channel);
    conversation = await createConversation(ctx, { customerId: customer.id, channel: msg.channel, channelIdentityHash: hash });
  }
  const customerCtx: Ctx = { ...ctx, actor: { ...ctx.actor, customerId: conversation.customerId } as Ctx["actor"] };

  await appendMessage(customerCtx, { conversationId: conversation.id, role: "customer", content: text });
  await touchCustomer(customerCtx, conversation.customerId);
  const { optedOut } = await onCustomerMessage(customerCtx, conversation.customerId, text);

  if (optedOut) {
    const reply = "You've been unsubscribed and won't receive further messages from us. You can still message here any time.";
    await appendMessage(customerCtx, { conversationId: conversation.id, role: "ai", content: reply, metadata: { provider: "safety" } });
    return { conversationId: conversation.id, customerId: conversation.customerId, reply, aiActive: conversation.owner === "ai", turn: null };
  }

  if (conversation.owner !== "ai") {
    // A human owns this conversation — the message waits in the inbox.
    return { conversationId: conversation.id, customerId: conversation.customerId, reply: null, aiActive: false, turn: null };
  }

  const turn = await runAgentTurn(msg.businessId, conversation.id, opts);
  const fresh = await rootDb.query.conversations.findFirst({ where: (c, { eq }) => eq(c.id, conversation!.id) });
  return {
    conversationId: conversation.id,
    customerId: fresh?.customerId ?? conversation.customerId,
    reply: turn.reply,
    aiActive: fresh?.owner === "ai",
    turn,
  };
}
