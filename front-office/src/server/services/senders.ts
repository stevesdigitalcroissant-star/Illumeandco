/** A business's own messaging numbers (Twilio). A number can belong to only one business. */
import { eq } from "drizzle-orm";
import { businesses } from "@/db/schema";
import { audit } from "../audit";
import { assertCan, conflict, dbOf, invalid, type Ctx } from "../context";
import { assertFeature } from "./plan-limits";

const E164 = /^\+[1-9]\d{6,14}$/;

function clean(v: string | null | undefined, label: string) {
  const s = (v ?? "").replace(/[\s()-]/g, "").replace(/^whatsapp:/i, "");
  if (!s) return null;
  if (!E164.test(s)) throw invalid(`${label} must be in international format, e.g. +971501234567.`);
  return s;
}

export async function updateSenders(ctx: Ctx, input: { smsFrom?: string | null; whatsappFrom?: string | null }) {
  assertCan(ctx, "business.manage");
  const smsFrom = clean(input.smsFrom, "SMS number");
  const whatsappFrom = clean(input.whatsappFrom, "WhatsApp number");
  if (whatsappFrom) {
    const current = await dbOf(ctx).query.businesses.findFirst({ where: eq(businesses.id, ctx.businessId), columns: { whatsappFrom: true } });
    if (current?.whatsappFrom !== whatsappFrom) await assertFeature(ctx, "whatsapp");
  }
  try {
    const [b] = await dbOf(ctx).update(businesses).set({ smsFrom, whatsappFrom }).where(eq(businesses.id, ctx.businessId)).returning();
    await audit(ctx, {
      action: "integration.updated",
      summary: `Messaging numbers set — SMS: ${smsFrom ?? "none"}, WhatsApp: ${whatsappFrom ?? "none"}`,
      entityType: "business",
      entityId: ctx.businessId,
    });
    return b!;
  } catch (e) {
    if ((e as { code?: string }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505")
      throw conflict("That number is already connected to another business.");
    throw e;
  }
}

/** Does an inbound Twilio message's `To` belong to this business? (Unconfigured → accept: single-business setups.) */
export function ownsNumber(b: { smsFrom: string | null; whatsappFrom: string | null }, to: string, whatsapp: boolean) {
  const own = whatsapp ? b.whatsappFrom : b.smsFrom;
  if (!own) return true;
  return to.replace(/^whatsapp:/i, "") === own;
}
