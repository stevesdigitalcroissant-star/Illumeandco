/** AI receptionist configuration: identity/personality, permissions, booking rules, widget. */
import { and, eq } from "drizzle-orm";
import { aiAgents, aiSettings, type AiPermissions, type BookingRules, type WidgetConfig } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, type Ctx } from "../context";
import { AI_PERMISSION_LABELS, type AiPermissionKey } from "../ai/permissions";
import { getAiSettings } from "./business";

export type AgentPatch = Partial<
  Pick<typeof aiAgents.$inferInsert, "name" | "tone" | "formality" | "warmth" | "emojiUsage" | "greeting" | "languages" | "brandPersonality" | "customInstructions" | "active">
>;

const TONES = ["friendly", "professional", "warm", "calm", "upbeat", "luxurious"];

export async function updateAgent(ctx: Ctx, patch: AgentPatch) {
  assertCan(ctx, "business.manage");
  if (patch.name !== undefined && !patch.name.trim()) throw invalid("The receptionist needs a name.");
  if (patch.tone !== undefined && !TONES.includes(patch.tone)) throw invalid("Unknown tone.");
  for (const k of ["formality", "warmth"] as const)
    if (patch[k] !== undefined && (patch[k]! < 0 || patch[k]! > 100)) throw invalid(`${k} must be 0–100.`);
  if (patch.emojiUsage !== undefined && !["none", "light", "frequent"].includes(patch.emojiUsage)) throw invalid("Unknown emoji setting.");
  if (patch.languages !== undefined) {
    patch.languages = patch.languages.map((l) => l.trim().toLowerCase()).filter(Boolean).slice(0, 8);
    if (!patch.languages.length) throw invalid("Choose at least one language.");
  }
  for (const k of ["greeting", "brandPersonality", "customInstructions"] as const)
    if (typeof patch[k] === "string" && patch[k]!.length > 2000) throw invalid("That text is too long.");
  await dbOf(ctx)
    .update(aiAgents)
    .set(patch)
    .where(and(eq(aiAgents.businessId, ctx.businessId), eq(aiAgents.kind, "receptionist")));
  await audit(ctx, {
    action: "ai.settings_updated",
    summary:
      patch.active === false
        ? "AI receptionist turned off — new conversations go to the team"
        : patch.active === true
          ? "AI receptionist turned on"
          : `AI receptionist personality updated (${Object.keys(patch).join(", ")})`,
    entityType: "ai_agent",
  });
}

export async function updateAiPermissions(ctx: Ctx, patch: Partial<AiPermissions>) {
  assertCan(ctx, "business.manage");
  const current = await getAiSettings(ctx);
  const next = { ...current.permissions };
  const changes: string[] = [];
  for (const [k, v] of Object.entries(patch) as [AiPermissionKey, boolean][]) {
    if (!(k in AI_PERMISSION_LABELS)) continue;
    // Refunds and price changes are never available to the AI.
    const value = AI_PERMISSION_LABELS[k].implemented ? Boolean(v) : false;
    if (next[k] !== value) changes.push(`${AI_PERMISSION_LABELS[k].label}: ${value ? "on" : "off"}`);
    next[k] = value;
  }
  await dbOf(ctx).update(aiSettings).set({ permissions: next }).where(eq(aiSettings.businessId, ctx.businessId));
  if (changes.length)
    await audit(ctx, { action: "ai.settings_updated", summary: `AI permissions changed — ${changes.join(", ")}`, entityType: "ai_settings", details: { changes } });
  return next;
}

export async function updateBookingRules(ctx: Ctx, rules: BookingRules) {
  assertCan(ctx, "business.manage");
  await dbOf(ctx).update(aiSettings).set({ booking: { requireName: !!rules.requireName, requireContact: !!rules.requireContact } }).where(eq(aiSettings.businessId, ctx.businessId));
  await audit(ctx, { action: "ai.settings_updated", summary: `Booking requirements updated (name: ${rules.requireName ? "required" : "optional"}, contact: ${rules.requireContact ? "required" : "optional"})`, entityType: "ai_settings" });
}

export async function updateWidget(ctx: Ctx, patch: Partial<WidgetConfig>) {
  assertCan(ctx, "business.manage");
  const current = await getAiSettings(ctx);
  const next = { ...current.widget, ...patch };
  if (!/^#[0-9a-f]{6}$/i.test(next.accentColor)) throw invalid("Accent colour must be a hex colour like #0f766e.");
  if (!["left", "right"].includes(next.position)) throw invalid("Position must be left or right.");
  if (next.logoUrl && !/^https:\/\/\S+$/i.test(next.logoUrl)) throw invalid("Logo URL must start with https://");
  if (!next.title.trim()) throw invalid("Widget title is required.");
  next.title = next.title.slice(0, 60);
  next.greeting = next.greeting?.slice(0, 300) || null;
  await dbOf(ctx).update(aiSettings).set({ widget: next }).where(eq(aiSettings.businessId, ctx.businessId));
  await audit(ctx, { action: "ai.settings_updated", summary: "Website chat widget updated", entityType: "ai_settings" });
  return next;
}
