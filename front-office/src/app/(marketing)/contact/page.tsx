import type { Metadata } from "next";
import { Building2, Headphones, LineChart, ShieldCheck } from "lucide-react";
import { LOCATION_OPTIONS } from "@/server/services/sales";
import { CheckList, Container, PageHero } from "../_components/ui";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Custom plans",
  description: "A custom plan for groups, chains and high-volume practices: more locations, higher allowances, onboarding help and a dedicated contact.",
};

const POINTS = [
  { icon: Building2, title: "Any number of locations", body: "One account for every clinic or salon in your group, with each location's numbers kept separate." },
  { icon: LineChart, title: "Allowances sized to you", body: "AI conversations and texts set to your real volume, with pricing that drops as you grow." },
  { icon: Headphones, title: "Hands-on onboarding", body: "We help connect your phone system, booking software and WhatsApp, and train the AI on your information." },
  { icon: ShieldCheck, title: "Priority support", body: "A named contact, faster responses and a monthly review of what was recovered." },
];

export default function ContactPage() {
  return (
    <>
      <PageHero eyebrow="Custom plans" title="Running several locations? Let's build your plan." description="For groups, chains and high-volume practices that need more than Pro. Tell us about your business and we'll come back with a plan and price." />
      <section className="py-16 sm:py-20">
        <Container className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div className="min-w-0 space-y-8">
            {POINTS.map((p) => (
              <div key={p.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><p.icon className="size-5" aria-hidden /></span>
                <div>
                  <h2 className="text-[15px] font-semibold tracking-tight">{p.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                </div>
              </div>
            ))}
            <CheckList items={["Everything in Pro", "Custom allowances and pricing"]} />
          </div>
          <div className="min-w-0">
            <ContactForm locations={LOCATION_OPTIONS} />
          </div>
        </Container>
      </section>
    </>
  );
}
