"use server";
import { revalidatePath } from "next/cache";
import type { AiPermissions } from "@/db/schema";
import { num, optStr, run, str, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/session";
import { updateAgent, updateAiPermissions, updateBookingRules, updateWidget } from "@/server/services/ai-config";

const refresh = () => revalidatePath("/app/receptionist");

export async function setActiveAction(active: boolean): Promise<ActionResult> {
  const { ctx } = await requirePermission("business.manage");
  const r = await run(() => updateAgent(ctx, { active }));
  refresh();
  return r as ActionResult;
}

export async function personalityAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { ctx } = await requirePermission("business.manage");
  const r = await run(
    () =>
      updateAgent(ctx, {
        name: str(fd, "name"),
        tone: str(fd, "tone"),
        formality: num(fd, "formality") ?? 50,
        warmth: num(fd, "warmth") ?? 60,
        emojiUsage: str(fd, "emojiUsage"),
        greeting: optStr(fd, "greeting"),
        languages: fd.getAll("languages").map(String),
        brandPersonality: optStr(fd, "brandPersonality"),
        customInstructions: optStr(fd, "customInstructions"),
      }),
    "Personality saved. New replies use it immediately.",
  );
  refresh();
  return r as ActionResult;
}

export async function permissionAction(key: keyof AiPermissions, value: boolean): Promise<ActionResult> {
  const { ctx } = await requirePermission("business.manage");
  const r = await run(() => updateAiPermissions(ctx, { [key]: value }));
  refresh();
  return r as ActionResult;
}

export async function bookingRulesAction(requireName: boolean, requireContact: boolean): Promise<ActionResult> {
  const { ctx } = await requirePermission("business.manage");
  const r = await run(() => updateBookingRules(ctx, { requireName, requireContact }));
  refresh();
  return r as ActionResult;
}

export async function widgetAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const { ctx } = await requirePermission("business.manage");
  const r = await run(
    () =>
      updateWidget(ctx, {
        title: str(fd, "title"),
        accentColor: str(fd, "accentColor"),
        position: str(fd, "position") === "left" ? "left" : "right",
        logoUrl: optStr(fd, "logoUrl"),
        greeting: optStr(fd, "greeting"),
      }),
    "Widget saved.",
  );
  refresh();
  return r as ActionResult;
}
