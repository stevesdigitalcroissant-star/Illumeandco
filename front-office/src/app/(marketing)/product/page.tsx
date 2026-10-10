import type { Metadata } from "next";
import { Bell, Camera, Globe, Lock, Mail, MessageCircle, Phone, PhoneMissed, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnalyticsIllustration, BookingIllustration, FollowUpIllustration, HandoffIllustration } from "../_components/illustrations";
import { CheckList, Container, CtaBand, Feature, PageHero, SectionHeading } from "../_components/ui";

export const metadata: Metadata = {
  title: "Product",
  description: "Missed call recovery, lead recovery, slot recovery, an AI receptionist that books real appointments, and a dashboard that shows the revenue it recovered.",
};

const JUMP = [
  { href: "#missed-calls", label: "Missed calls" },
  { href: "#leads", label: "Leads" },
  { href: "#slots", label: "Cancellations" },
  { href: "#receptionist", label: "AI receptionist" },
  { href: "#revenue", label: "Revenue dashboard" },
  { href: "#integrations", label: "Integrations" },
];

/** Illustrations of how each worker behaves. Example content only — no customer data. */
function MissedCallIllustration() {
  return (
    <div className="space-y-3 rounded-xl border bg-surface p-5" aria-hidden>
      <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-danger-soft text-danger"><PhoneMissed className="size-4" /></span>
        <div><p className="text-[13px] font-medium">Missed call · 1:12 PM</p><p className="text-xs text-muted-foreground">Reception was with a patient</p></div>
      </div>
      <div className="ml-8 max-w-[85%] rounded-2xl rounded-tl-sm bg-primary px-3.5 py-2 text-[13px] text-primary-foreground">Hi, it&apos;s Bright Dental — sorry we missed your call! How can we help?</div>
      <div className="mr-8 ml-auto max-w-[80%] rounded-2xl rounded-tr-sm border bg-background px-3.5 py-2 text-[13px]">Do you have anything for a cleaning this week?</div>
      <div className="ml-8 max-w-[85%] rounded-2xl rounded-tl-sm bg-primary px-3.5 py-2 text-[13px] text-primary-foreground">Yes — Thursday 4:30 PM or Friday 10:00 AM. Which suits you?</div>
      <p className="text-center text-[11px] text-muted-foreground">Example conversation</p>
    </div>
  );
}

function SlotIllustration() {
  const rows = [
    { name: "Waitlist · wants mornings", why: "Waiting 6 days · cleaning", score: "Best fit" },
    { name: "Waitlist · flexible", why: "Waiting 3 days · cleaning", score: "Good fit" },
    { name: "Waitlist · any day", why: "Waiting 1 day · check-up", score: "Fit" },
  ];
  return (
    <div className="rounded-xl border bg-surface p-5" aria-hidden>
      <div className="rounded-lg border bg-background px-3 py-2.5">
        <p className="text-[13px] font-medium">Cancellation · Fri 10:00 AM</p>
        <p className="text-xs text-muted-foreground">45 min cleaning — slot is now open</p>
      </div>
      <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Offered to the top 3</p>
      <ul className="mt-2 space-y-2">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2">
            <div className="min-w-0"><p className="truncate text-[13px]">{r.name}</p><p className="text-xs text-muted-foreground">{r.why}</p></div>
            <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium", i === 0 ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{i === 0 ? "Replied YES · booked" : r.score}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">Example</p>
    </div>
  );
}

const INTEGRATIONS: { icon: typeof Globe; name: string; status: string; tone: "live" | "setup" | "soon" }[] = [
  { icon: Globe, name: "Website chat", status: "Available now", tone: "live" },
  { icon: Smartphone, name: "SMS", status: "From your business number", tone: "setup" },
  { icon: MessageCircle, name: "WhatsApp", status: "Needs WhatsApp Business approval", tone: "setup" },
  { icon: Mail, name: "Email", status: "From your business address", tone: "setup" },
  { icon: Phone, name: "Missed calls from your phone system", status: "Twilio, or any system via webhook", tone: "setup" },
  { icon: Globe, name: "Website forms & lead ads", status: "Webhook, Zapier or Make", tone: "setup" },
  { icon: Camera, name: "Instagram DMs", status: "Coming soon", tone: "soon" },
  { icon: Phone, name: "AI voice answering", status: "Coming soon", tone: "soon" },
];

const CONTROLS = [
  { icon: ShieldCheck, title: "You set the rules", body: "Turn each action on or off: answering, booking, rescheduling, cancelling, follow-ups. Refunds and price changes are never available to the AI." },
  { icon: UserRound, title: "A person when it matters", body: "Complaints, medical questions or a customer asking for a human go straight to your team with the full conversation." },
  { icon: Bell, title: "Alerts that reach you", body: "Urgent items are texted or emailed to your team during the day, with a morning summary of what needs you and what was recovered." },
  { icon: Lock, title: "Your data stays yours", body: "Each business's data is kept strictly separate. Customers can opt out of messages at any time with STOP." },
];

export default function ProductPage() {
  return (
    <>
      <PageHero eyebrow="Product" title="Everything that turns lost enquiries back into bookings." description="Three recovery workers, an AI receptionist that books real appointments, and a dashboard that shows the money it brought back.">
        <nav aria-label="On this page" className="mt-10 flex flex-wrap justify-center gap-2">
          {JUMP.map((j) => (
            <a key={j.href} href={j.href} className="rounded-full border bg-background px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
              {j.label}
            </a>
          ))}
        </nav>
      </PageHero>

      <Feature
        id="missed-calls"
        eyebrow="Missed call recovery"
        title="Every missed call gets a text back in seconds."
        description="When nobody can pick up, the caller gets a friendly text from your number. Their reply goes to the AI, which answers questions and books them in — or alerts your team if a person is needed."
        points={[
          "Works with Twilio or any phone system that can send a webhook",
          "Never texts the same caller twice in one day, and never someone who opted out",
          "No reply? Your team is asked to call them back",
          "If the text can't go out, your team gets a call-back alert instead",
        ]}
        illustration={<MissedCallIllustration />}
      />

      <Feature
        id="leads"
        flip
        eyebrow="Lead recovery"
        title="An instant first reply, then follow-ups until they book."
        description="New enquiries from your website, forms and ads get a first message within seconds. If they go quiet, the AI follows up at the right time — and stops the moment they reply, book or opt out."
        points={[
          "Each enquiry is matched to an existing customer or added as a new lead",
          "Follow-ups timed to the conversation — not a fixed drip sequence",
          "Never messages someone a team member is already talking to",
          "Every lead has a clear status, from new enquiry to booked",
        ]}
        illustration={<FollowUpIllustration />}
      />

      <Feature
        id="slots"
        eyebrow="Slot recovery"
        title="Cancellations refilled from your waitlist."
        description="When an appointment is cancelled or rescheduled, the slot is offered to the people on your waitlist who fit it best. The first to reply YES is booked automatically — no double bookings, ever."
        points={[
          "Ranked by service, preferred times, value and how long they've waited",
          "Offers go out in small batches, so nobody is spammed",
          "Replies of YES or NO are handled instantly; anything else goes to the AI",
          "Late replies are told politely that the slot has gone",
        ]}
        illustration={<SlotIllustration />}
      />

      <section id="receptionist" className="scroll-mt-20 border-t bg-surface py-20 sm:py-24">
        <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div className="min-w-0">
            <SectionHeading eyebrow="AI receptionist" title="Answers like your best front-desk person." description="It knows your services, prices, opening hours and policies, and replies instantly in your tone — on your website, by text, WhatsApp or email." />
            <CheckList className="mt-8" items={["Answers from your own business information — never invents prices or policies", "Your name, tone, greeting and languages", "Captures name and contact details as it goes", "Every action it takes is recorded in the activity log"]} />
          </div>
          <div className="mx-auto w-full min-w-0 max-w-md">
            <BookingIllustration />
          </div>
        </Container>
      </section>

      <Feature
        flip
        eyebrow="Human handoff"
        title="Knows when to hand it to a person."
        description="Complaints, refunds, medical questions or anything outside its permissions go straight to your team, with the full conversation and the reason."
        points={["Customers can ask for a human at any time", "Take over a conversation with one click", "Return it to the AI when you're done"]}
        illustration={<HandoffIllustration />}
      />

      <Feature
        id="revenue"
        eyebrow="Revenue dashboard"
        title="See the money it brought back — honestly counted."
        description="A booking only counts as recovered when one of our messages went out before it. You see what was identified, what was booked, and what was actually completed."
        points={["Recovered revenue by worker: missed calls, leads, slots", "Completed appointments shown separately from bookings", "A feed of what needs your team today"]}
        illustration={<AnalyticsIllustration />}
      />

      <section id="integrations" className="scroll-mt-20 border-t bg-surface py-20 sm:py-24">
        <Container>
          <SectionHeading eyebrow="Integrations" title="Works on top of the tools you already use." description="Start with website chat today, then connect your phone line, forms and messaging channels." />
          <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {INTEGRATIONS.map((i) => (
              <li key={i.name} className="flex items-center gap-4 rounded-xl border bg-background p-5">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border bg-surface">
                  <i.icon className="size-[18px] text-foreground/80" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{i.name}</p>
                  <p className={cn("mt-0.5 text-[13px]", i.tone === "live" ? "text-success" : i.tone === "setup" ? "text-foreground/70" : "text-muted-foreground")}>{i.status}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[13px] text-muted-foreground">Website chat works on day one. Text, WhatsApp and email are connected during setup. Instagram and voice are not available yet — we&apos;ll say so in the app, too.</p>
        </Container>
      </section>

      <section className="border-t py-20 sm:py-24">
        <Container>
          <SectionHeading center eyebrow="Control & trust" title="Automatic, but never out of your hands." />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CONTROLS.map((c) => (
              <div key={c.title} className="rounded-xl border bg-background p-6">
                <c.icon className="size-5 text-primary" aria-hidden />
                <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{c.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <CtaBand />
    </>
  );
}
