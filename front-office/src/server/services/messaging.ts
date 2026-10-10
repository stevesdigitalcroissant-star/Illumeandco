/** Proactive outbound messages (follow-ups, reminders, review requests). */
import { and, desc, eq } from "drizzle-orm";
import { identityHash } from "../channels/identity";
import { conversations, customers } from "@/db/schema";
import { channelsFor, getChannel, PROACTIVE_ORDER } from "../channels/registry";
import type { ChannelKind, DeliveryResult } from "../channels/types";
import { dbOf, notFound, type Ctx } from "../context";
import { getAiSettings, getBusiness } from "./business";
import type { WhatsappPurpose } from "@/db/schema";
import { appendMessage, createConversation } from "./conversations";
import { automatedTextAllowed, notifyLimitReached } from "./allowance";
import { spendCredit } from "./credits";
import { hasFeature } from "./plan-limits";

export { renderTemplate } from "@/lib/templates";

/** The business's approved WhatsApp template for this kind of message, with its variables filled in. */
async function whatsappTemplateFor(ctx: Ctx, purpose: WhatsappPurpose, vars: Record<string, string | null | undefined>) {
  const t = (await getAiSettings(ctx)).whatsappTemplates[purpose];
  if (!t) return null;
  // WhatsApp rejects empty variables, so fall back to a neutral word rather than send a broken template.
  return { contentSid: t.contentSid, variables: Object.fromEntries(t.variables.map((name, i) => [String(i + 1), vars[name]?.trim() || "there"])) };
}

export type ProactiveDelivery = DeliveryResult & { channel: ChannelKind | null; conversationId: string | null; messageId: string | null };

/**
 * Deliver a message to a customer through the best available channel:
 * a configured direct channel (WhatsApp → SMS → email) the customer can be
 * reached on, else their website chat thread. Never claims delivery that did
 * not happen — the result says exactly what occurred.
 */
export async function deliverToCustomer(
  ctx: Ctx,
  input: {
    customerId: string;
    text: string;
    subject?: string;
    role?: "ai" | "system" | "human";
    metadata?: Record<string, unknown>;
    /** What this message is, so WhatsApp can use the business's approved template outside the 24h window. */
    whatsapp?: { purpose: WhatsappPurpose; vars: Record<string, string | null | undefined> };
  },
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

  const available = channelsFor(business);
  const skipped: string[] = [];
  const waConv = existing.find((c) => c.channel === "whatsapp");
  const sessionOpen = Boolean(waConv?.lastCustomerMessageAt && Date.now() - waConv.lastCustomerMessageAt.getTime() < 24 * 3600_000);
  const template = input.whatsapp ? await whatsappTemplateFor(ctx, input.whatsapp.purpose, input.whatsapp.vars) : null;
  // Automated texts count against the plan's monthly allowance (a team member's own message never does).
  let textsOk: boolean | null = input.role === "human" ? true : null;
  let textViaCredits = false;
  for (const kind of PROACTIVE_ORDER) {
    const adapter = getChannel(kind);
    const sender = available.get(kind);
    if (!sender || !adapter.canReach(to)) continue;
    if (kind === "whatsapp" && !(await hasFeature(ctx, "whatsapp"))) {
      skipped.push(`${adapter.label}: Not included in your plan`);
      continue;
    }
    if (kind === "sms" || kind === "whatsapp") {
      if (textsOk === null) {
        const check = await automatedTextAllowed(ctx);
        textsOk = check.ok;
        textViaCredits = check.ok && "viaCredits" in check && Boolean(check.viaCredits);
        if (!check.ok) await notifyLimitReached(ctx, "texts", check.allowance);
      }
      if (!textsOk) {
        skipped.push(`${adapter.label}: Monthly text allowance reached`);
        continue;
      }
    }
    const result = await adapter.send({ businessId: ctx.businessId, businessName: business.name, to, text: input.text, subject: input.subject, from: sender.from, sessionOpen, template });
    if (!result.ok) {
      skipped.push(`${adapter.label}: ${result.detail}`);
      continue;
    }
    // SMS/WhatsApp threads are keyed by phone number, so the customer's reply lands in this same conversation.
    const hash = (kind === "sms" || kind === "whatsapp") && customer.phone ? identityHash(kind, customer.phone) : null;
    let conv = existing.find((c) => c.channel === kind) ?? (await createConversation(ctx, { customerId: customer.id, channel: kind, channelIdentityHash: hash }));
    if (hash && !conv.channelIdentityHash)
      conv = (await dbOf(ctx).update(conversations).set({ channelIdentityHash: hash }).where(eq(conversations.id, conv.id)).returning())[0] ?? conv;
    const m = await appendMessage(ctx, {
      conversationId: conv.id,
      role: input.role ?? "ai",
      content: input.text,
      deliveryStatus: result.status,
      metadata: { proactive: true, ...input.metadata },
    });
    if (textViaCredits && (kind === "sms" || kind === "whatsapp")) await spendCredit(ctx, "texts", `message:${m.id}`).catch((e) => console.error("[credits] text credit not recorded", e));
    return { ...result, channel: kind, conversationId: conv.id, messageId: m.id, detail: skipped.length ? `Fell back to ${adapter.label} (${skipped.join("; ")})` : result.detail };
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
    detail: skipped.length
      ? `Not delivered — ${skipped.join("; ")}`
      : "No configured channel can reach this customer (connect WhatsApp, SMS or email, or the customer must have a chat thread).",
    channel: null,
    conversationId: null,
    messageId: null,
  };
}
