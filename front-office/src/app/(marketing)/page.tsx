import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Globe,
  Camera,
  CalendarClock,
  CalendarX,
  Mail,
  MessageCircle,
  MessageSquare,
  MoonStar,
  Phone,
  PhoneMissed,
  Repeat,
  Smartphone,
} from "lucide-react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { listPlans } from "@/server/services/billing";
import {
  AnalyticsIllustration,
  BookingIllustration,
  FollowUpIllustration,
  HandoffIllustration,
} from "./_components/illustrations";
import { RecoveryDemo } from "./_components/recovery-demo";
import { RoiCalculator } from "./_components/roi-calculator";

// Pricing is read from the database on every request (the DB is not available at build time).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "AI Front Office — Recover the bookings you're losing" },
  description: "Missed calls texted back in seconds, every enquiry answered and followed up, cancellations refilled from your waitlist — and the revenue it recovers, shown in your dashboard.",
};

const NAV = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#calculator", label: "What it's worth" },
  { href: "#integrations", label: "Integrations" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

function formatPrice(cents: number, currency: string) {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>{children}</div>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-medium text-primary">{children}</p>;
}

function SectionHeading({ eyebrow, title, description, center }: { eyebrow?: string; title: string; description?: string; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {description ? <p className="mt-4 text-base leading-relaxed text-muted-foreground text-pretty">{description}</p> : null}
    </div>
  );
}

function Feature({
  id,
  eyebrow,
  title,
  description,
  points,
  illustration,
  flip,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  illustration: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t py-20 sm:py-24">
      <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div className={cn(flip && "lg:order-2")}>
          <SectionHeading eyebrow={eyebrow} title={title} description={description} />
          <ul className="mt-8 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex gap-3 text-sm text-foreground/85">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={cn("mx-auto w-full max-w-md", flip && "lg:order-1")}>{illustration}</div>
      </Container>
    </section>
  );
}

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
  { icon: PhoneMissed, title: "Missed call recovery", body: "Every unanswered call gets a text within seconds: “Sorry we missed you — how can we help?” The reply goes to the AI, which answers and books.", stat: "Seconds, not hours" },
  { icon: MessageSquare, title: "Lead recovery", body: "Website forms, ads and DMs get an instant first reply, then smart follow-ups timed to what the person said — until they book or say no.", stat: "No enquiry goes cold" },
  { icon: CalendarClock, title: "Slot recovery", body: "When someone cancels, the best-fitting people on your waitlist get the slot offered. First to reply YES is booked automatically.", stat: "Cancellations refilled" },
];

const INTEGRATIONS: { icon: typeof Globe; name: string; status: string; tone: "live" | "setup" | "soon" }[] = [
  { icon: Globe, name: "Website chat", status: "Available now", tone: "live" },
  { icon: MessageCircle, name: "WhatsApp", status: "Connect with Twilio", tone: "setup" },
  { icon: Smartphone, name: "SMS", status: "Connect with Twilio", tone: "setup" },
  { icon: Mail, name: "Email", status: "Connect with Resend", tone: "setup" },
  { icon: Camera, name: "Instagram", status: "Coming soon", tone: "soon" },
  { icon: Phone, name: "Voice", status: "Coming soon", tone: "soon" },
];

const FAQS = [
  {
    q: "Will the AI make things up about my business?",
    a: "The receptionist answers from the information you give it — your services, prices, opening hours, policies and FAQs. When it doesn't know something, it says so and hands the conversation to your team instead of guessing.",
  },
  {
    q: "What can the AI do on its own?",
    a: "You decide. Answering questions, capturing leads, booking, rescheduling and cancelling are on by default and can each be switched off. Refunds and price changes are never available to the AI.",
  },
  {
    q: "How does booking work?",
    a: "AI Front Office includes its own calendar. You add services, staff and opening hours, and the AI only offers times that are genuinely free. Every booking appears in your calendar and the activity log.",
  },
  {
    q: "Can I take over a conversation?",
    a: "Yes. Any conversation can be taken over by a person at any time, and the AI hands off automatically when a customer asks for a human or when a request is outside what it's allowed to do.",
  },
  {
    q: "Do I have to change my phone system or booking software?",
    a: "No. AI Front Office works on top of what you already use: your phone system reports missed calls, your website and forms send new enquiries, and it can use its own calendar or hand bookings to your team for your existing system.",
  },
  {
    q: "How do I know it's actually making me money?",
    a: "The revenue dashboard only counts a booking as recovered when one of our messages went out before it — a missed-call text, a first reply, a follow-up or a slot offer — and shows separately which of those appointments were actually completed.",
  },
  {
    q: "Which channels are supported?",
    a: "Website chat works out of the box. SMS and WhatsApp connect through Twilio, and email through Resend. Instagram and AI voice answering are not available yet.",
  },
  {
    q: "How long does setup take?",
    a: "Most businesses finish the guided setup in about ten minutes: business details, opening hours, services, staff, FAQs and policies. You can skip any step and come back later.",
  },
];

export default async function LandingPage() {
  const [plans, session] = await Promise.all([listPlans(), getSession()]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Skip to content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-transparent bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <Container className="flex h-16 items-center justify-between gap-6">
          <Link href="/" aria-label="AI Front Office home" className="shrink-0">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {session ? (
              <Button asChild size="sm" variant="dark">
                <Link href="/app">Open app</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm" variant="dark">
                  <Link href="/signup">Start free</Link>
                </Button>
              </>
            )}
          </div>
        </Container>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="pb-20 pt-14 sm:pb-28 sm:pt-20">
          <Container className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                For clinics, dentists, salons, spas and wellness studios
              </p>
              <h1 className="mt-6 text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4rem]">
                Stop losing bookings you already earned.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty sm:text-xl">
                AI Front Office texts back every missed call, answers every enquiry in seconds, follows up the ones who go quiet and refills cancelled slots from your waitlist — then shows you exactly how much revenue it brought back.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/signup">
                    Start Free <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#how-it-works">See How It Works</a>
                </Button>
              </div>
              <p className="mt-5 text-[13px] text-muted-foreground">Works with your existing phone, website and booking system. Set up in about ten minutes.</p>
            </div>
            <div className="mx-auto w-full min-w-0 max-w-md lg:max-w-none">
              <RecoveryDemo />
            </div>
          </Container>
        </section>

        {/* 1. Problem */}
        <section className="border-t bg-surface py-20 sm:py-24">
          <Container>
            <SectionHeading
              eyebrow="The problem"
              title="Every unanswered message is a booking you didn't get."
              description="Small teams are busy doing the actual work. The front desk is where customers fall through the cracks."
            />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PROBLEMS.map((p) => (
                <div key={p.title} className="rounded-xl border bg-background p-6">
                  <p.icon className="size-5 text-muted-foreground" aria-hidden />
                  <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-16 border-t py-20 sm:py-24">
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

        {/* What it recovers */}
        <section className="border-t bg-surface py-20 sm:py-24">
          <Container>
            <SectionHeading eyebrow="What it recovers" title="Three places your revenue leaks — handled automatically." description="Each one runs on its own, within rules you set, and hands anything sensitive to a person." />
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {WORKERS.map((w, i) => (
                <div key={w.title} className="landing-rise group rounded-xl border bg-background p-6 transition-shadow hover:shadow-[0_16px_40px_-24px_rgba(0,0,0,0.35)]" style={{ animationDelay: `${i * 120}ms` }}>
                  <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary-soft text-primary transition-transform group-hover:scale-110">
                    <w.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{w.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{w.body}</p>
                  <p className="mt-4 text-[13px] font-medium text-primary">{w.stat}</p>
                </div>
              ))}
            </div>
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

        {/* 2–6. Product */}
        <div id="features" className="scroll-mt-16">
          <section className="border-t py-20 sm:py-24">
            <Container className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
              <div>
                <SectionHeading
                  eyebrow="AI receptionist"
                  title="Answers like your best front-desk person."
                  description="Your receptionist knows your services, prices, opening hours and policies. It replies instantly, in your tone, any time of day."
                />
                <ul className="mt-8 space-y-3">
                  {[
                    "Answers from your own business information — never invents prices or policies",
                    "Your name, tone, greeting and languages",
                    "Captures name and contact details as it goes",
                    "Every action it takes is recorded in the activity log",
                  ].map((p) => (
                    <li key={p} className="flex gap-3 text-sm text-foreground/85">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mx-auto w-full max-w-md">
                <div className="rounded-xl border bg-surface p-6">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">What it knows</p>
                  <ul className="mt-4 grid grid-cols-2 gap-2.5 text-[13px]">
                    {["Services & prices", "Opening hours", "Staff", "Policies", "FAQs", "Your website"].map((k) => (
                      <li key={k} className="rounded-md border bg-background px-3 py-2">{k}</li>
                    ))}
                  </ul>
                  <p className="mt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">What it&apos;s allowed to do</p>
                  <ul className="mt-4 space-y-2 text-[13px]">
                    {[
                      ["Answer questions", true],
                      ["Book, reschedule, cancel", true],
                      ["Issue refunds", false],
                      ["Change prices", false],
                    ].map(([label, on]) => (
                      <li key={String(label)} className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                        <span>{label}</span>
                        <span className={cn("text-xs font-medium", on ? "text-success" : "text-muted-foreground")}>{on ? "Allowed" : "Never"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Container>
          </section>

          <Feature
            flip
            eyebrow="Lead follow-up"
            title="Nobody goes quiet without a follow-up."
            description="When an enquiry stalls, the AI checks in at the time and in the style you choose — and stops the moment they reply, book or opt out."
            points={["Every enquiry becomes a lead with a clear status", "Follow-ups you can switch off or tune at any time", "Missed opportunities surfaced so your team can act"]}
            illustration={<FollowUpIllustration />}
          />

          <Feature
            eyebrow="Appointment booking"
            title="Books real appointments in real time."
            description="The AI only offers times that are actually free — across your opening hours, staff schedules and service durations — then books straight into your calendar."
            points={["Built-in calendar, ready from day one", "Reschedules and cancellations handled in the conversation", "Confirmations and reminders to cut no-shows"]}
            illustration={<BookingIllustration />}
          />

          <Feature
            flip
            eyebrow="Human handoff"
            title="Knows when to hand it to a person."
            description="Complaints, refunds, medical questions or anything outside its permissions go straight to your team, with the full conversation and the reason."
            points={["Customers can ask for a human at any time", "Take over a conversation with one click", "Return it to the AI when you're done"]}
            illustration={<HandoffIllustration />}
          />

          <Feature
            eyebrow="Analytics"
            title="See what your front office actually did."
            description="Conversations, leads, bookings and handoffs — measured from real activity in your account, so you know what the AI is worth to you."
            points={["Bookings made by the AI vs. your team", "Lead conversion over time", "A full audit log of every AI action"]}
            illustration={<AnalyticsIllustration />}
          />
        </div>

        {/* 7. Integrations */}
        <section id="integrations" className="scroll-mt-16 border-t bg-surface py-20 sm:py-24">
          <Container>
            <SectionHeading
              eyebrow="Integrations"
              title="Meet customers where they already are."
              description="Start with website chat today. Add messaging channels by connecting your own provider accounts."
            />
            <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {INTEGRATIONS.map((i) => (
                <li key={i.name} className="flex items-center gap-4 rounded-xl border bg-background p-5">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border bg-surface">
                    <i.icon className="size-[18px] text-foreground/80" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{i.name}</p>
                    <p
                      className={cn(
                        "mt-0.5 text-[13px]",
                        i.tone === "live" ? "text-success" : i.tone === "setup" ? "text-foreground/70" : "text-muted-foreground",
                      )}
                    >
                      {i.status}
                    </p>
                  </div>
                  {i.tone === "live" ? <span className="size-2 rounded-full bg-success" aria-hidden /> : null}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[13px] text-muted-foreground">
              Twilio and Resend require your own accounts. Instagram and voice are not available yet — we&apos;ll say so in the app, too.
            </p>
          </Container>
        </section>

        {/* 8. Testimonials placeholder */}
        <section className="border-t py-20 sm:py-24">
          <Container>
            <div className="mx-auto max-w-2xl rounded-xl border border-dashed p-10 text-center">
              <MessageSquare className="mx-auto size-5 text-muted-foreground" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold tracking-tight">Customer stories coming soon</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                We&apos;re a new product, so we won&apos;t show you made-up quotes. Real stories from businesses using AI Front Office will appear here.
              </p>
            </div>
          </Container>
        </section>

        {/* 9. Pricing */}
        <section id="pricing" className="scroll-mt-16 border-t bg-surface py-20 sm:py-24">
          <Container>
            <SectionHeading center eyebrow="Pricing" title="Simple monthly pricing." description="Start free. Upgrade when your front office is ready to go live." />
            {plans.length ? (
              <div className={cn("mx-auto mt-12 grid gap-4", plans.length >= 3 ? "lg:grid-cols-3" : plans.length === 2 ? "max-w-3xl md:grid-cols-2" : "max-w-sm")}>
                {plans.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "relative flex flex-col rounded-xl border bg-background p-7",
                      p.highlighted && "border-foreground/80 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)]",
                    )}
                  >
                    {p.highlighted ? (
                      <span className="absolute -top-3 left-7 rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-medium text-background">Most popular</span>
                    ) : null}
                    <h3 className="text-[15px] font-semibold">{p.name}</h3>
                    {p.description ? <p className="mt-1.5 min-h-10 text-[13px] leading-relaxed text-muted-foreground">{p.description}</p> : null}
                    <p className="mt-6 flex items-baseline gap-1">
                      <span className="text-4xl font-semibold tracking-tight tabular-nums">{formatPrice(p.priceMonthlyCents, p.currency)}</span>
                      <span className="text-[13px] text-muted-foreground">/ month</span>
                    </p>
                    <Button asChild className="mt-6 w-full" variant={p.highlighted ? "dark" : "outline"}>
                      <Link href="/signup">Start free</Link>
                    </Button>
                    <ul className="mt-7 space-y-2.5 border-t pt-6">
                      {p.features.map((f) => (
                        <li key={f} className="flex gap-2.5 text-[13px] text-foreground/85">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-12 text-center text-sm text-muted-foreground">Pricing will be published soon.</p>
            )}
          </Container>
        </section>

        {/* 10. FAQ */}
        <section id="faq" className="scroll-mt-16 border-t py-20 sm:py-24">
          <Container className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
            <SectionHeading eyebrow="FAQ" title="Questions, answered." description="Anything else? Sign up and look around — no setup is permanent." />
            <div className="divide-y border-y">
              {FAQS.map((f) => (
                <details key={f.q} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-md py-4 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="relative size-4 shrink-0 text-muted-foreground" aria-hidden>
                      <span className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 bg-current" />
                      <span className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-current transition-transform group-open:scale-y-0" />
                    </span>
                  </summary>
                  <p className="pb-5 pr-10 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </Container>
        </section>

        {/* 11. Final CTA */}
        <section className="border-t py-20 sm:py-28">
          <Container>
            <div className="rounded-2xl bg-foreground px-6 py-14 text-center text-background sm:px-12 sm:py-20">
              <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Never miss another customer.</h2>
              <p className="mx-auto mt-4 max-w-xl text-base text-background/70">
                Set up your AI front office in about ten minutes. Answer, book and follow up — automatically.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90">
                  <Link href="/signup">
                    Start Free <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="text-background hover:bg-background/10">
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            </div>
          </Container>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t">
        <Container className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Logo />
            <p className="text-[13px] text-muted-foreground">An AI receptionist for appointment-based businesses.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted-foreground">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-foreground">{n.label}</a>
            ))}
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/signup" className="hover:text-foreground">Start free</Link>
          </nav>
        </Container>
        <Container className="border-t py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} AI Front Office</span>
        </Container>
      </footer>
    </div>
  );
}
