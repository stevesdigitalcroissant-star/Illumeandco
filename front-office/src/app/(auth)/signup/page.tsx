import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Start free" };

export default async function SignupPage() {
  if (await getSession()) redirect("/app");
  return (
    <div className="rounded-xl border bg-background p-7 shadow-sm">
      <h1 className="text-lg font-semibold">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Set up your AI front office in about ten minutes.</p>
      <AuthForm mode="signup" />
    </div>
  );
}
