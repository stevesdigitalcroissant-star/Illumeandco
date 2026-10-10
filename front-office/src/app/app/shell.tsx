"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Menu,
  Network,
  Settings,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  TriangleAlert,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogoMark } from "@/components/brand";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { logoutAction, switchBusinessAction } from "../(auth)/actions";
import { markNotificationsReadAction } from "./actions";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; badgeTone?: "danger" | "neutral" };

const ICONS = {
  overview: LayoutDashboard,
  revenue: TrendingUp,
  inbox: Inbox,
  receptionist: Bot,
  leads: Target,
  opportunities: TriangleAlert,
  customers: Users,
  appointments: ListChecks,
  calendar: CalendarDays,
  slots: CalendarClock,
  knowledge: BookOpen,
  automations: Workflow,
  reviews: Star,
  analytics: BarChart3,
  audit: ClipboardList,
  team: Network,
  inquiries: Mail,
  settings: Settings,
  billing: CreditCard,
};

type Notification = { id: string; title: string; body: string | null; link: string | null; createdAt: string; read: boolean };

export function AppShell({
  nav,
  user,
  business,
  businesses,
  notifications,
  banner,
  children,
}: {
  nav: NavItem[][];
  user: { name: string; email: string };
  business: { id: string; name: string; isDemo: boolean };
  businesses: { id: string; name: string }[];
  notifications: Notification[];
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-4">
        <LogoMark className="size-6" />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left text-sm font-semibold hover:bg-muted focus:outline-none">
            {business.name}
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={6} className="z-50 min-w-56 rounded-lg border bg-background p-1 shadow-lg">
              <DropdownMenu.Label className="px-2 py-1.5 text-xs text-muted-foreground">Businesses</DropdownMenu.Label>
              {businesses.map((b) => (
                <DropdownMenu.Item
                  key={b.id}
                  onSelect={() => b.id !== business.id && switchBusinessAction(b.id)}
                  className={cn("cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted", b.id === business.id && "font-medium")}
                >
                  {b.name}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item asChild className="cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted">
                <Link href="/onboarding?new=1">+ Add a business</Link>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {nav.map((group, gi) => (
          <ul key={gi} className="space-y-0.5">
            {group.map((item) => {
              const Icon = ICONS[item.icon];
              const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors",
                      active ? "bg-muted font-medium text-foreground" : "text-foreground/70 hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tabular", item.badgeTone === "danger" ? "bg-danger text-white" : "bg-muted text-foreground/70")}>
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
      </div>
      <div className="border-t p-3">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left hover:bg-muted focus:outline-none">
            <Avatar name={user.name} className="size-7" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{user.name}</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">{user.email}</span>
            </span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content side="top" align="start" sideOffset={6} className="z-50 min-w-52 rounded-lg border bg-background p-1 shadow-lg">
              <DropdownMenu.Item onSelect={() => logoutAction()} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted">
                <LogOut className="size-4" /> Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-background lg:block">{sidebar}</aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r bg-background">{sidebar}</aside>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        {business.isDemo ? (
          <div className="flex items-center justify-center gap-2 bg-foreground px-4 py-1.5 text-center text-[12.5px] text-background">
            <Sparkles className="size-3.5" /> Demo environment — this business contains sample data for exploring the product.
          </div>
        ) : null}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur lg:px-8">
          <button className="rounded-md p-1.5 hover:bg-muted lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <div className="flex-1" />
          <DropdownMenu.Root onOpenChange={(o) => o && unread && markNotificationsReadAction()}>
            <DropdownMenu.Trigger className="relative rounded-md p-2 text-foreground/70 hover:bg-muted hover:text-foreground focus:outline-none" aria-label="Notifications">
              <Bell className="size-[18px]" strokeWidth={1.75} />
              {unread ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger ring-2 ring-background" /> : null}
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-80 rounded-lg border bg-background p-1 shadow-lg">
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground">Notifications</div>
                {notifications.length ? (
                  notifications.map((n) => (
                    <DropdownMenu.Item key={n.id} asChild className="block cursor-pointer rounded-md px-3 py-2 outline-none data-[highlighted]:bg-muted">
                      <Link href={n.link ?? "/app"}>
                        <span className={cn("block text-[13px]", !n.read && "font-medium")}>{n.title}</span>
                        {n.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span> : null}
                      </Link>
                    </DropdownMenu.Item>
                  ))
                ) : (
                  <p className="px-3 pb-3 text-[13px] text-muted-foreground">You&apos;re all caught up.</p>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-7 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
