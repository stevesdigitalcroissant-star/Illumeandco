/** Building blocks shared by the marketing pages. */
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { plans } from "@/db/schema";

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>{children}</div>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-medium text-primary">{children}</p>;
}

export function SectionHeading({ eyebrow, title, description, center, as = "h2" }: { eyebrow?: string; title: string; description?: string; center?: boolean; as?: "h1" | "h2" }) {
  const H = as;
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <H className={cn("mt-2 font-semibold tracking-tight text-balance", as === "h1" ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl")}>{title}</H>
      {description ? <p className="mt-4 text-base leading-relaxed text-muted-foreground text-pretty">{description}</p> : null}
    </div>
  );
}

/** Top of an inner page. */
export function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return (
    <section className="border-b bg-surface pb-16 pt-14 sm:pb-20 sm:pt-20">
      <Container>
        <div className="landing-rise">
          <SectionHeading as="h1" center eyebrow={eyebrow} title={title} description={description} />
        </div>
        {children}
      </Container>
    </section>
  );
}

export function CheckList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((p) => (
        <li key={p} className="flex gap-3 text-sm text-foreground/85">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

export function Feature({ id, eyebrow, title, description, points, illustration, flip }: { id?: string; eyebrow: string; title: string; description: string; points: string[]; illustration: React.ReactNode; flip?: boolean }) {
  return (
    <section id={id} className="scroll-mt-20 border-t py-20 sm:py-24">
      <Container className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div className={cn("min-w-0", flip && "lg:order-2")}>
          <SectionHeading eyebrow={eyebrow} title={title} description={description} />
          <CheckList items={points} className="mt-8" />
        </div>
        <div className={cn("mx-auto w-full min-w-0 max-w-md", flip && "lg:order-1")}>{illustration}</div>
      </Container>
    </section>
  );
}

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y border-y">
      {items.map((f) => (
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
  );
}

export function CtaBand({ title = "Stop losing bookings you already earned.", body = "Set up in about ten minutes. Free for 14 days — no card needed." }: { title?: string; body?: string }) {
  return (
    <section className="border-t py-20 sm:py-28">
      <Container>
        <div className="rounded-2xl bg-foreground px-6 py-14 text-center text-background sm:px-12 sm:py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-background/70">{body}</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90">
              <Link href="/signup">
                Start free <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-background hover:bg-background/10">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

export function formatPrice(cents: number, currency: string) {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

type Plan = typeof plans.$inferSelect;

/** Plan cards, read from the plans table. The allowance lines come first in each plan's feature list. */
export function PlanCards({ items, compact }: { items: Plan[]; compact?: boolean }) {
  if (!items.length) return <p className="mt-12 text-center text-sm text-muted-foreground">Pricing will be published soon.</p>;
  return (
    <div className={cn("mx-auto mt-12 grid grid-cols-1 gap-4", items.length >= 3 ? "lg:grid-cols-3" : items.length === 2 ? "max-w-3xl md:grid-cols-2" : "max-w-sm")}>
      {items.map((p) => (
        <div key={p.id} className={cn("relative flex min-w-0 flex-col rounded-xl border bg-background p-7", p.highlighted && "border-foreground/80 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)]")}>
          {p.highlighted ? <span className="absolute -top-3 left-7 rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-medium text-background">Most popular</span> : null}
          <h3 className="text-[15px] font-semibold">{p.name}</h3>
          {p.description ? <p className="mt-1.5 min-h-10 text-[13px] leading-relaxed text-muted-foreground">{p.description}</p> : null}
          <p className="mt-6 flex items-baseline gap-1">
            <span className="text-4xl font-semibold tracking-tight tabular-nums">{formatPrice(p.priceMonthlyCents, p.currency)}</span>
            <span className="text-[13px] text-muted-foreground">/ month</span>
          </p>
          <Button asChild className="mt-6 w-full" variant={p.highlighted ? "dark" : "outline"}>
            <Link href="/signup">Start 14-day free trial</Link>
          </Button>
          <ul className="mt-7 space-y-2.5 border-t pt-6">
            {(compact ? p.features.slice(0, 4) : p.features).map((f, i) => (
              <li key={f} className={cn("flex gap-2.5 text-[13px] text-foreground/85", i < 2 && "font-medium text-foreground")}>
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {compact && p.features.length > 4 ? (
            <Link href="/pricing" className="mt-4 text-[13px] font-medium text-primary hover:underline">
              + {p.features.length - 4} more
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}
