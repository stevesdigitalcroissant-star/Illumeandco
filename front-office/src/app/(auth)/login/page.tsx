import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/app");
  const { next } = await searchParams;
  return (
    <div className="rounded-xl border bg-background p-7 shadow-sm">
      <h1 className="text-lg font-semibold">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Welcome back to your front office.</p>
      <AuthForm mode="login" next={next} />
    </div>
  );
}
