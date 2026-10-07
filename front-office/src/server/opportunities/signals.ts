/**
 * Evidence detection for the Opportunity Engine.
 *
 * Pure, deterministic functions over what customers actually wrote. Every
 * signal keeps the message it came from, so the dashboard can show *why* an
 * opportunity is classified the way it is — the engine never asserts
 * anything it can't point to.
 */
import { parseTimeOfDay } from "../ai/datetime";

export type CustomerMessage = { id: string; content: string; createdAt: Date };

export type SignalKind =
  | "asked_price"
  | "asked_availability"
  | "picked_time"
  | "shared_contact"
  | "checking_schedule"
  | "consulting_someone"
  | "price_objection"
  | "not_interested"
  | "do_not_contact"
  | "closing_remark";

export type Signal = { kind: SignalKind; messageId: string; at: Date; quote: string };

const PATTERNS: [SignalKind, RegExp][] = [
  ["do_not_contact", /\b(don'?t|do not|stop|never)\s+(contact|message|text|call|email|messag|bother)\w*\s+me\b|\bunsubscribe\b|\bremove me\b/i],
  ["not_interested", /\b(not interested|no thanks|no thank you|never ?mind|changed my mind|found (another|somewhere else)|went (elsewhere|somewhere else)|booked (elsewhere|somewhere else))\b/i],
  ["price_objection", /\b(too (expensive|pricey|much)|(so|bit|quite|very|really) (expensive|pricey)|can'?t afford|cheaper|any discount|a discount|out of my budget|over my budget|over budget)\b/i],
  ["consulting_someone", /\b(talk|speak|check|ask|discuss|consult)\w*\s+(it\s+)?(to|with)?\s*(my\s+)?(husband|wife|partner|boyfriend|girlfriend|fianc[eé]e?|family|mum|mom|mother|dad|father|parents|boss|insurance)\b/i],
  ["checking_schedule", /\b((check|look at|see)\s+(my|the)\s+(schedule|calendar|diary|availability)|let me (check|see|think)|i'?ll (think|get back|let you know|come back|check)|not sure (when|yet)|maybe (later|another time|next week)|think about it)\b/i],
  ["shared_contact", /([^\s@]+@[^\s@]+\.[a-z]{2,})|(\+?\d[\d\s\-()]{7,}\d)/i],
  ["picked_time", /\b(\d{1,2}(:\d{2})?\s*(am|pm)|\d{1,2}:\d{2}|noon)\b|^\s*\d{1,2}\s*(works|is good|please|ok|okay)?[\s!.]*$/i],
  ["asked_availability", /\b(availab\w*|free (slot|time)|any (slot|time|opening)s?|can i (come|book|get|make)|book(ing)?|appointment|come in|tomorrow|today|this week|next week|weekend|saturday|sunday|monday|tuesday|wednesday|thursday|friday)\b/i],
  ["asked_price", /\b(price|prices|cost|costs|how much|fee|fees|rate|rates|charge)\b|\bexpensive\?/i],
  ["closing_remark", /^\s*(ok(ay)?|thanks|thank you|thx|cool|great|alright|sounds good|got it|noted)[\s!.,]*(thanks|thank you|bye)?[\s!.]*$/i],
];

/** All signals in the customer's messages, oldest first. */
export function detectSignals(messages: CustomerMessage[]): Signal[] {
  const out: Signal[] = [];
  for (const m of messages) {
    for (const [kind, re] of PATTERNS) {
      if (re.test(m.content)) out.push({ kind, messageId: m.id, at: m.createdAt, quote: m.content.trim().slice(0, 140) });
    }
  }
  return out;
}

export const latest = (signals: Signal[], kind: SignalKind) => [...signals].reverse().find((s) => s.kind === kind) ?? null;

/** The most recent explicit time preference the customer stated ("weekend", "afternoon"…), if any. */
export function statedTimePreference(messages: CustomerMessage[]): string | null {
  for (const m of [...messages].reverse()) {
    const t = m.content.toLowerCase();
    if (/\bweekends?\b/.test(t)) return "weekend";
    const tod = parseTimeOfDay(t);
    if (tod) return tod;
    if (/\b(after work|evenings?)\b/.test(t)) return "evening";
  }
  return null;
}
