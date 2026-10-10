import type { Metadata } from "next";
import { Check, Minus, MessageSquare, Smartphone, Gauge, Gift } from "lucide-react";
import { listPlans, TRIAL_ALLOWANCE, TRIAL_DAYS } from "@/server/services/billing";
import { Container, CtaBand, FaqList, PageHero, PlanCards, SectionHeading } from "../_components/ui";

// Plans are read from the database on every request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Simple monthly plans in USD, each with a clear monthly allowance of AI conversations and texts. ${TRIAL_DAYS}-day free trial, no card needed.`,
};

const n = (v: number | null | undefined) => (v == null ? "Unlimited" : v.toLocaleString("en-US"));

const ALLOWANCE = [
  { icon: MessageSquare, title: "What's an AI conversation?", body: "One customer's conversation with the AI in a calendar month — however many messages it takes. A customer who chats on the 3rd and again on the 20th counts once. Answers from the built-in rules engine don't count." },
  { icon: Smartphone, title: "What's a text?", body: "One SMS or WhatsApp message sent to a customer: a missed-call text-back, a first reply, a follow-up, a slot offer or a reminder. Website chat and email don't count as texts." },
  { icon: Gauge, title: "What if I reach my limit?", body: "Nothing breaks and no one is left unanswered. New conversations go to your team (the customer is told a person will reply), automated texts pause and fall back to email or chat, and you get an alert. Upgrade any time, or wait for the 1st." },
  { icon: Gift, title: "How does the free trial work?", body: `${TRIAL_DAYS} days free, no card needed, with ${TRIAL_ALLOWANCE.aiConversationsPerMonth} AI conversations and ${TRIAL_ALLOWANCE.textsPerMonth} texts to see it working on real customers. Pick a plan whenever you're ready.` },
];

const FAQS = [
  { q: "How many conversations do I need?", a: "Roughly one per new customer contact a month: missed callers who reply, website chats and enquiries. About 25 new contacts a week is roughly 110 a month — inside Starter's 150. Busier practices, or anyone who wants cancellations refilled from a waitlist, should look at Growth." },
  { q: "Are replies to my customers ever blocked?", a: "No. Your team can always reply, and a customer who already started a conversation this month keeps getting answers from the AI. Limits only affect new AI conversations and automated texts." },
  { q: "Why are texts limited separately?", a: "Every SMS and WhatsApp message has a real carrier cost. Website chat and email are much cheaper, so they're not counted as texts." },
  { q: "Can I change plans or cancel?", a: "Yes. Upgrade, downgrade or cancel from Billing at any time; changes are prorated by Stripe. There's no contract." },
  { q: "What currency do you charge in?", a: "All prices are in US dollars, billed monthly by Stripe. Prices exclude applicable taxes." },
  { q: "Do I pay for text messages separately?", a: "No. Texts are sent from a number set up for your business, and their cost is covered by your plan's monthly text allowance. Website chat works from day one without any extra setup." },
];

export default async function PricingPage() {
  const plans = await listPlans();
  const rows: { label: string; value: (p: (typeof plans)[number]) => React.ReactNode }[] = [
    { label: "AI conversations / month", value: (p) => n(p.entitlements.aiConversationsPerMonth) },
    { label: "Texts (SMS + WhatsApp) / month", value: (p) => n(p.entitlements.textsPerMonth) },
    { label: "Locations", value: (p) => n(p.entitlements.maxLocations) },
    { label: "Team members", value: (p) => n(p.entitlements.maxStaff) },
    { label: "Missed call & lead recovery", value: () => true },
    { label: "AI website chat & booking", value: () => true },
    { label: "Revenue dashboard & staff alerts", value: () => true },
    { label: "Slot recovery & waitlist", value: (p) => p.id !== "starter" },
    { label: "WhatsApp", value: (p) => p.entitlements.channels.includes("whatsapp") },
  ];
  return (
    <>
      <PageHero eyebrow="Pricing" title="Pays for itself with one recovered booking." description={`Simple monthly plans in USD. ${TRIAL_DAYS}-day free trial, no card needed. Every plan includes a monthly allowance of AI conversations and texts.`}>
        <PlanCards items={plans} />
      </PageHero>

      {plans.length ? (
        <section className="py-20 sm:py-24">
          <Container>
            <SectionHeading center eyebrow="Compare" title="What's in each plan." />
            <div className="mx-auto mt-12 max-w-4xl overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium text-muted-foreground"><span className="sr-only">Feature</span></th>
                    {plans.map((p) => (
                      <th key={p.id} scope="col" className="px-4 py-3 text-center font-semibold">{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <th scope="row" className="px-4 py-3 font-normal text-foreground/85">{r.label}</th>
                      {plans.map((p) => {
                        const v = r.value(p);
                        return (
                          <td key={p.id} className="px-4 py-3 text-center tabular">
                            {v === true ? <Check className="mx-auto size-4 text-primary" aria-label="Included" /> : v === false ? <Minus className="mx-auto size-4 text-muted-foreground" aria-label="Not included" /> : v}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Container>
        </section>
      ) : null}

      <section className="border-t bg-surface py-20 sm:py-24">
        <Container>
          <SectionHeading center eyebrow="Allowances" title="Clear limits, no surprise bills." description="AI and text messages have real costs, so each plan includes a monthly allowance. You'll never be charged extra without choosing to upgrade." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {ALLOWANCE.map((a) => (
              <div key={a.title} className="rounded-xl border bg-background p-6">
                <a.icon className="size-5 text-primary" aria-hidden />
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-t py-20 sm:py-24">
        <Container className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
          <SectionHeading eyebrow="Pricing FAQ" title="Questions about plans." />
          <FaqList items={FAQS} />
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
