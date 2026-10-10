import { redirect } from "next/navigation";
import { COUNTRY_OPTIONS, defaultCurrency } from "@/lib/countries";
import { requireBusiness, requireUser } from "@/lib/session";
import { AI_PERMISSION_LABELS } from "@/server/ai/permissions";
import { listAccessibleBusinesses } from "@/server/auth";
import { roleCan } from "@/server/context";
import { BUSINESS_TYPES } from "@/server/defaults";
import { getAgent, getAiSettings, getBusinessHours, ONBOARDING_STEPS } from "@/server/services/business";
import { listServices, listStaff } from "@/server/services/catalog";
import { listSources, parseFaqs } from "@/server/services/knowledge";
import { ServicesStep, StaffStep } from "./catalog-steps";
import { FaqStep } from "./faq-step";
import { FAQ_SOURCE_TITLE, NEVER_PERMISSIONS, ONBOARDING_PERMISSIONS } from "./options";
import {
  CalendarStep,
  HoursStep,
  LocationStep,
  NameStep,
  PoliciesStep,
  ReceptionistStep,
  TypeStep,
} from "./step-forms";
import { StepProgress } from "./wizard";

export const dynamic = "force-dynamic";

const STEP_COPY: Record<number, { title: string; description: string }> = {
  1: { title: "What's your business called?", description: "This is the name your AI receptionist will use with customers." },
  2: { title: "What kind of business is it?", description: "We use this to tailor the receptionist's defaults — for example, extra care with medical questions." },
  3: { title: "Where are you located?", description: "Your timezone and currency are used for every booking and price the AI mentions." },
  4: { title: "When are you open?", description: "The AI only offers appointments inside these hours." },
  5: { title: "What services do you offer?", description: "The AI uses these to answer pricing questions and to book the right amount of time." },
  6: { title: "Who's on your team?", description: "Add the people customers can be booked with." },
  7: { title: "Frequently asked questions", description: "Answers the AI can give word for word. Add the questions you hear most often." },
  8: { title: "Your policies", description: "The AI shares these when customers ask, and follows them when booking." },
  9: { title: "Calendar & booking system", description: "Where appointments booked by the AI are stored." },
  10: { title: "Configure your AI receptionist", description: "Give it a name and a voice, and decide what it's allowed to do." },
};

function timezones() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string; new?: string }> }) {
  const sp = await searchParams;
  const { user } = await requireUser();
  const list = await listAccessibleBusinesses(user.id);
  const total = ONBOARDING_STEPS.length;

  // Step 1 for a brand-new business (first business, or ?new=1 for an additional one).
  if (!list.length || sp.new === "1") {
    return (
      <StepProgress step={1} total={total} labels={[...ONBOARDING_STEPS]} {...STEP_COPY[1]!}>
        <NameStep mode="create" cancelHref={list.length ? "/app" : undefined} />
      </StepProgress>
    );
  }

  const { ctx, business, role } = await requireBusiness();
  if (!roleCan(role, "business.manage")) redirect("/app");

  const requested = Number(sp.step);
  if (!sp.step && business.onboardingCompletedAt) redirect("/app");
  const step = Number.isInteger(requested) && requested >= 1 && requested <= total ? requested : Math.min(Math.max(business.onboardingStep, 1), total);
  const copy = STEP_COPY[step]!;

  let body: React.ReactNode;
  switch (step) {
    case 1:
      body = <NameStep mode="rename" defaultName={business.name} />;
      break;
    case 2:
      body = <TypeStep current={business.type} types={BUSINESS_TYPES.map((t) => ({ value: t.value, label: t.label }))} />;
      break;
    case 3:
      body = (
        <LocationStep
          timezones={timezones()}
          countries={COUNTRY_OPTIONS.map((c) => ({ ...c, currency: defaultCurrency(c.code) }))}
          business={{
            address: business.address,
            city: business.city,
            country: business.country,
            countryCode: business.countryCode,
            timezone: business.timezone,
            currency: business.currency,
            phone: business.phone,
            email: business.email ?? user.email,
            website: business.website,
          }}
          // A brand-new business defaults to UTC; guess the owner's timezone in the browser instead.
          guessTimezone={business.onboardingStep <= 3 && business.timezone === "UTC"}
        />
      );
      break;
    case 4: {
      const hours = await getBusinessHours(ctx);
      body = <HoursStep hours={hours.map((h) => ({ weekday: h.weekday, openTime: h.openTime.slice(0, 5), closeTime: h.closeTime.slice(0, 5) }))} />;
      break;
    }
    case 5: {
      const [services, staff] = await Promise.all([listServices(ctx), listStaff(ctx)]);
      body = (
        <ServicesStep
          currency={business.currency}
          staff={staff.map((s) => ({ id: s.id, name: s.name }))}
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            priceCents: s.priceCents,
            priceIsFrom: s.priceIsFrom,
            durationMinutes: s.durationMinutes,
            onlineBookingEnabled: s.onlineBookingEnabled,
            staffIds: s.staffIds,
          }))}
        />
      );
      break;
    }
    case 6: {
      const staff = await listStaff(ctx);
      body = <StaffStep staff={staff.map((s) => ({ id: s.id, name: s.name, title: s.title, email: s.email, phone: s.phone }))} />;
      break;
    }
    case 7: {
      const source = (await listSources(ctx)).find((s) => s.kind === "faq" && s.title === FAQ_SOURCE_TITLE);
      body = <FaqStep initial={source?.content ? parseFaqs(source.content) : []} />;
      break;
    }
    case 8:
      body = <PoliciesStep policies={business.policies} />;
      break;
    case 9:
      body = <CalendarStep />;
      break;
    case 10: {
      const [agent, settings] = await Promise.all([getAgent(ctx), getAiSettings(ctx)]);
      // Before the owner has saved this step, show the onboarding defaults (all on).
      const firstVisit = business.onboardingStep <= 10 && !business.onboardingCompletedAt;
      body = (
        <ReceptionistStep
          agent={{ name: agent.name, tone: agent.tone, greeting: agent.greeting, emojiUsage: agent.emojiUsage, languages: agent.languages }}
          businessName={business.name}
          permissions={[
            ...ONBOARDING_PERMISSIONS.map((k) => ({
              key: k,
              label: AI_PERMISSION_LABELS[k].label,
              description: AI_PERMISSION_LABELS[k].description,
              on: firstVisit ? true : settings.permissions[k],
              locked: false,
            })),
            ...NEVER_PERMISSIONS.map((k) => ({
              key: k,
              label: AI_PERMISSION_LABELS[k].label,
              description: AI_PERMISSION_LABELS[k].description,
              on: false,
              locked: true,
            })),
          ]}
        />
      );
      break;
    }
  }

  return (
    <StepProgress step={step} total={total} labels={[...ONBOARDING_STEPS]} reached={Math.min(business.onboardingStep, total)} {...copy}>
      {body}
    </StepProgress>
  );
}
