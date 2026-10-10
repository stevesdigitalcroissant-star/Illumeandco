/**
 * Billing. Plans live in the `plans` table (seeded from DEFAULT_PLANS, then
 * editable without a deploy). Checkout and the customer portal use Stripe when
 * STRIPE_SECRET_KEY is set; otherwise billing is shown as "not configured" and
 * no paywall is enforced in that environment.
 */
import { asc, eq } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { businesses, organizations, plans, subscriptions, type PlanEntitlements } from "@/db/schema";
import { audit } from "../audit";
import { AppError, assertCan, type Ctx } from "../context";

/**
 * Plans (USD). Each includes a monthly allowance of AI conversations and
 * outbound texts so every plan stays profitable: at a cautious ~$0.10 of AI
 * cost per conversation and ~$0.05 per SMS/WhatsApp message, each plan keeps
 * roughly 60%+ gross margin. Real costs per business are on the Billing page
 * (AI usage) — adjust these rows in the database as you learn.
 */
export const DEFAULT_PLANS: (typeof plans.$inferInsert)[] = [
  {
    id: "starter",
    name: "Starter",
    description: "For a single clinic or salon that wants every missed call and enquiry answered.",
    priceMonthlyCents: 5900,
    currency: "USD",
    features: ["150 AI conversations / month", "100 texts / month", "Missed call recovery", "Lead recovery & first reply in seconds", "AI website chat & booking", "Revenue dashboard & staff alerts", "Up to 3 team members"],
    entitlements: { aiConversationsPerMonth: 150, textsPerMonth: 100, maxStaff: 3, maxLocations: 1, slotRecovery: false, followUps: true, advancedAnalytics: false, channels: ["web_chat", "email", "sms"], voice: false },
    sortOrder: 1,
  },
  {
    id: "growth",
    name: "Growth",
    description: "For busy practices that want cancellations refilled and every lead chased.",
    priceMonthlyCents: 14900,
    currency: "USD",
    features: ["450 AI conversations / month", "250 texts / month", "Everything in Starter", "Slot recovery & waitlist", "WhatsApp", "Smart follow-ups & morning summary", "Up to 10 team members"],
    entitlements: { aiConversationsPerMonth: 450, textsPerMonth: 250, maxStaff: 10, maxLocations: 1, slotRecovery: true, followUps: true, advancedAnalytics: true, channels: ["web_chat", "email", "sms", "whatsapp"], voice: false },
    highlighted: true,
    sortOrder: 2,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For multi-location and high-volume front desks.",
    priceMonthlyCents: 34900,
    currency: "USD",
    features: ["1,000 AI conversations / month", "700 texts / month", "Everything in Growth", "Up to 3 locations", "Unlimited team members", "Priority support", "AI voice answering (when available)"],
    entitlements: { aiConversationsPerMonth: 1000, textsPerMonth: 700, maxStaff: null, maxLocations: 3, slotRecovery: true, followUps: true, advancedAnalytics: true, channels: ["web_chat", "email", "sms", "whatsapp", "instagram", "voice"], voice: true },
    sortOrder: 3,
  },
];

/** What an organization without a paid plan can use while trying the product (when billing is on). */
export const TRIAL_ALLOWANCE = { aiConversationsPerMonth: 50, textsPerMonth: 25 };
/** Free trial without a card, counted from sign-up. */
export const TRIAL_DAYS = 5;

/** Insert default plans if missing (never overwrites edited plans). */
export async function seedPlans() {
  for (const p of DEFAULT_PLANS) await db.insert(plans).values(p).onConflictDoNothing();
}

export async function listPlans() {
  return db.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.sortOrder));
}

export const billingConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

let stripeClient: Stripe | null = null;
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new AppError("not_configured", "Billing is not configured (STRIPE_SECRET_KEY).");
  return (stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY));
}

export async function getSubscription(organizationId: string) {
  return db.query.subscriptions.findFirst({ where: eq(subscriptions.organizationId, organizationId) }) ?? null;
}

/**
 * Effective entitlements. When billing is not configured, everything is
 * available (self-hosted / development) — the UI says so explicitly.
 */
export async function entitlementsFor(organizationId: string): Promise<{ plan: string | null; entitlements: PlanEntitlements | null; enforced: boolean }> {
  if (!billingConfigured()) return { plan: null, entitlements: null, enforced: false };
  const sub = await getSubscription(organizationId);
  if (!sub?.planId || !["active", "trialing"].includes(sub.status)) return { plan: null, entitlements: null, enforced: true };
  const plan = await db.query.plans.findFirst({ where: eq(plans.id, sub.planId) });
  return { plan: plan?.id ?? null, entitlements: plan?.entitlements ?? null, enforced: true };
}

async function orgOf(ctx: Ctx) {
  const b = await db.query.businesses.findFirst({ where: eq(businesses.id, ctx.businessId) });
  if (!b) throw new AppError("not_found", "Business not found");
  return b.organizationId;
}

export async function createCheckoutSession(ctx: Ctx, planId: string, opts: { email: string }) {
  assertCan(ctx, "billing.manage");
  const plan = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
  if (!plan) throw new AppError("not_found", "Plan not found");
  if (!plan.stripePriceId) throw new AppError("not_configured", `Plan "${plan.name}" has no Stripe price configured.`);
  const organizationId = await orgOf(ctx);
  const existing = await getSubscription(organizationId);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    customer: existing?.stripeCustomerId ?? undefined,
    customer_email: existing?.stripeCustomerId ? undefined : opts.email,
    client_reference_id: organizationId,
    metadata: { organizationId, planId },
    subscription_data: { metadata: { organizationId, planId } },
    success_url: `${base}/app/billing?status=success`,
    cancel_url: `${base}/app/billing?status=cancelled`,
  });
  return session.url!;
}

export async function createPortalSession(ctx: Ctx) {
  assertCan(ctx, "billing.manage");
  const organizationId = await orgOf(ctx);
  const sub = await getSubscription(organizationId);
  if (!sub?.stripeCustomerId) throw new AppError("invalid", "No billing account yet — choose a plan first.");
  const session = await stripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${process.env.APP_URL ?? "http://localhost:3000"}/app/billing`,
  });
  return session.url;
}

/** Stripe webhook: verify the signature, then mirror subscription state. */
export async function handleStripeWebhook(rawBody: string, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new AppError("not_configured", "STRIPE_WEBHOOK_SECRET is not set.");
  if (!signature) throw new AppError("invalid", "Missing signature");
  const event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind !== "credit_pack") return { handled: false };
    if (session.payment_status !== "paid") return { handled: false }; // async methods: granted on async_payment_succeeded
    const organizationId = session.metadata.organizationId;
    const org = organizationId ? await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) }) : null;
    if (!org) return { handled: false };
    const { grantPack } = await import("./credits");
    const { pack, granted } = await grantPack(org.id, session.metadata.packId ?? "", session.id);
    const firstBusiness = await db.query.businesses.findFirst({ where: eq(businesses.organizationId, org.id) });
    if (granted && firstBusiness)
      await audit(
        { businessId: firstBusiness.id, actor: { type: "system", name: "Stripe" } },
        { action: "billing.updated", summary: `${pack.name} added: ${pack.aiConversations} AI conversations and ${pack.texts} texts`, entityType: "credit_pack", entityId: session.id },
      );
    return { handled: true };
  }
  if (event.type.startsWith("customer.subscription.")) {
    const sub = event.data.object as Stripe.Subscription;
    const organizationId = sub.metadata?.organizationId;
    if (!organizationId) return { handled: false };
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) });
    if (!org) return { handled: false };
    const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end ?? sub.items?.data?.[0]?.current_period_end;
    const values = {
      organizationId,
      planId: sub.metadata?.planId ?? null,
      status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
      stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    };
    await db.insert(subscriptions).values(values).onConflictDoUpdate({ target: subscriptions.organizationId, set: values });
    const firstBusiness = await db.query.businesses.findFirst({ where: eq(businesses.organizationId, organizationId) });
    if (firstBusiness)
      await audit(
        { businessId: firstBusiness.id, actor: { type: "system", name: "Stripe" } },
        { action: "billing.updated", summary: `Subscription ${values.status} (${values.planId ?? "unknown plan"})`, entityType: "subscription", entityId: sub.id },
      );
    return { handled: true };
  }
  return { handled: false };
}
