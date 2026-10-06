/**
 * The Claude provider against a mocked Anthropic client: verifies the tool
 * loop wiring, permission enforcement, refusal handling and the claim guard
 * without calling the real API.
 */
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments } from "@/db/schema";
import { runAgentTurn } from "@/server/ai/agent";
import { handleInbound } from "@/server/ai/orchestrator";
import { createAnthropicProvider } from "@/server/ai/providers/anthropic";
import type { ModelProvider } from "@/server/ai/providers/types";
import { createClinic, tomorrowAt, visitor } from "./helpers";

type Req = { messages: { role: string; content: unknown }[]; tools: { name: string }[]; system: { text: string }[] };

function mockClient(script: ((req: Req) => unknown)[]) {
  const requests: Req[] = [];
  let i = 0;
  const client = {
    beta: {
      messages: {
        create: async (req: Req) => {
          requests.push(structuredClone(req));
          const step = script[i++];
          if (!step) throw new Error("unexpected extra request");
          return step(req);
        },
      },
    },
  };
  return { client: client as unknown as Parameters<typeof createAnthropicProvider>[0], requests };
}

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 };
const toolUse = (id: string, name: string, input: unknown) => ({
  id: "msg",
  model: "claude-opus-5-5",
  stop_reason: "tool_use",
  usage,
  content: [{ type: "text", text: "Let me check." }, { type: "tool_use", id, name, input }],
});
const final = (text: string) => ({ id: "msg", model: "claude-opus-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text }] });

describe("Anthropic provider", () => {
  it("runs the tool loop: real tool results go back to the model, real booking happens", async () => {
    const c = await createClinic();
    const conv = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "hello" });
    const start = tomorrowAt("14:00");
    const { client, requests } = mockClient([
      () => toolUse("t1", "get_available_appointments", { service: "Teeth whitening", date: start.slice(0, 10) }),
      () => toolUse("t2", "book_appointment", { service: "Teeth whitening", start_time: start, customer_name: "Lina Saeed", customer_phone: "+971501239999" }),
      () => final("Perfect. I've booked you for 2:00 PM tomorrow."),
    ]);
    const turn = await runAgentTurn(c.business.id, conv.conversationId, { provider: createAnthropicProvider(client) });
    expect(turn.reply).toBe("Perfect. I've booked you for 2:00 PM tomorrow.");
    expect(turn.provider).toBe("anthropic");

    // System prompt is split into a cached stable block and a dynamic block
    expect(requests[0]!.system).toHaveLength(2);
    expect(requests[0]!.system[0]!.text).toMatch(/Never give medical diagnoses/);
    expect(requests[0]!.system[1]!.text).toMatch(/Asia\/Dubai/);
    // Tool results are returned in one user message, paired by id
    const second = requests[1]!.messages.at(-1)! as { role: string; content: { type: string; tool_use_id: string; content: string }[] };
    expect(second.role).toBe("user");
    expect(second.content[0]!.tool_use_id).toBe("t1");
    expect(JSON.parse(second.content[0]!.content).available.length).toBeGreaterThan(0);
    // Assistant turn passed back verbatim (append-only)
    expect(requests[1]!.messages.at(-2)!.role).toBe("assistant");

    const appts = await db.select().from(appointments).where(eq(appointments.businessId, c.business.id));
    expect(appts).toHaveLength(1);
  });

  it("returns permission denials to the model as tool errors", async () => {
    const c = await createClinic();
    const { setPermissions } = await import("./helpers");
    await setPermissions(c.business.id, { cancel_appointments: false });
    const conv = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "hello" });
    const { client, requests } = mockClient([
      (req) => {
        expect(req.tools.map((t) => t.name)).not.toContain("cancel_appointment");
        return toolUse("t1", "cancel_appointment", {});
      },
      () => final("I'm not able to cancel that here, but I can connect you with the team."),
    ]);
    await runAgentTurn(c.business.id, conv.conversationId, { provider: createAnthropicProvider(client) });
    const result = (requests[1]!.messages.at(-1)!.content as { is_error?: boolean; content: string }[])[0]!;
    expect(result.is_error).toBe(true);
    expect(result.content).toMatch(/not enabled/);
  });

  it("hands off on a refusal instead of showing nothing", async () => {
    const c = await createClinic();
    const conv = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "hello" });
    const { client } = mockClient([() => ({ id: "m", model: "claude-opus-5-5", stop_reason: "refusal", usage, content: [] })]);
    const turn = await runAgentTurn(c.business.id, conv.conversationId, { provider: createAnthropicProvider(client) });
    expect(turn.handedOff).toBe(true);
    expect(turn.reply).toMatch(/team know/);
  });

  it("claim guard blocks 'I've booked' when no booking tool succeeded", async () => {
    const c = await createClinic();
    const conv = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "hello" });
    const liar: ModelProvider = {
      id: "liar",
      label: "liar",
      isConfigured: () => true,
      run: async () => ({ text: "Great news — I've booked you for 2 PM tomorrow!", stopReason: "end_turn", model: "liar" }),
    };
    const turn = await runAgentTurn(c.business.id, conv.conversationId, { provider: liar });
    expect(turn.reply).not.toMatch(/booked you/);
    expect(turn.reply).toMatch(/wasn't able to confirm/);
  });

  it("falls back to a human when the provider errors", async () => {
    const c = await createClinic();
    const conv = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "hello" });
    const { client } = mockClient([() => { throw new Error("network down"); }]);
    const turn = await runAgentTurn(c.business.id, conv.conversationId, { provider: createAnthropicProvider(client) });
    expect(turn.handedOff).toBe(true);
    expect(turn.reply).toMatch(/having trouble/);
  });
});
