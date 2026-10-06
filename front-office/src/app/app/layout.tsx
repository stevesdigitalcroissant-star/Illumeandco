import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireBusiness } from "@/lib/session";
import { roleCan } from "@/server/context";
import { countNeedsHuman } from "@/server/services/conversations";
import { ONBOARDING_STEPS } from "@/server/services/business";
import { AppShell, type NavItem } from "./shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { ctx, user, business, role, businesses } = await requireBusiness();
  const can = (p: Parameters<typeof roleCan>[1]) => roleCan(role, p);
  const [needsHuman, notes] = await Promise.all([
    countNeedsHuman(ctx),
    db.select().from(notifications).where(eq(notifications.businessId, business.id)).orderBy(desc(notifications.createdAt)).limit(8),
  ]);

  const groups: NavItem[][] = [
    [
      { href: "/app", label: "Overview", icon: "overview" as const },
      { href: "/app/inbox", label: "Inbox", icon: "inbox" as const, badge: needsHuman || undefined, badgeTone: "danger" as const },
      ...(can("business.manage") ? [{ href: "/app/receptionist", label: "AI Receptionist", icon: "receptionist" as const }] : []),
    ],
    [
      ...(can("leads.manage") ? [{ href: "/app/leads", label: "Leads", icon: "leads" as const }, { href: "/app/opportunities", label: "Missed opportunities", icon: "opportunities" as const }] : []),
      { href: "/app/customers", label: "Customers", icon: "customers" as const },
      { href: "/app/appointments", label: "Appointments", icon: "appointments" as const },
      { href: "/app/calendar", label: "Calendar", icon: "calendar" as const },
    ],
    [
      ...(can("business.manage")
        ? [
            { href: "/app/knowledge", label: "Knowledge base", icon: "knowledge" as const },
            { href: "/app/automations", label: "Automations", icon: "automations" as const },
            { href: "/app/reviews", label: "Reviews", icon: "reviews" as const },
          ]
        : []),
      ...(can("analytics.view") ? [{ href: "/app/analytics", label: "Analytics", icon: "analytics" as const }] : []),
      ...(can("audit.view") ? [{ href: "/app/audit", label: "Audit log", icon: "audit" as const }] : []),
    ],
    [
      ...(can("business.manage") ? [{ href: "/app/settings", label: "Settings", icon: "settings" as const }] : []),
      ...(can("billing.manage") ? [{ href: "/app/billing", label: "Billing", icon: "billing" as const }] : []),
    ],
  ];
  const nav = groups.filter((g) => g.length);

  const banner =
    !business.onboardingCompletedAt && can("business.manage") ? (
      <div className="border-b bg-primary-soft px-4 py-2 text-center text-[13px] text-primary lg:px-8">
        Setup is {Math.round(((Math.min(business.onboardingStep, ONBOARDING_STEPS.length + 1) - 1) / ONBOARDING_STEPS.length) * 100)}% complete.{" "}
        <Link href="/onboarding" className="font-medium underline underline-offset-2">Finish setting up your front office →</Link>
      </div>
    ) : null;

  return (
    <AppShell
      nav={nav}
      user={{ name: user.name, email: user.email }}
      business={{ id: business.id, name: business.name, isDemo: business.isDemo }}
      businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
      notifications={notes.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt.toISOString(), read: !!n.readAt }))}
      banner={banner}
    >
      {children}
    </AppShell>
  );
}
