import type { ChannelAdapter, DeliveryResult, OutboundMessage } from "./types";

/**
 * Website chat: the conversation itself is the delivery surface. Outbound
 * messages are stored on the conversation and shown when the visitor's widget
 * polls or is reopened. Always available.
 */
export const webChatAdapter: ChannelAdapter = {
  kind: "web_chat",
  label: "Website chat",
  isConfigured: () => true,
  configurationHint: "Add the widget snippet to your website.",
  canReach: () => true,
  async send(): Promise<DeliveryResult> {
    return { ok: true, status: "posted_to_chat", detail: "Visible in the website chat when the customer opens it." };
  },
};

/** Email via Resend's HTTP API. Requires RESEND_API_KEY and EMAIL_FROM. */
export const emailAdapter: ChannelAdapter = {
  kind: "email",
  label: "Email",
  isConfigured: () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  configurationHint: "Set RESEND_API_KEY and EMAIL_FROM to send email.",
  canReach: (to) => Boolean(to.email),
  async send(msg: OutboundMessage): Promise<DeliveryResult> {
    if (!this.isConfigured()) return { ok: false, status: "not_configured", detail: this.configurationHint };
    if (!msg.to.email) return { ok: false, status: "unreachable", detail: "Customer has no email address." };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [msg.to.email],
          subject: msg.subject ?? `A message from ${msg.businessName}`,
          text: msg.text,
        }),
      });
      if (!res.ok) return { ok: false, status: "failed", detail: `Email provider returned ${res.status}` };
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, status: "queued", providerId: body.id };
    } catch (e) {
      return { ok: false, status: "failed", detail: (e as Error).message };
    }
  },
};

export const twilioCredentials = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

function twilioAdapter(kind: "sms" | "whatsapp", fromEnv: string, label: string): ChannelAdapter {
  return {
    kind,
    label,
    isConfigured: () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env[fromEnv]),
    configurationHint: `Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and ${fromEnv} to enable ${label}.`,
    canReach: (to) => Boolean(to.phone),
    async send(msg: OutboundMessage): Promise<DeliveryResult> {
      const from = msg.from || process.env[fromEnv];
      if (!twilioCredentials() || !from) return { ok: false, status: "not_configured", detail: this.configurationHint };
      if (!msg.to.phone) return { ok: false, status: "unreachable", detail: "Customer has no phone number." };
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const prefix = kind === "whatsapp" ? "whatsapp:" : "";
      const form = new URLSearchParams({ From: `${prefix}${from}`, To: `${prefix}${msg.to.phone}` });
      if (kind === "whatsapp" && !msg.sessionOpen) {
        // WhatsApp only allows free text within 24h of the customer's last message; otherwise an approved template.
        if (!msg.template)
          return { ok: false, status: "unreachable", detail: "Outside WhatsApp's 24-hour window and no approved template for this message" };
        form.set("ContentSid", msg.template.contentSid);
        form.set("ContentVariables", JSON.stringify(msg.template.variables));
      } else form.set("Body", msg.text);
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form,
        });
        if (!res.ok) return { ok: false, status: "failed", detail: `Twilio returned ${res.status}` };
        const body = (await res.json().catch(() => ({}))) as { sid?: string };
        return { ok: true, status: "queued", providerId: body.sid };
      } catch (e) {
        return { ok: false, status: "failed", detail: (e as Error).message };
      }
    },
  };
}

export const smsAdapter = twilioAdapter("sms", "TWILIO_SMS_FROM", "SMS");
export const whatsappAdapter = twilioAdapter("whatsapp", "TWILIO_WHATSAPP_FROM", "WhatsApp");

/** Instagram DMs require a Meta app review + page token; not available yet. */
export const instagramAdapter: ChannelAdapter = {
  kind: "instagram",
  label: "Instagram",
  isConfigured: () => false,
  configurationHint: "Instagram messaging requires a Meta business app. Not available yet.",
  canReach: () => false,
  async send() {
    return { ok: false, status: "not_configured", detail: this.configurationHint };
  },
};

/**
 * Voice. The voice receptionist uses the same agent + tools through
 * src/server/channels/voice.ts once a telephony/speech provider is connected.
 */
export const voiceAdapter: ChannelAdapter = {
  kind: "voice",
  label: "Voice calls",
  isConfigured: () => false,
  configurationHint: "Voice requires a telephony + speech provider (e.g. Twilio Voice). Not available yet.",
  canReach: () => false,
  async send() {
    return { ok: false, status: "not_configured", detail: this.configurationHint };
  },
};
