import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { logoutAction } from "../(auth)/actions";

export const metadata: Metadata = { title: "Set up your front office" };

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between px-6 py-5">
        <Link href="/" aria-label="AI Front Office home"><Logo /></Link>
        <form action={logoutAction}>
          <button type="submit" className="text-[13px] text-muted-foreground hover:text-foreground">Sign out</button>
        </form>
      </header>
      <main className="flex flex-1 justify-center px-4 pb-20 pt-[4vh]">
        <div className="w-full max-w-[640px]">{children}</div>
      </main>
    </div>
  );
}
