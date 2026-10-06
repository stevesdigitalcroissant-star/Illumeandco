"use client";
import { ArrowUp, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Msg = { id: string; role: "customer" | "ai" | "human"; content: string; createdAt: string };
type Config = { title: string; accentColor: string; logoUrl: string | null; greeting: string; agentName: string; aiActive: boolean };

const storageKey = (k: string) => `afo_visitor_${k}`;
function readToken(k: string) {
  try {
    return localStorage.getItem(storageKey(k));
  } catch {
    return null;
  }
}
function writeToken(k: string, t: string) {
  try {
    localStorage.setItem(storageKey(k), t);
  } catch {
    /* storage blocked — the session lasts for this page view */
  }
}

const SUGGESTIONS = ["What are your prices?", "Book an appointment", "Opening hours"];

export function ChatWidget({ publicKey, businessName, config, embedded }: { publicKey: string; businessName: string; config: Config; embedded: boolean }) {
  // The visitor token lives in a ref: it's read from storage after mount and never drives rendering.
  const tokenRef = useRef<string | null>(null);
  const localId = useRef(0);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [humanOwned, setHumanOwned] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const api = `/api/widget/${publicKey}`;

  const load = useCallback(
    async (t: string) => {
      const res = await fetch(`${api}/messages?token=${encodeURIComponent(t)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { conversation: { humanOwned: boolean } | null; messages: Msg[] };
      setMessages(data.messages);
      setHumanOwned(!!data.conversation?.humanOwned);
    },
    [api],
  );

  useEffect(() => {
    const t = readToken(publicKey);
    tokenRef.current = t;
    // load() sets state only after an awaited fetch (syncing with the server), not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t) void load(t);
  }, [publicKey, load]);

  // Poll for replies from the team and proactive messages.
  useEffect(() => {
    if (!messages.length) return;
    const id = setInterval(() => {
      const t = tokenRef.current;
      if (t && document.visibilityState === "visible" && !sending) void load(t);
    }, 4000);
    return () => clearInterval(id);
  }, [messages.length, sending, load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function ensureToken() {
    if (tokenRef.current) return tokenRef.current;
    const res = await fetch(`${api}/session`, { method: "POST" });
    if (!res.ok) throw new Error("Chat is unavailable right now.");
    const { token: t } = (await res.json()) as { token: string };
    writeToken(publicKey, t);
    tokenRef.current = t;
    return t;
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || sending) return;
    setError(null);
    setSending(true);
    setInput("");
    const optimistic: Msg = { id: `local-${++localId.current}`, role: "customer", content: clean, createdAt: "" };
    setMessages((m) => [...m, optimistic]);
    try {
      const t = await ensureToken();
      const res = await fetch(`${api}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t, text: clean }) });
      const data = (await res.json()) as { error?: string; messages?: Msg[]; conversation?: { humanOwned: boolean } };
      if (!res.ok) throw new Error(data.error ?? "Message not sent.");
      setMessages(data.messages ?? []);
      setHumanOwned(!!data.conversation?.humanOwned);
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setInput(clean);
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const accent = config.accentColor;
  return (
    <div className="flex h-screen flex-col bg-white text-[14px] text-zinc-900">
      <header className="flex items-center gap-3 px-4 py-3 text-white" style={{ background: accent }}>
        {config.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.logoUrl} alt="" className="size-8 rounded-full bg-white object-cover" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-white/20 text-[13px] font-semibold">{businessName.slice(0, 1)}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-tight">{config.title}</p>
          <p className="truncate text-[12px] leading-tight opacity-85">
            {humanOwned ? "A team member will reply here" : `${config.agentName} · virtual receptionist`}
          </p>
        </div>
        {embedded ? (
          <button onClick={() => window.parent.postMessage({ type: "afo:close" }, "*")} className="rounded-md p-1 hover:bg-white/15" aria-label="Close chat">
            <X className="size-5" />
          </button>
        ) : null}
      </header>

      <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto bg-zinc-50 px-4 py-4" aria-live="polite">
        <Bubble role="ai" accent={accent}>{config.greeting}</Bubble>
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} accent={accent}>
            {m.content}
          </Bubble>
        ))}
        {sending ? (
          <div className="flex gap-1 px-1 py-2" aria-label="Typing">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        ) : null}
        {!messages.length && !sending ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-full border bg-white px-3 py-1 text-[12.5px] text-zinc-700 hover:border-zinc-400">
                {s}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="bg-red-50 px-4 py-2 text-[12.5px] text-red-700" role="alert">{error}</p> : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="border-t bg-white p-3"
      >
        <div className="flex items-end gap-2 rounded-xl border px-3 py-2 focus-within:border-zinc-400">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Type your message…"
            className="max-h-28 flex-1 resize-none bg-transparent py-1 outline-none placeholder:text-zinc-400"
            aria-label="Message"
          />
          <button type="submit" disabled={!input.trim() || sending} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white disabled:opacity-40" style={{ background: accent }} aria-label="Send">
            <ArrowUp className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
          {!humanOwned ? (
            <button type="button" onClick={() => send("I'd like to speak to a person, please.")} className="inline-flex items-center gap-1 hover:text-zinc-600">
              <UserRound className="size-3" /> Talk to a person
            </button>
          ) : (
            <span>Connected to the {businessName} team</span>
          )}
          <span>Powered by AI Front Office</span>
        </div>
      </form>
    </div>
  );
}

function Bubble({ role, accent, children }: { role: Msg["role"]; accent: string; children: React.ReactNode }) {
  const mine = role === "customer";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={mine ? "max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-br-md px-3.5 py-2 text-white" : "max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-bl-md border bg-white px-3.5 py-2"}
        style={mine ? { background: accent } : undefined}
      >
        {role === "human" ? <span className="mb-0.5 block text-[11px] font-medium text-zinc-500">Team member</span> : null}
        {children}
      </div>
    </div>
  );
}
