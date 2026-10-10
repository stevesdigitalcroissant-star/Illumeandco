import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { Container } from "./_components/ui";
import { DesktopNav, MobileNav } from "./_components/nav";
import { NAV } from "./_components/nav-items";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <Container className="relative flex h-16 items-center justify-between gap-6">
          <Link href="/" aria-label="AI Front Office home" className="shrink-0">
            <Logo />
          </Link>
          <DesktopNav />
          <div className="flex items-center gap-2">
            {session ? (
              <Button asChild size="sm" variant="dark">
                <Link href="/app">Open app</Link>
              </Button>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm" variant="dark">
                  <Link href="/signup">Start free</Link>
                </Button>
              </>
            )}
            <MobileNav />
          </div>
        </Container>
      </header>

      <main id="main">{children}</main>

      <footer className="border-t">
        <Container className="grid grid-cols-1 gap-8 py-12 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div className="space-y-2">
            <Logo />
            <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">Revenue recovery for clinics, dentists, salons and spas. Works on top of the tools you already use.</p>
          </div>
          <nav aria-label="Footer — product" className="space-y-2 text-[13px]">
            <p className="font-medium">Product</p>
            <Link href="/" className="block text-muted-foreground hover:text-foreground">Home</Link>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="block text-muted-foreground hover:text-foreground">{n.label}</Link>
            ))}
          </nav>
          <nav aria-label="Footer — account" className="space-y-2 text-[13px]">
            <p className="font-medium">Account</p>
            <Link href="/signup" className="block text-muted-foreground hover:text-foreground">Start free trial</Link>
            <Link href="/contact" className="block text-muted-foreground hover:text-foreground">Contact sales</Link>
            <Link href="/login" className="block text-muted-foreground hover:text-foreground">Sign in</Link>
          </nav>
        </Container>
        <Container className="border-t py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} AI Front Office · Prices in USD, excluding applicable taxes.</span>
        </Container>
      </footer>
    </div>
  );
}
