/**
 * Normalized integration events. Every connector (a phone system, a form tool,
 * Zapier/Make, a booking platform) translates its own payload into one of
 * these shapes before anything else sees it, so the revenue engine never
 * depends on a vendor's format.
 */
import { z } from "zod";

const phone = z.string().trim().min(5).max(40);

export const callMissedEvent = z.object({
  type: z.literal("call.missed"),
  /** The caller's number (E.164 preferred). */
  from: phone,
  /** The business line that was called, if known. */
  to: phone.optional(),
  callerName: z.string().trim().max(120).optional(),
  /** no_answer · busy · failed · abandoned (hung up while ringing) · voicemail · after_hours */
  reason: z.enum(["no_answer", "busy", "failed", "abandoned", "voicemail", "after_hours"]).default("no_answer"),
  /** Voicemail transcript, if the phone system provides one. Stored as evidence only. */
  voicemailTranscript: z.string().trim().max(4000).optional(),
});

/** A call that connected (inbound answered, or the team calling the customer back). */
export const callCompletedEvent = z.object({
  type: z.literal("call.completed"),
  direction: z.enum(["inbound", "outbound"]),
  /** The customer's number. */
  customer: phone,
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
});

export const normalizedEvent = z.discriminatedUnion("type", [callMissedEvent, callCompletedEvent]);
export type NormalizedEvent = z.infer<typeof normalizedEvent>;
export const SUPPORTED_EVENT_TYPES = ["call.missed", "call.completed"] as const;

/** The envelope the universal webhook accepts. */
export const webhookEnvelope = z.object({
  /** Your system's unique id for this event — duplicates are ignored. */
  id: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(80),
  /** ISO 8601; defaults to the time we received it. */
  occurredAt: z.string().datetime({ offset: true }).optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type WebhookEnvelope = z.infer<typeof webhookEnvelope>;
