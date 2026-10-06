import type { ToolContext, ToolResult } from "../tools/registry";

export type HistoryTurn = { role: "user" | "assistant"; text: string };

export type ToolSpec = { name: string; description: string; input_schema: { type: "object"; [k: string]: unknown } };

export type ProviderInput = {
  system: { stable: string; dynamic: string };
  /** Conversation so far, oldest first, ending with the customer's latest message. */
  history: HistoryTurn[];
  tools: ToolSpec[];
  execute: (name: string, input: unknown) => Promise<ToolResult>;
  /** Live view of the turn (state, events, handoff flag). */
  toolContext: ToolContext;
  maxSteps?: number;
  /**
   * Optional live output. Providers that can stream call onText with text as
   * it is generated, and onStepReset when text already sent is not part of the
   * reply (interim text before tool calls, or a partial declined mid-stream).
   */
  stream?: { onText(delta: string): void; onStepReset(): void };
};

export type ProviderOutput = {
  text: string;
  stopReason: "end_turn" | "max_steps" | "refusal" | "handed_off" | string;
  model: string;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number };
};

/**
 * A reasoning engine. Implementations decide *what* to do; the tool layer
 * (permissions, validation, logging) decides whether it happens.
 */
export interface ModelProvider {
  id: string;
  label: string;
  isConfigured(): boolean;
  run(input: ProviderInput): Promise<ProviderOutput>;
}
