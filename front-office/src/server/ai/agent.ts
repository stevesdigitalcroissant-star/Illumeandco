/**
 * The AI receptionist agent — one turn.
 *
 *   customer message
 *     → safety pre-check (human request, emergency, clinical, refund…)
 *     → context: business rules + customer memory + upcoming appointments
 *     → provider reasons and requests tools
 *     → tool layer checks permissions, performs real actions, logs them
 *     → claim guard verifies the reply against what actually happened
 *     → reply persisted; lead + follow-up bookkeeping
 *
 * The agent never responds while a human owns the conversation.
 */
import { and, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { conversations, leads, messages } from "@/db/schema";
import type { Ctx } from "../context";
import { dbOf } from "../context";
import { upcomingForCustomer } from "../services/appointments";
import { getAgent, getAiSettings, getBusiness } from "../services/business";
import { appendMessage, getConversation } from "../services/conversations";
import { getCustomer, updateCustomer } from "../services/customers";
import { autoScheduleFollowUp, cancelPendingFollowUps } from "../services/followups";
import { latestLeadForCustomer, upsertLead } from "../services/leads";
import { aiActions } from "@/db/schema";
import { isAllowed } from "./permissions";
import { buildDynamicContext, buildStablePrompt } from "./prompt";
import { createAnthropicProvider } from "./providers/anthropic";
import { createRulesProvider } from "./providers/rules";
import type { HistoryTurn, ModelProvider } from "./providers/types";
import { findUnsupportedClaim, preCheck, UNSUPPORTED_CLAIM_REPLY } from "./safety";
import { TOOLS } from "./tools/definitions";
import { allowedTools, executeTool, toolSpecs, type AgentState, type ToolContext } from "./tools/registry";

export function defaultProvider(): ModelProvider {
  const anthropic = createAnthropicProvider();
  return anthropic.isConfigured() ? anthropic : createRulesProvider();
}

export function activeEngineInfo() {
  const p = defaultProvider();
  return { id: p.id, label: p.label, model: p.id === "anthropic" ? process.env.AI_MODEL || "claude-opus-5-5" : null };
}

export type AgentTurnResult = {
  reply: string | null;
  handedOff: boolean;
  provider: string;
  toolCalls: { tool: string; ok: boolean }[];
};

const HANDOFF_ACK = "I've let the team know, and someone will reply to you here as soon as possible.";
const ERROR_REPLY = "Sorry, I'm having trouble right now. I've asked a member of the team to reply to you here.";

export async function runAgentTurn(
  businessId: string,
  conversationId: string,
  opts: { now?: Date; provider?: ModelProvider } = {},
): Promise<AgentTurnResult> {
  const now = opts.now ?? new Date();
  const agentRow = await getAgent({ businessId, actor: { type: "system", name: "AI" } });
  const ctx: Ctx = { businessId, actor: { type: "ai", agentId: agentRow.id, name: `${agentRow.name} (AI Receptionist)` } };

  const conversation = await getConversation(ctx, conversationId);
  // Hard stop: once a human owns the conversation, the AI stays silent.
  if (conversation.owner !== "ai") return { reply: null, handedOff: false, provider: "none", toolCalls: [] };

  const [business, settings, customer] = await Promise.all([getBusiness(ctx), getAiSettings(ctx), getCustomer(ctx, conversation.customerId)]);
  const history = await dbOf(ctx)
    .select()
    .from(messages)
    .where(and(eq(messages.businessId, businessId), eq(messages.conversationId, conversationId)))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(40);
  history.reverse();
  const lastCustomer = [...history].reverse().find((m) => m.role === "customer");

  const tc: ToolContext = {
    ctx,
    conversationId,
    customerId: customer.id,
    channel: conversation.channel,
    business,
    settings,
    agentId: agentRow.id,
    now,
    state: { ...(conversation.agentState as AgentState) },
    events: [],
    handedOff: false,
  };
  const execute = (name: string, input: unknown) => executeTool(TOOLS, tc, name, input);

  let reply: string;
  let providerId = "safety";

  if (!agentRow.active) {
    // AI switched off by the owner: route to the team without pretending.
    await execute("escalate_to_human", { reason: "AI receptionist is turned off" });
    reply = HANDOFF_ACK;
  } else {
    const check = lastCustomer ? preCheck(lastCustomer.content, business.type) : { kind: "none" as const };
    if (check.kind === "handoff") {
      await execute("escalate_to_human", { reason: check.reason });
      reply = check.reply;
    } else {
      const provider = opts.provider ?? defaultProvider();
      providerId = provider.id;
      const turns: HistoryTurn[] = [];
      for (const m of history) {
        if (m.role === "system") continue;
        const role = m.role === "customer" ? "user" : "assistant";
        const text = m.role === "human" ? `[Team member reply] ${m.content}` : m.content;
        const last = turns.at(-1);
        if (last && last.role === role) last.text += `\n${text}`;
        else turns.push({ role, text });
      }
      const upcoming = await upcomingForCustomer(ctx, customer.id, now);
      const [lead] = await dbOf(ctx)
        .select({ status: leads.status })
        .from(leads)
        .where(and(eq(leads.businessId, businessId), eq(leads.customerId, customer.id)))
        .orderBy(desc(leads.createdAt))
        .limit(1);
      const events = history.filter((m) => m.role === "system").slice(-6).map((m) => m.content);
      try {
        const out = await provider.run({
          system: {
            stable: buildStablePrompt(business, agentRow, settings),
            dynamic: buildDynamicContext({
              business,
              channel: conversation.channel,
              now,
              customer,
              upcoming: upcoming.map((u) => ({
                id: u.appointment.id,
                service: u.service.name,
                when: DateTime.fromJSDate(u.appointment.startsAt).setZone(business.timezone).toFormat("ccc d LLL, h:mm a"),
              })),
              leadStatus: lead?.status ?? null,
              events,
            }),
          },
          history: turns,
          tools: toolSpecs(allowedTools(TOOLS, settings)),
          execute,
          toolContext: tc,
        });
        if (out.stopReason === "refusal" || (!out.text && !tc.handedOff)) {
          if (!tc.handedOff) await execute("escalate_to_human", { reason: out.stopReason === "refusal" ? "AI declined to answer" : "AI could not produce a reply" });
          reply = HANDOFF_ACK;
        } else {
          reply = out.text || HANDOFF_ACK;
        }
      } catch (e) {
        console.error("[agent] provider failed", e);
        if (!tc.handedOff) await execute("escalate_to_human", { reason: "AI engine error" });
        reply = ERROR_REPLY;
      }

      // Claim guard: the reply may only describe actions that actually succeeded.
      const unsupported = findUnsupportedClaim(reply, tc.events);
      if (unsupported) {
        await dbOf(ctx).insert(aiActions).values({
          businessId,
          conversationId,
          agentId: agentRow.id,
          tool: "claim_guard",
          input: { reply },
          output: { blocked: unsupported },
          status: "denied",
        });
        reply = UNSUPPORTED_CLAIM_REPLY;
      }
    }
  }

  await appendMessage(ctx, {
    conversationId,
    role: "ai",
    content: reply,
    deliveryStatus: conversation.channel === "web_chat" ? "posted_to_chat" : null,
    metadata: { provider: providerId, tools: tc.events.map((e) => ({ tool: e.tool, ok: e.ok })) },
  });

  // Persist working memory (only the current conversation's).
  await dbOf(ctx).update(conversations).set({ agentState: tc.state }).where(eq(conversations.id, conversationId));

  // Every interested visitor becomes a lead, even if the model forgot to call create_lead.
  // (Only when the customer has no lead in the active pipeline — a booked lead is not duplicated.)
  if (!tc.handedOff && tc.state.lastServiceId && isAllowed(settings.permissions, "capture_leads")) {
    const active = await latestLeadForCustomer(ctx, tc.customerId);
    if (!active || active.status !== "appointment_booked")
      await upsertLead(ctx, { customerId: tc.customerId, source: conversation.channel, conversationId, serviceId: tc.state.lastServiceId }).catch(() => null);
  }
  if (!tc.handedOff && isAllowed(settings.permissions, "create_follow_ups")) await autoScheduleFollowUp(ctx, tc.customerId, conversationId).catch(() => null);

  return { reply, handedOff: tc.handedOff, provider: providerId, toolCalls: tc.events.map((e) => ({ tool: e.tool, ok: e.ok })) };
}

/** Customer replied → pending follow-ups stop. Opt-out → customer flagged, follow-ups stop. */
export async function onCustomerMessage(ctx: Ctx, customerId: string, text: string) {
  await cancelPendingFollowUps(ctx, customerId, "Customer replied");
  if (preCheck(text, "other").kind === "opt_out") {
    await updateCustomer(ctx, customerId, { optedOut: true });
    await cancelPendingFollowUps(ctx, customerId, "Customer opted out");
    return { optedOut: true };
  }
  return { optedOut: false };
}

