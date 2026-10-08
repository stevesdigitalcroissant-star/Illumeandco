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

/** A new enquiry from a form, ad, or automation tool. Needs a way to reach them: email or phone. */
export const leadCreatedEvent = z
  .object({
    type: z.literal("lead.created"),
    name: z.string().trim().max(120).optional(),
    email: z.string().trim().max(200).optional(),
    phone: phone.optional(),
    /** The service they asked about, as free text — matched to your services by name. */
    service: z.string().trim().max(120).optional(),
    /** What they wrote. Stored on the lead and shown as evidence. */
    message: z.string().trim().max(4000).optional(),
    /** Where it came from: "website form", "facebook ads", "google ads"… */
    source: z.string().trim().min(1).max(60).default("form"),
  })
  .refine((v) => Boolean(v.email || v.phone), { message: "email or phone is required", path: ["email"] });

/** A free appointment slot in the business's own booking system (we offer it; their team books it there). */
export const slotOpenedEvent = z.object({
  type: z.literal("slot.opened"),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(480).default(60),
  service: z.string().trim().max(120).optional(),
  staff: z.string().trim().max(120).optional(),
});

export const normalizedEvent = z.discriminatedUnion("type", [callMissedEvent, callCompletedEvent, leadCreatedEvent, slotOpenedEvent]);
export type NormalizedEvent = z.infer<typeof normalizedEvent>;
export const SUPPORTED_EVENT_TYPES = ["call.missed", "call.completed", "lead.created", "slot.opened"] as const;

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
