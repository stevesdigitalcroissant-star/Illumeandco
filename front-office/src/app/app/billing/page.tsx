import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { cn, formatMoney } from "@/lib/utils";
import { billingConfigured, entitlementsFor, getSubscription, listPlans } from "@/server/services/billing";
import { BillingButton } from "./billing-client";

export const metadata = { title: "Billing" };

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  active: "success",
  trialing: "info",
  past_due: "warning",
  canceled: "neutral",
  unpaid: "danger",
  incomplete: "warning",
};

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { business } = await requirePermission("billing.manage");
  const sp = await searchParams;
  const orgId = business.organizationId;
  const [plans, sub, ent] = await Promise.all([listPlans(), getSubscription(orgId), entitlementsFor(orgId)]);
  const configured = billingConfigured();
  const current = sub?.planId ? plans.find((p) => p.id === sub.planId) : undefined;
  const isActive = sub && ["active", "trialing"].includes(sub.status);
  const tz = business.timezone;

  return (
    <>
      <PageHeader title="Billing" description="Your AI Front Office subscription. Billing covers every location in this organization." />

      {sp.status === "success" ? <Notice tone="success" className="mb-6">Thanks — your checkout completed. Your subscription will update here as soon as Stripe confirms it (usually within a few seconds).</Notice> : null}
      {sp.status === "cancelled" ? <Notice tone="neutral" className="mb-6">Checkout was cancelled. No charge was made.</Notice> : null}
      {!configured ? (
        <Notice tone="info" className="mb-6">
          Billing isn&apos;t configured in this environment (set <code>STRIPE_SECRET_KEY</code> and each plan&apos;s <code>stripe_price_id</code>). All features are available.
        </Notice>
      ) : null}

      <Card className="mb-6">
        <CardHeader
          title="Current subscription"
          action={configured && sub?.stripeCustomerId ? <div className="w-44"><BillingButton variant="outline" size="sm">Manage billing</BillingButton></div> : null}
        />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[12.5px] text-muted-foreground">Plan</p>
            <p className="mt-1 text-lg font-semibold">{current?.name ?? (configured ? "No plan" : "All features (billing not configured)")}</p>
          </div>
          <div>
            <p className="text-[12.5px] text-muted-foreground">Status</p>
            <p className="mt-1.5">{sub ? <Badge tone={STATUS_TONE[sub.status] ?? "neutral"} className="capitalize">{sub.status.replace("_", " ")}</Badge> : <span className="text-sm text-muted-foreground">No subscription</span>}</p>
          </div>
          <div>
            <p className="text-[12.5px] text-muted-foreground">{sub?.trialEndsAt && sub.status === "trialing" ? "Trial ends" : "Renews"}</p>
            <p className="mt-1 text-sm">{sub?.status === "trialing" && sub.trialEndsAt ? fmtDateTime(sub.trialEndsAt, tz, "d LLL yyyy") : sub?.currentPeriodEnd ? fmtDateTime(sub.currentPeriodEnd, tz, "d LLL yyyy") : "—"}</p>
          </div>
          {configured && ent.enforced && !ent.plan ? (
            <Notice tone="warning" className="sm:col-span-3">There is no active subscription. Choose a plan below to keep using paid features.</Notice>
          ) : null}
        </CardBody>
      </Card>

      {plans.length ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = isActive && current?.id === p.id;
            const reason = !configured
              ? "Billing isn't configured in this environment."
              : !p.stripePriceId
                ? "This plan has no Stripe price configured yet."
                : null;
            return (
              <Card key={p.id} className={cn("flex flex-col", p.highlighted && "border-primary ring-1 ring-primary")}>
                <div className="flex-1 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">{p.name}</h3>
                    {isCurrent ? <Badge tone="success">Current plan</Badge> : p.highlighted ? <Badge tone="primary">Most popular</Badge> : null}
                  </div>
                  {p.description ? <p className="mt-1 text-[13px] text-muted-foreground">{p.description}</p> : null}
                  <p className="mt-4">
                    <span className="text-3xl font-semibold tracking-tight">{formatMoney(p.priceMonthlyCents, p.currency)}</span>
                    <span className="text-sm text-muted-foreground"> / month</span>
                  </p>
                  <ul className="mt-5 space-y-2">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2 text-[13px]"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{f}</li>
                    ))}
                  </ul>
                </div>
                <div className="border-t p-4">
                  {isCurrent ? (
                    <BillingButton variant="outline" disabledReason={configured && sub?.stripeCustomerId ? null : "Billing portal unavailable."}>Manage subscription</BillingButton>
                  ) : isActive && configured ? (
                    // Plan changes on an active subscription go through Stripe's portal (proration handled there).
                    <BillingButton variant="outline" disabledReason={sub?.stripeCustomerId ? null : "Billing portal unavailable."}>Change plan in billing portal</BillingButton>
                  ) : (
                    <BillingButton planId={p.id} variant={p.highlighted ? "default" : "outline"} disabledReason={reason}>
                      Choose {p.name}
                    </BillingButton>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card><EmptyState title="No plans are available" description="Plans are configured in the database (plans table)." /></Card>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Prices exclude applicable taxes. Payments are processed by Stripe; card details never touch our servers.</p>
    </>
  );
}
