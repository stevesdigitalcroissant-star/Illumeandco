import type { Metadata } from "next";
import Link from "next/link";
import { verifyEmail } from "@/server/account";

export const metadata: Metadata = { title: "Confirm your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token ? await verifyEmail(token) : false;
  return (
    <div className="rounded-xl border bg-background p-7 shadow-sm">
      <h1 className="text-lg font-semibold">{ok ? "Email confirmed" : "This link didn't work"}</h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        {ok ? "Thanks — your email address is confirmed." : "It may have expired or already been used. You can send a new one from the dashboard."}
      </p>
      <Link className="text-sm font-medium underline" href="/app">Go to your dashboard</Link>
    </div>
  );
}
