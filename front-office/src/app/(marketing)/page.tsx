import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, CalendarX, Flower2, HeartPulse, MessageSquare, MoonStar, PhoneMissed, Repeat, Scissors, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listPlans } from "@/server/services/billing";
import { RecoveryDemo } from "./_components/recovery-demo";
import { RoiCalculator } from "./_components/roi-calculator";
import { Container, CtaBand, PlanCards, SectionHeading } from "./_components/ui";

// Pricing is read from the database on every request (the DB is not available at build time).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "AI Front Office — Recover the bookings you're losing" },
  description: "Missed calls texted back in seconds, every enquiry answered and followed up, cancellations refilled from your waitlist — and the revenue it recovers, shown in your dashboard.",
};

const PROBLEMS = [
  { icon: PhoneMissed, title: "Missed calls", body: "The phone rings while you're with a client. Most people who reach voicemail don't leave a message — they book somewhere else." },
  { icon: MoonStar, title: "After-hours messages", body: "Questions arrive at 10 PM on your website and in your DMs. By the time you reply the next morning, the moment has passed." },
  { icon: Repeat, title: "No follow-up", body: "Someone asks about a price, then goes quiet. Nobody has time to chase every enquiry, so good leads quietly slip away." },
  { icon: CalendarX, title: "Empty slots", body: "A patient cancels the day before. The time sits empty even though someone on your list would have taken it." },
];

const STEPS = [
  { n: "1", title: "Connect what you already use", body: "Your phone line, website, forms and WhatsApp. Nothing to replace — it works on top of your existing tools." },
  { n: "2", title: "The AI recovers lost bookings", body: "Texts back missed callers, answers every enquiry within seconds, follows up the quiet ones and refills cancellations." },
  { n: "3", title: "You see the money it brought back", body: "A dashboard shows every booking that came after one of our messages — and anything that needs a person is sent straight to your team." },
];

const WORKERS = [
  { icon: PhoneMissed, title: "Missed call recovery", body: "Every unanswered call gets a text within seconds: “Sorry we missed you — how can we help?” The reply goes to the AI, which answers and books.", stat: "Seconds, not hours", href: "/product#missed-calls" },
  { icon: MessageSquare, title: "Lead recovery", body: "Website forms, ads and DMs get an instant first reply, then smart follow-ups timed to what the person said — until they book or say no.", stat: "No enquiry goes cold", href: "/product#leads" },
  { icon: CalendarClock, title: "Slot recovery", body: "When someone cancels, the best-fitting people on your waitlist get the slot offered. First to reply YES is booked automatically.", stat: "Cancellations refilled", href: "/product#slots" },
];

const INDUSTRIES = [
  { icon: Smile, name: "Dental clinics", body: "Fill hygiene and whitening slots, answer insurance questions, text back every missed call." },
  { icon: HeartPulse, name: "Medical & aesthetic clinics", body: "Fast first replies to treatment enquiries; anything clinical goes straight to your team." },
  { icon: Scissors, name: "Hair & beauty salons", body: "Refill last-minute cancellations from your waitlist and follow up price enquiries." },
  { icon: Flower2, name: "Spas & wellness studios", body: "Answer at 10 PM, book packages and remind clients so fewer appointments are missed." },
];

export default async function LandingPage() {
  const plans = await listPlans();
  return (
    <>
      {/* Hero */}
      <section className="pb-20 pt-14 sm:pb-28 sm:pt-20">
        <Container className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div className="landing-rise min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              For clinics, dentists, salons, spas and wellness studios
            </p>
            <h1 className="mt-6 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4rem]">Stop losing bookings you already earned.</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty sm:text-xl">
              AI Front Office texts back every missed call, answers every enquiry in seconds, follows up the ones who go quiet and refills cancelled slots from your waitlist — then shows you exactly how much revenue it brought back.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">
                  Start 14-day free trial <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/product">See how it works</Link>
              </Button>
            </div>
            <p className="mt-5 text-[13px] text-muted-foreground">No card needed. Plans from $59/month. Works with your existing phone, website and booking system.</p>
          </div>
          <div className="mx-auto w-full min-w-0 max-w-md lg:max-w-none">
            <RecoveryDemo />
          </div>
        </Container>
      </section>

      {/* The problem */}
      <section className="border-t bg-surface py-20 sm:py-24">
        <Container>
          <SectionHeading eyebrow="The problem" title="Every unanswered message is a booking you didn't get." description="Small teams are busy doing the actual work. The front desk is where customers fall through the cracks." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROBLEMS.map((p, i) => (
              <div key={p.title} className="landing-rise rounded-xl border bg-background p-6" style={{ animationDelay: `${i * 90}ms` }}>
                <p.icon className="size-5 text-muted-foreground" aria-hidden />
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* What it recovers */}
      <section className="border-t py-20 sm:py-24">
        <Container>
          <SectionHeading eyebrow="What it recovers" title="Three places your revenue leaks — handled automatically." description="Each one runs on its own, within rules you set, and hands anything sensitive to a person." />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {WORKERS.map((w, i) => (
              <Link
                key={w.title}
                href={w.href}
                className="landing-rise group rounded-xl border bg-background p-6 transition-shadow hover:shadow-[0_16px_40px_-24px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                style={{ animationDelay: `${i * 120}ms` }}
              >
                <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary transition-transform group-hover:scale-110">
                  <w.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{w.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{w.body}</p>
                <p className="mt-4 flex items-center gap-1 text-[13px] font-medium text-primary">
                  {w.stat} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </p>
              </Link>
            ))}
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section className="border-t bg-surface py-20 sm:py-24">
        <Container>
          <SectionHeading center eyebrow="How it works" title="It works on top of what you already have." description="No new phone system, no new booking software, no retraining your team." />
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((st, i) => (
              <li key={st.n} className="landing-rise relative rounded-xl border bg-background p-6" style={{ animationDelay: `${i * 120}ms` }}>
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{st.n}</span>
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{st.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{st.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Calculator */}
      <section id="calculator" className="scroll-mt-16 border-t py-20 sm:py-24">
        <Container>
          <SectionHeading center eyebrow="What it's worth" title="What are missed calls and empty slots costing you?" description="Move the sliders to match your week. It takes ten seconds." />
          <div className="mx-auto mt-12 max-w-5xl">
            <RoiCalculator />
          </div>
        </Container>
      </section>

      {/* Who it's for */}
      <section className="border-t bg-surface py-20 sm:py-24">
        <Container>
          <SectionHeading eyebrow="Who it's for" title="Built for appointment-based businesses." description="If your revenue depends on a full calendar, every missed call and empty slot is money left on the table." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {INDUSTRIES.map((x) => (
              <div key={x.name} className="rounded-xl border bg-background p-6">
                <x.icon className="size-5 text-primary" aria-hidden />
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{x.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{x.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Pricing teaser */}
      <section className="border-t py-20 sm:py-24">
        <Container>
          <SectionHeading center eyebrow="Pricing" title="Pays for itself with one recovered booking." description="Simple monthly plans in USD. Every plan includes a monthly allowance of AI conversations and texts." />
          <PlanCards items={plans} compact />
          <p className="mt-8 text-center text-[13px]">
            <Link href="/pricing" className="font-medium text-primary hover:underline">
              Compare plans and see what counts as a conversation →
            </Link>
          </p>
        </Container>
      </section>

      {/* Testimonials placeholder */}
      <section className="border-t bg-surface py-20 sm:py-24">
        <Container>
          <div className="mx-auto max-w-2xl rounded-xl border border-dashed bg-background p-10 text-center">
            <MessageSquare className="mx-auto size-5 text-muted-foreground" aria-hidden />
            <h2 className="mt-4 text-xl font-semibold tracking-tight">Customer stories coming soon</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">We&apos;re a new product, so we won&apos;t show you made-up quotes. Real stories from businesses using AI Front Office will appear here.</p>
          </div>
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
