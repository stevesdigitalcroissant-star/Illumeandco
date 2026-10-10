/**
 * "Get recovery running" checklist — every item is checked against the
 * business's real data and configuration, so it can't say done when it isn't.
 */
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { conversations, integrationEvents, integrations, opportunities, slotRecoveries, waitlistEntries } from "@/db/schema";
import { channelsFor } from "../channels/registry";
import { assertCan, dbOf, type Ctx } from "../context";
import { getAiSettings, getBusiness } from "../services/business";

export type SetupItem = { key: string; label: string; done: boolean; hint: string; href: string; needsOperator?: boolean };

export async function setupChecklist(ctx: Ctx): Promise<SetupItem[]> {
  assertCan(ctx, "business.manage");
  const db = dbOf(ctx);
  const b = ctx.businessId;
  const [business, settings] = await Promise.all([getBusiness(ctx), getAiSettings(ctx)]);
  const channels = channelsFor(business);
  const exists = async (q: Promise<unknown[]>) => (await q).length > 0;
  const [hook, callEvent, leadEvent, waitlist, chat, won] = await Promise.all([
    exists(db.select({ id: integrations.id }).from(integrations).where(and(eq(integrations.businessId, b), isNotNull(integrations.secretCiphertext))).limit(1)),
    exists(db.select({ id: integrationEvents.id }).from(integrationEvents).where(and(eq(integrationEvents.businessId, b), ne(integrationEvents.connector, "test"), sql`${integrationEvents.type} like 'call.%'`)).limit(1)),
    exists(db.select({ id: integrationEvents.id }).from(integrationEvents).where(and(eq(integrationEvents.businessId, b), ne(integrationEvents.connector, "test"), eq(integrationEvents.type, "lead.created"))).limit(1)),
    exists(db.select({ id: waitlistEntries.id }).from(waitlistEntries).where(eq(waitlistEntries.businessId, b)).limit(1)),
    exists(db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.businessId, b), eq(conversations.channel, "web_chat"))).limit(1)),
    exists(
      db
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(and(eq(opportunities.businessId, b), eq(opportunities.recovered, true)))
        .limit(1),
    ),
  ]);
  const slotWon = await exists(db.select({ id: slotRecoveries.id }).from(slotRecoveries).where(and(eq(slotRecoveries.businessId, b), eq(slotRecoveries.status, "filled"), isNotNull(slotRecoveries.filledBy))).limit(1));
  const ownNumber = [channels.get("sms"), channels.get("whatsapp")].some((c) => c && !c.shared);
  const items: SetupItem[] = [
    {
      key: "number",
      label: "Text from your own number",
      done: ownNumber,
      hint: channels.size ? "Add your SMS or WhatsApp number so customers see it and replies reach you." : "Messaging isn't connected on this server yet (Twilio) — configuration required.",
      href: "/app/settings?tab=integrations",
      needsOperator: !channels.has("sms") && !channels.has("whatsapp"),
    },
    { key: "phone", label: "Connect your phone system", done: callEvent, hint: hook ? "Webhook secret created — waiting for the first call event." : "Send missed calls via the webhook or Twilio Voice.", href: "/app/settings?tab=integrations" },
    { key: "forms", label: "Connect your forms and ads", done: leadEvent, hint: "Send lead.created events from your website form, Facebook/Google lead ads or Zapier.", href: "/app/settings?tab=integrations" },
    { key: "chat", label: "Add the chat widget to your website", done: chat, hint: "Paste one line of code into your site.", href: "/app/receptionist" },
    { key: "alerts", label: "Tell us who to alert", done: settings.alerts.smsTo.length + settings.alerts.emailTo.length > 0, hint: "Add the phone or email of whoever calls customers back.", href: "/app/settings?tab=team" },
    { key: "waitlist", label: "Start a waitlist", done: waitlist, hint: "Add people who want an earlier appointment — they fill your cancellations.", href: "/app/slots" },
  ];
  if (channels.has("whatsapp"))
    items.push({ key: "templates", label: "Add your WhatsApp templates", done: Object.keys(settings.whatsappTemplates).length > 0, hint: "Needed for messages outside WhatsApp's 24-hour window (approved by Meta).", href: "/app/settings?tab=integrations" });
  items.push({ key: "win", label: "First recovered booking", done: won || slotWon, hint: "Appears here the first time a booking follows one of our messages.", href: "/app/revenue" });
  return items;
}
