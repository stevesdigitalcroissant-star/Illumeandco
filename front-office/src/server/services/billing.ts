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

export const DEFAULT_PLANS: (typeof plans.$inferInsert)[] = [
  {
    id: "starter",
    name: "Starter",
    description: "For a single location getting started with an AI front desk.",
    priceMonthlyCents: 4900,
    features: ["1 AI receptionist", "Website chat", "Basic knowledge base", "Lead capture", "Appointment booking"],
    entitlements: { maxStaff: 2, maxLocations: 1, followUps: false, advancedAnalytics: false, channels: ["web_chat"], voice: false },
    sortOrder: 1,
  },
  {
    id: "growth",
    name: "Growth",
    description: "For busy teams that want every lead followed up.",
    priceMonthlyCents: 14900,
    features: ["Everything in Starter", "AI follow-ups", "Advanced analytics", "Multiple staff", "Additional channels"],
    entitlements: { maxStaff: 15, maxLocations: 1, followUps: true, advancedAnalytics: true, channels: ["web_chat", "email", "sms", "whatsapp"], voice: false },
    highlighted: true,
    sortOrder: 2,
  },
  {
    id: "pro",
    name: "Pro",
    description: "For multi-location businesses and phone-heavy front desks.",
    priceMonthlyCents: 39900,
    features: ["Everything in Growth", "Voice receptionist", "Advanced automation", "Multiple locations", "Priority support"],
    entitlements: { maxStaff: null, maxLocations: null, followUps: true, advancedAnalytics: true, channels: ["web_chat", "email", "sms", "whatsapp", "instagram", "voice"], voice: true },
    sortOrder: 3,
  },
];

/** Insert default plans if missing (never overwrites edited plans). */
export async function seedPlans() {
  for (const p of DEFAULT_PLANS) await db.insert(plans).values(p).onConflictDoNothing();
}

export async function listPlans() {
  return db.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.sortOrder));
}

export const billingConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

let stripeClient: Stripe | null = null;
function stripe() {
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
