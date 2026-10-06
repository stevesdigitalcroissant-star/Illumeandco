/**
 * Tool execution layer.
 *
 * The model (or the rules engine) only *requests* actions. Every request goes
 * through `executeTool`, which:
 *   1. checks the business's AI permissions (denied → logged, refused),
 *   2. validates input with the tool's schema,
 *   3. runs the real service-layer action,
 *   4. records the call in ai_actions (success / error / denied).
 * Tool results are the only source of truth the agent may report back.
 */
import { z } from "zod";
import type { aiSettings, businesses } from "@/db/schema";
import { aiActions } from "@/db/schema";
import { audit } from "../../audit";
import { AppError, dbOf, type Ctx } from "../../context";
import type { ChannelKind } from "../../channels/types";
import { isAllowed, type ToolPermission } from "../permissions";

export type AgentState = {
  lastServiceId?: string;
  lastDate?: string;
  offeredSlots?: { startsAt: string; label: string; staffId: string }[];
  pendingBooking?: { serviceId: string; startsAt: string; staffId?: string };
  pendingCancelId?: string;
  [k: string]: unknown;
};

/** Facts about what actually happened this turn — used by the claim guard. */
export type TurnEvent = { tool: string; ok: boolean; data?: unknown };

export type ToolContext = {
  ctx: Ctx;
  conversationId: string;
  customerId: string;
  channel: ChannelKind;
  business: typeof businesses.$inferSelect;
  settings: typeof aiSettings.$inferSelect;
  agentId: string;
  now: Date;
  state: AgentState;
  events: TurnEvent[];
  /** Set when the conversation has been handed to a human during this turn. */
  handedOff: boolean;
};

export type ToolDef<S extends z.ZodType = z.ZodType> = {
  name: string;
  description: string;
  permission: ToolPermission;
  input: S;
  run: (tc: ToolContext, input: z.infer<S>) => Promise<unknown>;
};

export function defineTool<S extends z.ZodType>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string; denied?: boolean };

export function toolSpecs(tools: ToolDef[]) {
  return tools.map((t) => {
    const schema = z.toJSONSchema(t.input, { target: "draft-7" }) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, description: t.description, input_schema: schema as { type: "object"; [k: string]: unknown } };
  });
}

export function allowedTools(all: ToolDef[], settings: ToolContext["settings"]) {
  return all.filter((t) => isAllowed(settings.permissions, t.permission));
}

export async function executeTool(all: ToolDef[], tc: ToolContext, name: string, rawInput: unknown): Promise<ToolResult> {
  const started = Date.now();
  const tool = all.find((t) => t.name === name);
  const log = async (status: "success" | "error" | "denied", output: unknown) => {
    await dbOf(tc.ctx).insert(aiActions).values({
      businessId: tc.ctx.businessId,
      conversationId: tc.conversationId,
      agentId: tc.agentId,
      tool: name,
      input: (rawInput && typeof rawInput === "object" ? rawInput : { value: rawInput }) as Record<string, unknown>,
      output: output as object,
      status,
      durationMs: Date.now() - started,
    });
  };

  if (!tool) {
    const res: ToolResult = { ok: false, error: `Unknown tool "${name}".` };
    await log("error", res);
    return res;
  }

  // Permission check at execution time — never rely on the tool list alone.
  if (!isAllowed(tc.settings.permissions, tool.permission)) {
    const res: ToolResult = {
      ok: false,
      denied: true,
      error: "This action is not enabled for the AI receptionist by the business. Do not attempt it; offer to connect the customer with the team instead.",
    };
    await log("denied", res);
    await audit(tc.ctx, {
      action: "ai.action_denied",
      summary: `AI attempted "${name}" but the business has not allowed it`,
      entityType: "conversation",
      entityId: tc.conversationId,
      details: { tool: name },
    });
    tc.events.push({ tool: name, ok: false });
    return res;
  }

  const parsed = tool.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    const res: ToolResult = { ok: false, error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}` };
    await log("error", res);
    tc.events.push({ tool: name, ok: false });
    return res;
  }

  try {
    const data = await tool.run(tc, parsed.data);
    const res: ToolResult = { ok: true, data };
    await log("success", data);
    tc.events.push({ tool: name, ok: true, data });
    return res;
  } catch (e) {
    const message = e instanceof AppError ? e.message : "Something went wrong performing that action.";
    if (!(e instanceof AppError)) console.error(`[tool ${name}]`, e);
    const res: ToolResult = { ok: false, error: message };
    await log("error", res);
    tc.events.push({ tool: name, ok: false, data: { error: message } });
    return res;
  }
}
