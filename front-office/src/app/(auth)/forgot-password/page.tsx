import type { Metadata } from "next";
import { ForgotPasswordForm } from "../simple-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="rounded-xl border bg-background p-7 shadow-sm">
      <h1 className="text-lg font-semibold">Forgot your password?</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">Enter your email and we&apos;ll send you a link to choose a new one.</p>
      <ForgotPasswordForm />
    </div>
  );
}
