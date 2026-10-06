import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, messages, notifications } from "@/db/schema";
import { handleInbound } from "@/server/ai/orchestrator";
import type { Ctx } from "@/server/context";
import { getConversation, listConversations, returnToAi, sendHumanReply, takeOver } from "@/server/services/conversations";
import { createClinic, visitor } from "./helpers";

const aiMessages = async (conversationId: string) =>
  (await db.select().from(messages).where(and(eq(messages.conversationId, conversationId), eq(messages.role, "ai")))).length;

describe("human handoff", () => {
  for (const phrase of ["I want to speak to someone.", "Can someone call me?", "This isn't helping.", "can i talk to a real person please"]) {
    it(`hands off on: "${phrase}"`, async () => {
      const c = await createClinic();
      const r = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: phrase });
      expect(r.aiActive).toBe(false);
      const conv = await getConversation(c.ctx, r.conversationId);
      expect(conv.owner).toBe("human");
      expect(conv.status).toBe("waiting");
      expect(conv.handoffRequestedAt).toBeTruthy();
    });
  }

  it("shows HUMAN REQUIRED, silences the AI until a human returns control", async () => {
    const c = await createClinic();
    const id = visitor();
    const first = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "Can I speak to someone?" });
    const convId = first.conversationId;
    expect(first.reply).toMatch(/someone will reply/i);

    const needs = await listConversations(c.ctx, { status: "needs_human" });
    expect(needs.map((n) => n.conversation.id)).toContain(convId);
    expect(needs.find((n) => n.conversation.id === convId)?.needsHuman).toBe(true);
    const [notif] = await db.select().from(notifications).where(eq(notifications.businessId, c.business.id));
    expect(notif?.title).toMatch(/Human required/);
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.businessId, c.business.id), eq(auditLogs.action, "conversation.handoff_requested")));
    expect(log?.actorType).toBe("ai");

    // While waiting for a human, customer messages get no AI reply.
    const before = await aiMessages(convId);
    const waiting = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "How much is whitening?" });
    expect(waiting.reply).toBeNull();
    expect(await aiMessages(convId)).toBe(before);

    // Employee takes over and replies.
    const staffCtx: Ctx = c.ctx;
    await takeOver(staffCtx, convId);
    expect((await getConversation(c.ctx, convId)).status).toBe("human_handling");
    const sent = await sendHumanReply(staffCtx, convId, "Hi, this is Olivia — whitening is AED 650.");
    expect(sent.delivery.status).toBe("posted_to_chat");
    const still = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "Thanks!" });
    expect(still.reply).toBeNull();
    expect(await aiMessages(convId)).toBe(before);

    // Control returned to the AI → it answers again.
    await returnToAi(staffCtx, convId);
    const back = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "How much is teeth whitening?" });
    expect(back.reply).toMatch(/AED 650/);
    const actions = (await db.select().from(auditLogs).where(eq(auditLogs.entityId, convId))).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["conversation.handoff_requested", "conversation.taken_over", "conversation.returned_to_ai"]));
  });

  it("a human replying to an AI conversation takes it over automatically", async () => {
    const c = await createClinic();
    const id = visitor();
    const r = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "Hello" });
    await sendHumanReply(c.ctx, r.conversationId, "Hi! Olivia here.");
    expect((await getConversation(c.ctx, r.conversationId)).owner).toBe("human");
    expect((await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: id, text: "Hi Olivia" })).reply).toBeNull();
  });

  it("escalates clinical questions and emergencies at medical businesses", async () => {
    const c = await createClinic();
    const clinical = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "My gum is swollen, should I take antibiotics?" });
    expect(clinical.reply).toMatch(/not able to give medical advice/i);
    expect(clinical.aiActive).toBe(false);
    const emergency = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "I have severe swelling in my face and can't breathe" });
    expect(emergency.reply).toMatch(/emergency/i);
    expect(emergency.aiActive).toBe(false);
  });
});
