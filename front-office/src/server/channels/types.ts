/**
 * Channel abstraction.
 *
 * The AI agent never knows which channel it is talking on beyond a hint for
 * formatting. Inbound adapters normalise provider payloads into an
 * `InboundMessage`; the orchestrator (src/server/ai/orchestrator.ts) runs the
 * same agent for every channel; outbound delivery goes back through
 * `ChannelAdapter.send`.
 */
export type ChannelKind = "web_chat" | "whatsapp" | "instagram" | "sms" | "email" | "voice";

export type InboundMessage = {
  businessId: string;
  channel: ChannelKind;
  /** Stable sender identity on that channel (visitor token, phone number, email, PSID…). */
  identity: string;
  text: string;
  /** Contact details the channel already knows (e.g. the phone number for SMS). */
  contact?: { name?: string; email?: string; phone?: string };
};

export type OutboundMessage = {
  businessId: string;
  businessName: string;
  to: { name: string | null; email: string | null; phone: string | null };
  subject?: string;
  text: string;
  /** Sender to use (the business's own number). Falls back to the platform default when omitted. */
  from?: string | null;
  /**
   * WhatsApp only: whether the customer messaged us in the last 24h (free text allowed), and the
   * approved template to use otherwise. Without either, WhatsApp refuses and delivery falls back.
   */
  sessionOpen?: boolean;
  template?: { contentSid: string; variables: Record<string, string> } | null;
};

export type DeliveryResult =
  | { ok: true; status: "delivered" | "queued" | "posted_to_chat"; providerId?: string; detail?: string }
  | { ok: false; status: "not_configured" | "unreachable" | "failed"; detail: string };

export interface ChannelAdapter {
  kind: ChannelKind;
  label: string;
  /** True only when the credentials/infrastructure needed to deliver exist. */
  isConfigured(): boolean;
  /** Shown in the dashboard when not configured. */
  configurationHint: string;
  /** Whether this customer can be reached on this channel at all. */
  canReach(to: OutboundMessage["to"]): boolean;
  send(msg: OutboundMessage): Promise<DeliveryResult>;
}
