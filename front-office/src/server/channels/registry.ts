import {
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
