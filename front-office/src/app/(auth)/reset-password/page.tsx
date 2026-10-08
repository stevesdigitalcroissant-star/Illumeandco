import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "../simple-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="rounded-xl border bg-background p-7 shadow-sm">
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">You&apos;ll be signed out on all devices.</p>
      {token ? <ResetPasswordForm token={token} /> : <p className="text-sm">This link is incomplete. <Link className="font-medium underline" href="/forgot-password">Request a new one</Link>.</p>}
    </div>
  );
}
