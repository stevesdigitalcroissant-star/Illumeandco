import {
  twilioCredentials,
  emailAdapter,
  instagramAdapter,
  smsAdapter,
  voiceAdapter,
  webChatAdapter,
  whatsappAdapter,
} from "./adapters";
import type { ChannelAdapter, ChannelKind } from "./types";

const ADAPTERS: Record<ChannelKind, ChannelAdapter> = {
  web_chat: webChatAdapter,
  whatsapp: whatsappAdapter,
  instagram: instagramAdapter,
  sms: smsAdapter,
  email: emailAdapter,
  voice: voiceAdapter,
};

export function getChannel(kind: ChannelKind): ChannelAdapter {
  return ADAPTERS[kind];
}

export function listChannels() {
  return Object.values(ADAPTERS).map((a) => ({
    kind: a.kind,
    label: a.label,
    configured: a.isConfigured(),
    hint: a.configurationHint,
  }));
}

/** Preference order for proactive messages (reminders, follow-ups, reviews). */
export const PROACTIVE_ORDER: ChannelKind[] = ["whatsapp", "sms", "email"];

export type BusinessSenders = { smsFrom: string | null; whatsappFrom: string | null };
export type SendableChannel = { from: string | null; /** true = the platform's shared default number, not the business's own */ shared: boolean };

/**
 * The proactive channels that can actually send for this business right now,
 * and from which number. A business's own number always wins; the platform
 * default (TWILIO_SMS_FROM / TWILIO_WHATSAPP_FROM) is a fallback for
 * single-business setups and is flagged as shared.
 */
export function channelsFor(b: BusinessSenders) {
  const out = new Map<ChannelKind, SendableChannel>();
  const creds = twilioCredentials();
  const pick = (own: string | null, env: string | undefined) => (own ? { from: own, shared: false } : env ? { from: env, shared: true } : null);
  const wa = creds ? pick(b.whatsappFrom, process.env.TWILIO_WHATSAPP_FROM) : null;
  const sms = creds ? pick(b.smsFrom, process.env.TWILIO_SMS_FROM) : null;
  if (wa) out.set("whatsapp", wa);
  if (sms) out.set("sms", sms);
  if (emailAdapter.isConfigured()) out.set("email", { from: process.env.EMAIL_FROM ?? null, shared: true });
  return out;
}

/** Could any of these channels deliver to this person? */
export function canReachWith(channels: Map<ChannelKind, SendableChannel>, to: { email: string | null; phone: string | null }) {
  return PROACTIVE_ORDER.some((k) => channels.has(k) && getChannel(k).canReach({ name: null, ...to }));
}

export const hasPhoneChannel = (channels: Map<ChannelKind, SendableChannel>) => channels.has("sms") || channels.has("whatsapp");
