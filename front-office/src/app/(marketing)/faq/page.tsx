import type { Metadata } from "next";
import Link from "next/link";
import { TRIAL_DAYS } from "@/server/services/billing";
import { Container, CtaBand, FaqList, PageHero } from "../_components/ui";

export const metadata: Metadata = {
  title: "FAQ",
  description: "How AI Front Office recovers missed calls, leads and cancellations, what the AI can and can't do, setup, pricing and data.",
};

const GROUPS: { title: string; items: { q: string; a: string }[] }[] = [
  {
    title: "How it works",
    items: [
      { q: "Do I have to change my phone system or booking software?", a: "No. AI Front Office works on top of what you already use: your phone system reports missed calls, your website and forms send new enquiries, and it can use its own calendar or hand bookings to your team for your existing system." },
      { q: "What happens when I miss a call?", a: "The caller gets a text from your business number within seconds asking how you can help. Their reply goes to the AI receptionist, which answers and books. If the text can't be sent, or they don't reply, your team is asked to call them back." },
      { q: "How does slot recovery work?", a: "When an appointment is cancelled or moved, the free slot is offered to the people on your waitlist who fit it best. The first to reply YES is booked automatically; anyone who replies later is told politely that it has gone." },
      { q: "How do I know it's actually making me money?", a: "The revenue dashboard only counts a booking as recovered when one of our messages went out before it — a missed-call text, a first reply, a follow-up or a slot offer — and shows separately which of those appointments were actually completed." },
    ],
  },
  {
    title: "The AI",
    items: [
      { q: "Will the AI make things up about my business?", a: "The receptionist answers from the information you give it — your services, prices, opening hours, policies and FAQs. When it doesn't know something, it says so and hands the conversation to your team instead of guessing." },
      { q: "What can the AI do on its own?", a: "You decide. Answering questions, capturing leads, booking, rescheduling and cancelling are on by default and can each be switched off. Refunds and price changes are never available to the AI." },
      { q: "Can I take over a conversation?", a: "Yes. Any conversation can be taken over by a person at any time, and the AI hands off automatically when a customer asks for a human or when a request is outside what it's allowed to do." },
      { q: "Can customers stop the messages?", a: "Yes. Replying STOP unsubscribes them immediately and every automated message to them stops." },
    ],
  },
  {
    title: "Setup & channels",
    items: [
      { q: "How long does setup take?", a: "Most businesses finish the guided setup in about ten minutes: business details, opening hours, services, staff, FAQs and policies. You can skip any step and come back later." },
      { q: "Which channels are supported?", a: "Website chat works out of the box. SMS, WhatsApp and email are connected during setup and send from your own business number and address. Instagram and AI voice answering are not available yet." },
      { q: "Does it work with WhatsApp?", a: "Yes, on the Growth and Pro plans. WhatsApp requires an approved WhatsApp Business number; until it's approved, messages go by SMS instead." },
    ],
  },
  {
    title: "Pricing & billing",
    items: [
      { q: "Is there a free trial?", a: `Yes — ${TRIAL_DAYS} days, no card needed. You can see it working on your real customers before choosing a plan.` },
      { q: "What happens if I go over my plan's allowance?", a: "Nothing breaks and you're never charged extra automatically. New conversations go to your team, automated texts pause, and you get an alert so you can upgrade if you want to." },
      { q: "Can I cancel any time?", a: "Yes. There's no contract; cancel from Billing whenever you like." },
    ],
  },
];

export default function FaqPage() {
  return (
    <>
      <PageHero eyebrow="FAQ" title="Questions, answered." description="Everything businesses ask before they start. Can't find yours? Start the free trial and look around — no setup is permanent." />
      <section className="py-16 sm:py-20">
        <Container className="max-w-3xl space-y-14">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h2 className="mb-4 text-lg font-semibold tracking-tight">{g.title}</h2>
              <FaqList items={g.items} />
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            More on plans and allowances on the{" "}
            <Link href="/pricing" className="font-medium text-primary hover:underline">pricing page</Link>.
          </p>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
