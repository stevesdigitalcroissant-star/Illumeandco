/**
 * Claude via the Anthropic SDK — manual tool-use loop.
 *
 * History handling is append-only within a turn (response.content is passed
 * back verbatim, system and tools frozen), and earlier turns are replayed as
 * plain text without thinking blocks, so preserved-thinking checks never see
 * an edited prefix.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ModelProvider, ProviderInput, ProviderOutput } from "./types";

const DEFAULT_MODEL = "claude-opus-5-5";

export function createAnthropicProvider(client?: Pick<Anthropic, "beta">): ModelProvider {
  let lazy: Pick<Anthropic, "beta"> | null = client ?? null;
  const getClient = () => (lazy ??= new Anthropic());
  const model = () => process.env.AI_MODEL || DEFAULT_MODEL;

  return {
    id: "anthropic",
    label: "Claude (Anthropic)",
    isConfigured: () => Boolean(client) || Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
    async run(input: ProviderInput): Promise<ProviderOutput> {
      const maxSteps = input.maxSteps ?? 8;
      const messages: Anthropic.Beta.BetaMessageParam[] = [];
      // The API requires the first message to be from the user.
      if (input.history[0]?.role === "assistant") messages.push({ role: "user", content: "(The customer opened the conversation.)" });
      for (const turn of input.history) messages.push({ role: turn.role, content: turn.text });

      const tools: Anthropic.Beta.BetaToolUnion[] = input.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema,
      }));
      const system: Anthropic.Beta.BetaTextBlockParam[] = [
        { type: "text", text: input.system.stable, cache_control: { type: "ephemeral" } },
        { type: "text", text: input.system.dynamic },
      ];
      const useFallbacks = process.env.AI_FALLBACKS !== "off";
      const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

      for (let step = 0; step < maxSteps; step++) {
        const response = await getClient().beta.messages.create({
          model: model(),
          max_tokens: 16000,
          system,
          tools,
          messages,
          output_config: { effort: (process.env.AI_EFFORT as "low" | "medium" | "high") || "medium" },
          ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        });
        usage.inputTokens += response.usage.input_tokens;
        usage.outputTokens += response.usage.output_tokens;
        usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;

        // A declined request has no usable content — check before reading it.
        if (response.stop_reason === "refusal") return { text: "", stopReason: "refusal", model: response.model, usage };

        messages.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
        const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");

        if (response.stop_reason !== "tool_use" || !toolUses.length) {
          const text = response.content
            .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
            .map((b) => b.text)
            .join("\n")
            .trim();
          return { text, stopReason: response.stop_reason ?? "end_turn", model: response.model, usage };
        }

        // Run tools sequentially (bookings have side effects) and return all results in one message.
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const use of toolUses) {
          const r = await input.execute(use.name, use.input);
          results.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify(r.ok ? r.data : { error: r.error }),
            ...(r.ok ? {} : { is_error: true }),
          });
        }
        messages.push({ role: "user", content: results });
      }
      return { text: "", stopReason: "max_steps", model: model(), usage };
    },
  };
}
