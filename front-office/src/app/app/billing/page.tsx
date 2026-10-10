import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { cn, formatMoney } from "@/lib/utils";
import { billingConfigured, entitlementsFor, getSubscription, listPlans } from "@/server/services/billing";
import { BillingButton } from "./billing-client";
import { usageSummary } from "@/server/ai/usage";
import { allowanceFor, monthlyUsage } from "@/server/services/allowance";

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
  const { business, ctx } = await requirePermission("billing.manage");
  const sp = await searchParams;
  const orgId = business.organizationId;
  const [plans, sub, ent, usage, allowance, month] = await Promise.all([listPlans(), getSubscription(orgId), entitlementsFor(orgId), usageSummary(ctx), allowanceFor(ctx), monthlyUsage(ctx)]);
  const usd = (v: number) => `$${v < 1 ? v.toFixed(3) : v.toFixed(2)}`;
  const tokens = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(v));
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

      <Card className="mb-6">
        <CardHeader
          title="This month's usage"
          description={
            allowance.source === "unlimited"
              ? "Billing isn't on in this environment, so there are no limits. Counted across all locations."
              : allowance.source === "none"
                ? "No active plan, so the AI and automated texts are paused. Choose a plan below."
                : `Your ${allowance.source === "trial" ? "trial" : "plan"} allowance, counted across all locations. Resets on the 1st.`
          }
        />
        <CardBody className="grid gap-6 sm:grid-cols-2">
          <Meter label="AI conversations" hint="A conversation counts once a month, the first time the AI answers in it." used={month.aiConversations} limit={allowance.aiConversations} />
          <Meter label="Texts (SMS + WhatsApp)" hint="Outgoing texts. Replies to customers who wrote to you are never blocked." used={month.texts} limit={allowance.texts} />
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
      <Card className="mt-6">
        <CardHeader title="AI usage · last 30 days" description="Tokens reported by the AI provider for this location, and the estimated cost at list prices. Turns answered by the built-in rules engine cost nothing and aren't counted." />
        {usage.turns ? (
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">Estimated cost</p><p className="text-xl font-semibold tabular">{usd(usage.costUsd)}</p></div>
              <div><p className="text-xs text-muted-foreground">Per conversation</p><p className="text-xl font-semibold tabular">{usage.costPerConversationUsd == null ? "—" : usd(usage.costPerConversationUsd)}</p></div>
              <div><p className="text-xs text-muted-foreground">AI turns</p><p className="text-xl font-semibold tabular">{usage.turns}</p><p className="text-xs text-muted-foreground">{usage.conversations} conversations</p></div>
              <div><p className="text-xs text-muted-foreground">Cache hit rate</p><p className="text-xl font-semibold tabular">{usage.cacheHitRate == null ? "—" : `${Math.round(usage.cacheHitRate * 100)}%`}</p><p className="text-xs text-muted-foreground">of prompt tokens</p></div>
            </div>
            <p className="text-xs text-muted-foreground">
              Tokens: {tokens(usage.tokens.input)} input · {tokens(usage.tokens.output)} output · {tokens(usage.tokens.cacheRead)} cached reads · {tokens(usage.tokens.cacheWrite)} cache writes.{" "}
              {usage.byModel.map((m) => `${m.model}: ${m.turns} turns, ${usd(m.costUsd)}`).join(" · ")}
              {usage.unpricedTurns ? ` · ${usage.unpricedTurns} turns on a model with no known price (set AI_PRICING).` : ""}
            </p>
          </CardBody>
        ) : (
          <EmptyState title="No paid AI usage yet" description="Once the AI receptionist runs on Claude (ANTHROPIC_API_KEY), each turn's tokens and estimated cost appear here." />
        )}
      </Card>
    </>
  );
}

function Meter({ label, hint, used, limit }: { label: string; hint: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-sm tabular">
          <span className="font-semibold">{used.toLocaleString("en-US")}</span>
          <span className="text-muted-foreground"> / {limit === null ? "no limit" : limit.toLocaleString("en-US")}</span>
        </p>
      </div>
      {limit !== null ? (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div className={cn("h-full rounded-full", pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <p className="mt-1.5 text-xs text-muted-foreground">{limit !== null && used >= limit ? "Limit reached — upgrade to keep everything automatic." : hint}</p>
    </div>
  );
}
