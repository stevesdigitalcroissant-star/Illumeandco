/**
 * Deterministic safety layer around the model.
 *
 * Pre-check (before any model call): routes messages that must never be left
 * to model judgement — explicit requests for a human, opt-outs, emergencies,
 * clinical questions at medical businesses, refunds and legal threats.
 *
 * Claim guard (after the model): blocks replies that claim an action happened
 * (booked, rescheduled, cancelled, sent) when no matching tool call succeeded.
 */
import { emergencyNumber } from "@/lib/countries";
import { MEDICAL_TYPES } from "../defaults";
import type { TurnEvent } from "./tools/registry";

export type PreCheck =
  | { kind: "none" }
  | { kind: "opt_out" }
  | { kind: "handoff"; reason: string; reply: string };

const HUMAN_RE =
  /\b(speak|talk|chat)\s+(to|with)\s+(someone|somebody|a\s+(real\s+)?(person|human)|(a|the|your)\s+(staff|team|manager|receptionist|doctor|dentist|owner)|staff|a\s+manager|an?\s+agent)\b|\breal\s+(person|human)\b|\b(human|operator)\s*(please|agent)?\s*[!.?]*$|\b(can|could)\s+(someone|somebody|you)\s+(call|phone|ring)\s+me\b|\bcall\s+me\s+(back)?\b|\bthis\s+(isn'?t|is\s+not)\s+helping\b|\bnot\s+helpful\b|\byou'?re\s+(useless|not\s+helping)\b|\bget\s+me\s+a\s+(person|human)\b/i;

const OPT_OUT_RE = /^\s*(stop|unsubscribe|opt[\s-]?out|stop\s+(messaging|texting|sending)(\s+me)?|don'?t\s+(message|text|contact)\s+me(\s+again)?)\s*[.!]*\s*$/i;

const EMERGENCY_RE =
  /\b(chest\s+pain|can'?t\s+breathe|cannot\s+breathe|difficulty\s+breathing|bleeding\s+(heavily|a\s+lot|won'?t\s+stop)|unconscious|passed\s+out|overdose|suicid|kill\s+myself|self[-\s]?harm|severe\s+(allergic|pain|swelling)|anaphyla|swelling\s+(in|of)\s+(my\s+)?(face|throat))\b/i;

const CLINICAL_RE =
  /\b(should\s+i\s+take|what\s+(medicine|medication|painkiller|antibiotic|pills?)|how\s+(much|many)\s+(ibuprofen|paracetamol|painkillers?|pills?)|dosage|dose\s+of|is\s+(it|this|that)\s+(infected|serious|normal|cancer)|diagnos|what('?s|\s+is)\s+wrong\s+with\s+my|do\s+i\s+(need|have)\s+(an?\s+)?(antibiotics|infection|cavity|root\s+canal)|prescri(be|ption)|side\s+effects?\s+of)\b/i;

const REFUND_RE = /\b(refund|money\s+back|chargeback|charge\s*back|dispute\s+(the\s+)?charge|overcharged)\b/i;
const LEGAL_RE = /\b(lawyer|attorney|sue\s+you|legal\s+action|lawsuit|solicitor|negligence\s+claim)\b/i;

export function preCheck(text: string, businessType: string, country?: string | null): PreCheck {
  if (OPT_OUT_RE.test(text)) return { kind: "opt_out" };
  if (EMERGENCY_RE.test(text)) {
    const local = emergencyNumber(country);
    return {
      kind: "handoff",
      reason: "Possible medical emergency",
      reply: `If this is an emergency, please call ${local ? local : "your local emergency number"} right away. I've also alerted our team so a person can follow up with you.`,
    };
  }
  if (MEDICAL_TYPES.has(businessType) && CLINICAL_RE.test(text))
    return {
      kind: "handoff",
      reason: "Clinical question — needs a qualified team member",
      reply:
        "I'm not able to give medical advice, but I've asked a member of our clinical team to get back to you. If it's urgent or you're in pain, please call us or seek medical care.",
    };
  if (REFUND_RE.test(text))
    return {
      kind: "handoff",
      reason: "Refund / billing request",
      reply: "I can't handle refunds or billing questions myself, but I've passed this to our team and someone will reply here shortly.",
    };
  if (LEGAL_RE.test(text))
    return { kind: "handoff", reason: "Legal concern raised", reply: "I've passed this to our management team, and a person will get back to you directly." };
  if (HUMAN_RE.test(text))
    return {
      kind: "handoff",
      reason: "Customer asked to speak to a person",
      reply: "Of course — I've let the team know, and someone will reply to you here as soon as possible.",
    };
  return { kind: "none" };
}

const CLAIMS: { re: RegExp; satisfiedBy: (e: TurnEvent) => boolean; what: string }[] = [
  {
    what: "booking",
    re: /\b(i(?:'ve|\s+have)\s+(?:booked|scheduled|reserved)|you(?:'re|\s+are)\s+(?:all\s+)?booked|(?:is|has\s+been)\s+booked|booking\s+(?:is\s+)?confirmed|appointment\s+is\s+confirmed)\b/i,
    satisfiedBy: (e) =>
      e.ok &&
      (e.tool === "book_appointment" ||
        e.tool === "reschedule_appointment" ||
        (e.tool === "get_customer_appointments" && Array.isArray((e.data as { appointments?: unknown[] })?.appointments) && (e.data as { appointments: unknown[] }).appointments.length > 0)),
  },
  {
    what: "reschedule",
    re: /\b(i(?:'ve|\s+have)\s+(?:moved|rescheduled|changed)\s+(?:it|your|the)|(?:has\s+been|is\s+now)\s+(?:moved|rescheduled))\b/i,
    satisfiedBy: (e) => e.ok && e.tool === "reschedule_appointment",
  },
  {
    what: "cancellation",
    re: /\b(i(?:'ve|\s+have)\s+cancell?ed|(?:has\s+been|is\s+now)\s+cancell?ed)\b/i,
    satisfiedBy: (e) => e.ok && e.tool === "cancel_appointment",
  },
  {
    what: "message",
    re: /\b(i(?:'ve|\s+have)\s+(?:sent|emailed|texted)|(?:has\s+been|was)\s+sent)\b/i,
    satisfiedBy: (e) => e.ok && ["send_message", "escalate_to_human", "create_follow_up"].includes(e.tool),
  },
];

/** Returns the unsupported claim, or null if the reply is consistent with what actually happened. */
export function findUnsupportedClaim(reply: string, events: TurnEvent[]) {
  for (const c of CLAIMS) if (c.re.test(reply) && !events.some(c.satisfiedBy)) return c.what;
  return null;
}

export const UNSUPPORTED_CLAIM_REPLY =
  "Sorry — I wasn't able to confirm that went through. Would you like me to try again, or shall I connect you with a member of our team?";
