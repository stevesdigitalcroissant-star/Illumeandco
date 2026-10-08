/** A business's Meta-approved WhatsApp templates (Twilio Content SIDs), one per kind of message. */
import { eq } from "drizzle-orm";
import { aiSettings, type WhatsappPurpose, type WhatsappTemplates } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, dbOf, invalid, type Ctx } from "../context";

export const WHATSAPP_PURPOSES: { purpose: WhatsappPurpose; label: string; vars: string[] }[] = [
  { purpose: "missed_call", label: "Missed-call text-back", vars: ["customer_name", "business"] },
  { purpose: "first_touch", label: "First message to a new lead", vars: ["customer_name", "business", "service"] },
  { purpose: "follow_up", label: "Follow-up", vars: ["customer_name", "business", "service"] },
  { purpose: "slot_offer", label: "Slot offer", vars: ["customer_name", "business", "service", "when"] },
  { purpose: "reminder", label: "Appointment reminder / confirmation", vars: ["customer_name", "business", "service", "date", "time"] },
  { purpose: "review", label: "Review request", vars: ["customer_name", "business", "service", "review_link"] },
];

export async function updateWhatsappTemplates(ctx: Ctx, input: Partial<Record<WhatsappPurpose, { contentSid: string; variables: string }>>) {
  assertCan(ctx, "business.manage");
  const out: WhatsappTemplates = {};
  for (const { purpose, label, vars } of WHATSAPP_PURPOSES) {
    const row = input[purpose];
    const sid = row?.contentSid.trim() ?? "";
    if (!sid) continue;
    if (!/^HX[0-9a-f]{32}$/i.test(sid)) throw invalid(`${label}: the Content SID should look like HX followed by 32 characters (from Twilio → Content Template Builder).`);
    const variables = (row?.variables ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    const unknown = variables.find((v) => !vars.includes(v));
    if (unknown) throw invalid(`${label}: "${unknown}" isn't available here. Use: ${vars.join(", ")}.`);
    out[purpose] = { contentSid: sid, variables };
  }
  await dbOf(ctx).update(aiSettings).set({ whatsappTemplates: out }).where(eq(aiSettings.businessId, ctx.businessId));
  await audit(ctx, { action: "integration.updated", summary: `WhatsApp templates updated (${Object.keys(out).length} set)`, entityType: "ai_settings", entityId: ctx.businessId });
  return out;
}
