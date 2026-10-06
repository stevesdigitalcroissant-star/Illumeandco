/**
 * Streaming replies to the website widget (item 1).
 * The claim guard must hold even while text streams: an unsupported claim is
 * never released to the customer, not even briefly.
 */
import { describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, messages } from "@/db/schema";
import { runAgentTurn } from "@/server/ai/agent";
import { handleInbound } from "@/server/ai/orchestrator";
import { createAnthropicProvider } from "@/server/ai/providers/anthropic";
import { GuardedReplyStream, type ReplyStreamEvent } from "@/server/ai/reply-stream";
import { UNSUPPORTED_CLAIM_REPLY } from "@/server/ai/safety";
import type { TurnEvent } from "@/server/ai/tools/registry";
import { newVisitorToken } from "@/server/channels/web-chat";
import { POST } from "@/app/api/widget/[key]/messages/route";
import { createClinic, tomorrowAt, visitor } from "./helpers";

const deltas = (events: ReplyStreamEvent[]) => events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text);

describe("GuardedReplyStream", () => {
  it("releases complete sentences only", () => {
    const out: ReplyStreamEvent[] = [];
    const g = new GuardedReplyStream((e) => out.push(e), []);
    g.push("Our whitening is AED");
    expect(out).toEqual([]);
    g.push(" 650. Would you like");
    expect(deltas(out)).toEqual(["Our whitening is AED 650. "]);
    g.push(" a time this week?\n");
    expect(deltas(out).join("")).toBe("Our whitening is AED 650. Would you like a time this week?\n");
  });

  it("holds an unsupported claim and everything after it", () => {
    const out: ReplyStreamEvent[] = [];
    const events: TurnEvent[] = [];
    const g = new GuardedReplyStream((e) => out.push(e), events);
    g.push("Great news! I've booked you for 2 PM tomorrow. See you then! ");
    expect(deltas(out)).toEqual(["Great news! "]);
    expect(deltas(out).join("")).not.toMatch(/booked/);
  });

  it("releases a claim once the matching tool has succeeded", () => {
    const out: ReplyStreamEvent[] = [];
    const g = new GuardedReplyStream((e) => out.push(e), [{ tool: "book_appointment", ok: true }]);
    g.push("Perfect. I've booked you for 2 PM tomorrow. ");
    expect(deltas(out).join("")).toBe("Perfect. I've booked you for 2 PM tomorrow. ");
  });

  it("reset discards text shown in the current step", () => {
    const out: ReplyStreamEvent[] = [];
    const g = new GuardedReplyStream((e) => out.push(e), []);
    g.push("Let me check. ");
    g.reset();
    expect(out.at(-1)).toEqual({ type: "reset" });
    g.push("Done. ");
    expect(deltas(out).at(-1)).toBe("Done. ");
  });
});

// ── Claude provider streaming, against a mocked SDK stream ─────────────────
type StreamEv = { type: string; [k: string]: unknown };
type Step = { events: StreamEv[]; message: Record<string, unknown> };
const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 };
const textDeltas = (...parts: string[]): StreamEv[] => parts.map((text) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }));
const msg = (stop: string, content: unknown[]) => ({ id: "m", model: "claude-opus-5-5", stop_reason: stop, usage, content });

function mockStreamingClient(steps: Step[]) {
  let i = 0;
  const client = {
    beta: {
      messages: {
        create: () => {
          throw new Error("non-streaming path must not be used when streaming");
        },
        stream: () => {
          const step = steps[i++];
          if (!step) throw new Error("unexpected extra request");
          const listeners: ((e: StreamEv) => void)[] = [];
          return {
            on(name: string, cb: (e: StreamEv) => void) {
              if (name === "streamEvent") listeners.push(cb);
              return this;
            },
            async finalMessage() {
              for (const e of step.events) listeners.forEach((l) => l(e));
              return step.message;
            },
          };
        },
      },
    },
  };
  return client as unknown as Parameters<typeof createAnthropicProvider>[0];
}

async function freshConversation() {
  const c = await createClinic();
  const conv = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "hello" });
  return { c, conversationId: conv.conversationId };
}
const lastAiMessage = async (conversationId: string) =>
  (await db.select().from(messages).where(and(eq(messages.conversationId, conversationId), eq(messages.role, "ai"))).orderBy(desc(messages.createdAt)).limit(1))[0]!.content;

describe("streaming Claude replies", () => {
  it("streams the final answer, resets interim text, reports tool progress, and books for real", async () => {
    const { c, conversationId } = await freshConversation();
    const start = tomorrowAt("14:00");
    const client = mockStreamingClient([
      {
        events: textDeltas("Let me check. "),
        message: msg("tool_use", [{ type: "text", text: "Let me check. " }, { type: "tool_use", id: "t1", name: "get_available_appointments", input: { service: "Teeth whitening", date: start.slice(0, 10) } }]),
      },
      {
        events: [],
        message: msg("tool_use", [{ type: "tool_use", id: "t2", name: "book_appointment", input: { service: "Teeth whitening", start_time: start, customer_name: "Lina Saeed", customer_phone: "+971501239999" } }]),
      },
      {
        events: textDeltas("Perfect, Lina. ", "I've booked you for 2:00 PM tomorrow. ", "See you then!"),
        message: msg("end_turn", [{ type: "text", text: "Perfect, Lina. I've booked you for 2:00 PM tomorrow. See you then!" }]),
      },
    ]);
    const events: ReplyStreamEvent[] = [];
    const turn = await runAgentTurn(c.business.id, conversationId, { provider: createAnthropicProvider(client), onEvent: (e) => events.push(e) });

    expect(events.filter((e) => e.type === "status").map((e) => (e as { label: string }).label)).toEqual(["Checking availability…", "Booking your appointment…"]);
    const firstReset = events.findIndex((e) => e.type === "reset");
    expect(firstReset).toBeGreaterThan(-1); // "Let me check." was withdrawn
    expect(deltas(events.slice(firstReset + 1)).join("")).toBe("Perfect, Lina. I've booked you for 2:00 PM tomorrow. ");
    expect(events.at(-1)).toEqual({ type: "final", text: turn.reply });
    expect(turn.reply).toBe("Perfect, Lina. I've booked you for 2:00 PM tomorrow. See you then!");
    expect(await lastAiMessage(conversationId)).toBe(turn.reply);
    expect(await db.select().from(appointments).where(eq(appointments.businessId, c.business.id))).toHaveLength(1);
  });

  it("never streams an unsupported booking claim", async () => {
    const { c, conversationId } = await freshConversation();
    const client = mockStreamingClient([
      {
        events: textDeltas("Great news! ", "I've booked you for 2 PM tomorrow. ", "See you then!"),
        message: msg("end_turn", [{ type: "text", text: "Great news! I've booked you for 2 PM tomorrow. See you then!" }]),
      },
    ]);
    const events: ReplyStreamEvent[] = [];
    const turn = await runAgentTurn(c.business.id, conversationId, { provider: createAnthropicProvider(client), onEvent: (e) => events.push(e) });
    expect(deltas(events).join("")).not.toMatch(/booked/i);
    expect(turn.reply).toBe(UNSUPPORTED_CLAIM_REPLY);
    expect(events.at(-1)).toEqual({ type: "final", text: UNSUPPORTED_CLAIM_REPLY });
    expect(await lastAiMessage(conversationId)).toBe(UNSUPPORTED_CLAIM_REPLY);
  });

  it("discards a partial declined mid-stream when a server-side fallback takes over", async () => {
    const { c, conversationId } = await freshConversation();
    const client = mockStreamingClient([
      {
        events: [
          ...textDeltas("Partial from the declined model. "),
          { type: "content_block_start", index: 1, content_block: { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-4-8" } } },
          ...textDeltas("Our teeth whitening is AED 650. "),
        ],
        message: msg("end_turn", [
          { type: "text", text: "Partial from the declined model. " },
          { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-4-8" } },
          { type: "text", text: "Our teeth whitening is AED 650." },
        ]),
      },
    ]);
    const events: ReplyStreamEvent[] = [];
    const turn = await runAgentTurn(c.business.id, conversationId, { provider: createAnthropicProvider(client), onEvent: (e) => events.push(e) });
    const reset = events.findIndex((e) => e.type === "reset");
    expect(reset).toBeGreaterThan(-1);
    expect(deltas(events.slice(reset + 1)).join("")).toBe("Our teeth whitening is AED 650. ");
    expect(turn.reply).toBe("Our teeth whitening is AED 650.");
    expect(await lastAiMessage(conversationId)).not.toMatch(/declined/);
  });
});

// ── The widget route ───────────────────────────────────────────────────────
async function post(key: string, body: object) {
  return POST(new Request(`http://localhost/api/widget/${key}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), {
    params: Promise.resolve({ key }),
  });
}
async function readNdjson(res: Response) {
  return (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type: string; text?: string; label?: string; aiActive?: boolean; messages?: { role: string; content: string }[] });
}

describe("widget messages route", () => {
  it("streams NDJSON events ending with the authoritative final reply and the message list", async () => {
    const c = await createClinic();
    const token = newVisitorToken();
    const res = await post(c.business.publicKey, { token, text: "How much is teeth whitening?", stream: true });
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await readNdjson(res);
    expect(events.some((e) => e.type === "status" && e.label === "Checking our services…")).toBe(true);
    const final = events.find((e) => e.type === "final")!;
    expect(final.text).toMatch(/AED 650/);
    const done = events.at(-1)!;
    expect(done.type).toBe("done");
    expect(done.messages?.at(-1)).toMatchObject({ role: "ai", content: final.text });
  });

  it("keeps the JSON response for clients that don't ask to stream", async () => {
    const c = await createClinic();
    const res = await post(c.business.publicKey, { token: newVisitorToken(), text: "How much is a cleaning?" });
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { messages: { content: string }[] };
    expect(body.messages.at(-1)?.content).toMatch(/AED 300/);
  });

  it("streams a handoff and reports the AI is no longer active", async () => {
    const c = await createClinic();
    const events = await readNdjson(await post(c.business.publicKey, { token: newVisitorToken(), text: "Can I speak to someone?", stream: true }));
    expect(events.some((e) => e.type === "status" && e.label === "Connecting you with the team…")).toBe(true);
    expect(events.find((e) => e.type === "final")?.text).toMatch(/someone will reply/);
    expect(events.at(-1)).toMatchObject({ type: "done", aiActive: false });
  });

  it("still validates input before streaming", async () => {
    const c = await createClinic();
    expect((await post(c.business.publicKey, { token: "bad", text: "hi", stream: true })).status).toBe(400);
    expect((await post(c.business.publicKey, { token: newVisitorToken(), text: "   ", stream: true })).status).toBe(400);
    expect((await post("pk_000000000000000000000000", { token: newVisitorToken(), text: "hi", stream: true })).status).toBe(404);
  });
});
