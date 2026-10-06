/** Website chat channel: visitor sessions and message access for the widget. */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { businesses, conversations, messages } from "@/db/schema";
import { randomToken } from "../auth";
import { identityHash } from "../ai/orchestrator";
import { getAgent, getAiSettings, getBusinessByPublicKey } from "../services/business";

export async function widgetBusiness(publicKey: string) {
  if (!/^pk_[a-f0-9]{24}$/.test(publicKey)) return null;
  return (await getBusinessByPublicKey(publicKey)) ?? null;
}

export async function widgetConfig(businessId: string) {
  const ctx = { businessId, actor: { type: "system" as const, name: "Widget" } };
  const [settings, agent, business] = await Promise.all([getAiSettings(ctx), getAgent(ctx), db.query.businesses.findFirst({ where: eq(businesses.id, businessId) })]);
  return {
    title: settings.widget.title,
    accentColor: settings.widget.accentColor,
    position: settings.widget.position,
    logoUrl: settings.widget.logoUrl,
    greeting: settings.widget.greeting || agent.greeting || `Hi! Welcome to ${business?.name ?? "us"}. How can I help you today?`,
    agentName: agent.name,
    aiActive: agent.active,
  };
}

/** Each visitor gets an unguessable token; only its hash is stored on the conversation. */
export const newVisitorToken = () => `v_${randomToken(24)}`;
export const isVisitorToken = (t: unknown): t is string => typeof t === "string" && /^v_[A-Za-z0-9_-]{30,40}$/.test(t);

/** Messages visible to the visitor (no internal timeline events). */
export async function visitorMessages(businessId: string, token: string, afterId?: string) {
  const conv = await db.query.conversations.findFirst({
    where: and(eq(conversations.businessId, businessId), eq(conversations.channel, "web_chat"), eq(conversations.channelIdentityHash, identityHash("web_chat", token))),
  });
  if (!conv) return { conversation: null, messages: [] };
  const rows = await db
    .select({ id: messages.id, role: messages.role, content: messages.content, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.conversationId, conv.id), inArray(messages.role, ["customer", "ai", "human"])))
    .orderBy(asc(messages.createdAt), asc(messages.id));
  const idx = afterId ? rows.findIndex((r) => r.id === afterId) : -1;
  return {
    conversation: { id: conv.id, humanOwned: conv.owner === "human" },
    messages: (idx >= 0 ? rows.slice(idx + 1) : rows).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}
