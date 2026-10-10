"use client";
/** Marketing navigation: highlights the current page; a simple disclosure menu on small screens. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV } from "./nav-items";


export function DesktopNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined} className={cn("text-[13px] transition-colors hover:text-foreground", path === n.href ? "font-medium text-foreground" : "text-muted-foreground")}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"} className="flex size-9 items-center justify-center rounded-md border">
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>
      {open ? (
        <nav id="mobile-nav" aria-label="Main" className="absolute inset-x-0 top-16 border-b bg-background px-5 py-3 shadow-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={path === n.href ? "page" : undefined} className={cn("block rounded-md px-2 py-2.5 text-sm", path === n.href ? "bg-surface font-medium" : "text-muted-foreground")}>
              {n.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
