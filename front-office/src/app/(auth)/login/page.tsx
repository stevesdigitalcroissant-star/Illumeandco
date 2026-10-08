import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  if (await getSession()) redirect("/app");
  const { next, reset } = await searchParams;
  return (
    <div className="rounded-xl border bg-background p-7 shadow-sm">
      <h1 className="text-lg font-semibold">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Welcome back to your front office.</p>
      {reset ? <p className="mb-4 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-[13px] text-success">Your password was changed. Sign in with the new one.</p> : null}
      <AuthForm mode="login" next={next} />
    </div>
  );
}
