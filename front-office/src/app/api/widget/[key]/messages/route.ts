import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { handleInbound } from "@/server/ai/orchestrator";
import { isVisitorToken, visitorMessages, widgetBusiness } from "@/server/channels/web-chat";

export const maxDuration = 60;

/** Poll for new messages (AI replies, human replies, follow-ups). */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!isVisitorToken(token)) return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  if (!(await rateLimit(`widget-poll:${clientIp(req.headers)}`, 240, 60_000)).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const business = await widgetBusiness(key);
  if (!business) return NextResponse.json({ error: "Unknown widget" }, { status: 404 });
  const after = url.searchParams.get("after") ?? undefined;
  return NextResponse.json(await visitorMessages(business.id, token, after && /^[0-9a-f-]{36}$/.test(after) ? after : undefined));
}

/** Customer sends a message → same orchestrator as every other channel. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const body = (await req.json().catch(() => null)) as { token?: unknown; text?: unknown; stream?: unknown } | null;
  if (!body || !isVisitorToken(body.token)) return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "Message is too long" }, { status: 400 });
  const ip = clientIp(req.headers);
  if (!(await rateLimit(`widget-msg:${ip}:${key}`, 20, 60_000)).ok || !(await rateLimit(`widget-msg-token:${body.token}`, 12, 60_000)).ok)
    return NextResponse.json({ error: "You're sending messages too quickly. Please wait a moment." }, { status: 429 });
  const business = await widgetBusiness(key);
  if (!business) return NextResponse.json({ error: "Unknown widget" }, { status: 404 });

  const token = body.token;
  const inbound = { businessId: business.id, channel: "web_chat" as const, identity: token, text };

  if (body.stream !== true) {
    const result = await handleInbound(inbound);
    return NextResponse.json({ aiActive: result.aiActive, ...(await visitorMessages(business.id, token)) });
  }

  // Streaming: newline-delimited JSON events (status, delta, reset, final, then done | error).
  // Text deltas are already gated by the claim guard (src/server/ai/reply-stream.ts).
  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        // The turn runs to completion even if the visitor disconnects, so actions are never half-done.
        const result = await handleInbound(inbound, { onEvent: send });
        send({ type: "done", aiActive: result.aiActive, ...(await visitorMessages(business.id, token)) });
      } catch (e) {
        console.error("[widget] streamed turn failed", e);
        send({ type: "error", error: "Message not sent. Please try again." });
      } finally {
        if (open) {
          open = false;
          controller.close();
        }
      }
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
