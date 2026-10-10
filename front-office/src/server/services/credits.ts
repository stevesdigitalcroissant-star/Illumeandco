/**
 * Prepaid top-ups. A business that runs out of its monthly allowance and
 * doesn't want to upgrade can buy a credit pack (one-time Stripe payment).
 * Credits are used only after the plan's allowance is spent, and never
 * expire. Packs cost more per conversation than the plans, so upgrading
 * stays the better deal for regular use, and each keeps ≥50% margin at
 * cautious costs (~$0.10 per AI conversation, ~$0.05 per text).
 */
import { and, eq, sql } from "drizzle-orm";
import { db as rootDb } from "@/db";
import { businesses, usageCredits } from "@/db/schema";
import { AppError, assertCan, type Ctx } from "../context";
import { allowanceFor } from "./allowance";
import { getSubscription, stripe } from "./billing";

export type CreditKind = "ai" | "texts";

export const CREDIT_PACKS = [
  { id: "topup_small", name: "Top-up", priceCents: 4500, aiConversations: 100, texts: 50 },
  { id: "topup_large", name: "Large top-up", priceCents: 12000, aiConversations: 300, texts: 150 },
] as const;
export type CreditPack = (typeof CREDIT_PACKS)[number];

export const findPack = (id: string) => CREDIT_PACKS.find((p) => p.id === id) ?? null;

async function orgOf(businessId: string) {
  const b = await rootDb.query.businesses.findFirst({ where: eq(businesses.id, businessId), columns: { organizationId: true } });
  if (!b) throw new AppError("not_found", "Business not found");
  return b.organizationId;
}

export async function creditBalance(organizationId: string, kind: CreditKind) {
  const [r] = await rootDb
    .select({ n: sql<number>`coalesce(sum(${usageCredits.delta}), 0)::int` })
    .from(usageCredits)
    .where(and(eq(usageCredits.organizationId, organizationId), eq(usageCredits.kind, kind)));
  return Number(r?.n ?? 0);
}

export async function balances(ctx: Ctx) {
  const org = await orgOf(ctx.businessId);
  return { ai: await creditBalance(org, "ai"), texts: await creditBalance(org, "texts") };
}

/** How many packs of this kind were bought (used to re-alert when bought credits run out too). */
export async function purchaseCount(organizationId: string, kind: CreditKind) {
  const [r] = await rootDb
    .select({ n: sql<number>`count(*)::int` })
    .from(usageCredits)
    .where(and(eq(usageCredits.organizationId, organizationId), eq(usageCredits.kind, kind), eq(usageCredits.reason, "purchase")));
  return Number(r?.n ?? 0);
}

/**
 * Use one credit if any are left. Idempotent per `ref` (the same conversation
 * this month, or the same message, never costs twice). Serialized per
 * organization so two requests can't spend the last credit twice.
 */
export async function spendCredit(ctx: Ctx, kind: CreditKind, ref: string): Promise<boolean> {
  const org = await orgOf(ctx.businessId);
  return rootDb.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`credits:${org}:${kind}`}))`);
    const [used] = await tx
      .select({ id: usageCredits.id })
      .from(usageCredits)
      .where(and(eq(usageCredits.organizationId, org), eq(usageCredits.kind, kind), eq(usageCredits.ref, ref)))
      .limit(1);
    if (used) return true;
    const [r] = await tx
      .select({ n: sql<number>`coalesce(sum(${usageCredits.delta}), 0)::int` })
      .from(usageCredits)
      .where(and(eq(usageCredits.organizationId, org), eq(usageCredits.kind, kind)));
    if (Number(r?.n ?? 0) <= 0) return false;
    await tx.insert(usageCredits).values({ organizationId: org, kind, delta: -1, reason: kind === "ai" ? "ai_conversation" : "text", ref });
    return true;
  });
}

/** Add a purchased pack. Idempotent per Stripe checkout session. */
export async function grantPack(organizationId: string, packId: string, ref: string) {
  const pack = findPack(packId);
  if (!pack) throw new AppError("invalid", `Unknown credit pack "${packId}"`);
  const rows = await rootDb
    .insert(usageCredits)
    .values([
      { organizationId, kind: "ai", delta: pack.aiConversations, reason: "purchase", ref },
      { organizationId, kind: "texts", delta: pack.texts, reason: "purchase", ref },
    ])
    .onConflictDoNothing()
    .returning({ id: usageCredits.id });
  return { pack, granted: rows.length > 0 };
}

/** Stripe Checkout for a one-time credit pack. Only with an active plan or during the trial. */
export async function createCreditCheckout(ctx: Ctx, packId: string, opts: { email: string }) {
  assertCan(ctx, "billing.manage");
  const pack = findPack(packId);
  if (!pack) throw new AppError("not_found", "Top-up not found");
  const a = await allowanceFor(ctx);
  if (a.source === "unlimited") throw new AppError("not_configured", "Billing isn't configured in this environment.");
  if (a.source === "none") throw new AppError("invalid", "Top-ups work alongside a plan. Choose a plan first.");
  const organizationId = await orgOf(ctx.businessId);
  const sub = await getSubscription(organizationId);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.priceCents,
          product_data: { name: `${pack.name}: ${pack.aiConversations} AI conversations + ${pack.texts} texts`, description: "Used after your monthly allowance. Never expires." },
        },
      },
    ],
    customer: sub?.stripeCustomerId ?? undefined,
    customer_email: sub?.stripeCustomerId ? undefined : opts.email,
    client_reference_id: organizationId,
    metadata: { kind: "credit_pack", organizationId, packId: pack.id },
    success_url: `${base}/app/billing?status=topup`,
    cancel_url: `${base}/app/billing?status=cancelled`,
  });
  return session.url!;
}
