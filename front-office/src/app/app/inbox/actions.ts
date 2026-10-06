"use server";
import { revalidatePath } from "next/cache";
import { run, type ActionResult } from "@/lib/action";
import { requireBusiness } from "@/lib/session";
import { assignConversation, resolveConversation, returnToAi, sendHumanReply, takeOver } from "@/server/services/conversations";

const done = (_id: string) => revalidatePath("/app/inbox");

export async function takeOverAction(conversationId: string): Promise<ActionResult> {
  const { ctx } = await requireBusiness();
  const r = await run(() => takeOver(ctx, conversationId), "You're now handling this conversation. The AI is paused.");
  done(conversationId);
  return r as ActionResult;
}

export async function returnToAiAction(conversationId: string): Promise<ActionResult> {
  const { ctx } = await requireBusiness();
  const r = await run(() => returnToAi(ctx, conversationId), "The AI receptionist is handling this conversation again.");
  done(conversationId);
  return r as ActionResult;
}

export async function resolveAction(conversationId: string): Promise<ActionResult> {
  const { ctx } = await requireBusiness();
  const r = await run(() => resolveConversation(ctx, conversationId), "Marked as resolved.");
  done(conversationId);
  return r as ActionResult;
}

export async function assignToMeAction(conversationId: string): Promise<ActionResult> {
  const { ctx, user } = await requireBusiness();
  const r = await run(() => assignConversation(ctx, conversationId, user.id), "Assigned to you.");
  done(conversationId);
  return r as ActionResult;
}

export async function replyAction(conversationId: string, text: string): Promise<ActionResult<{ delivery: string; detail?: string }>> {
  const { ctx } = await requireBusiness();
  const r = await run(async () => {
    const { delivery } = await sendHumanReply(ctx, conversationId, text);
    return { delivery: delivery.status, detail: delivery.ok ? undefined : delivery.detail };
  });
  done(conversationId);
  return r;
}
