import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiActions, appointments, auditLogs } from "@/db/schema";
import { runAgentTurn } from "@/server/ai/agent";
import { handleInbound } from "@/server/ai/orchestrator";
import type { ModelProvider } from "@/server/ai/providers/types";
import { TOOLS } from "@/server/ai/tools/definitions";
import { allowedTools } from "@/server/ai/tools/registry";
import { getAiSettings } from "@/server/services/business";
import { createClinic, setPermissions, tomorrowAt, visitor } from "./helpers";

/** A provider that blindly tries one tool call — simulating a model that ignores its tool list. */
const forcing = (tool: string, input: Record<string, unknown>): ModelProvider => ({
  id: "forcing",
  label: "forcing",
  isConfigured: () => true,
  async run(i) {
    const offered = i.tools.map((t) => t.name);
    const r = await i.execute(tool, input);
    return { text: JSON.stringify({ offered, result: r }), stopReason: "end_turn", model: "forcing" };
  },
});

describe("AI tool permissions", () => {
  it("disabled actions are neither offered nor executable, and attempts are logged", async () => {
    const c = await createClinic();
    await setPermissions(c.business.id, { book_appointments: false });
    const settings = await getAiSettings(c.ctx);
    expect(allowedTools(TOOLS, settings).map((t) => t.name)).not.toContain("book_appointment");

    const conv = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "Hi" });
    const turn = await runAgentTurn(c.business.id, conv.conversationId, {
      provider: forcing("book_appointment", { service: "Teeth whitening", start_time: tomorrowAt("14:00"), customer_name: "Mallory", customer_phone: "+971500001234" }),
    });
    const parsed = JSON.parse(turn.reply!);
    expect(parsed.offered).not.toContain("book_appointment");
    expect(parsed.result).toMatchObject({ ok: false, denied: true });

    const appts = await db.select().from(appointments).where(eq(appointments.businessId, c.business.id));
    expect(appts).toHaveLength(0);
    const [denied] = await db.select().from(aiActions).where(and(eq(aiActions.conversationId, conv.conversationId), eq(aiActions.status, "denied")));
    expect(denied?.tool).toBe("book_appointment");
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.businessId, c.business.id), eq(auditLogs.action, "ai.action_denied")));
    expect(log?.actorType).toBe("ai");
  });

  it("refunds and price changes are never available to the AI, even if switched on", async () => {
    const c = await createClinic();
    await setPermissions(c.business.id, { issue_refunds: true, change_prices: true });
    const names = TOOLS.map((t) => t.name);
    expect(names.some((n) => /refund|price/.test(n))).toBe(false);
  });

  it("escalate_to_human can never be disabled", async () => {
    const c = await createClinic();
    await setPermissions(c.business.id, {
      answer_faqs: false, capture_leads: false, book_appointments: false, reschedule_appointments: false,
      cancel_appointments: false, send_messages: false, create_follow_ups: false, request_reviews: false, update_customers: false,
    });
    const settings = await getAiSettings(c.ctx);
    expect(allowedTools(TOOLS, settings).map((t) => t.name)).toEqual(["escalate_to_human"]);
  });

  it("the rules engine tells the customer honestly when booking is not allowed", async () => {
    const c = await createClinic();
    await setPermissions(c.business.id, { book_appointments: false, reschedule_appointments: false });
    const id = visitor();
    await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "How much is teeth whitening?" });
    const r = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "Can I come tomorrow?" });
    expect(r.reply).toMatch(/not able to book/i);
    expect(r.reply).not.toMatch(/booked/i);
  });

  it("answers honestly when information is not available", async () => {
    const c = await createClinic();
    const r = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "Do you offer gold-plated crowns for pets?" });
    expect(r.reply).toMatch(/don't have that information/i);
  });
});
