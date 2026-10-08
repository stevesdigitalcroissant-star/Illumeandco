"use client";
import { useState, useTransition } from "react";
import { resendVerificationAction } from "../(auth)/actions";

export function VerifyEmailBanner({ email }: { email: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="border-b bg-warning-soft px-4 py-2 text-center text-[13px] text-warning lg:px-8">
      Please confirm your email ({email}) — we sent you a link.{" "}
      {msg ?? (
        <button className="font-medium underline underline-offset-2" disabled={pending} onClick={() => start(async () => { const r = await resendVerificationAction(); setMsg(r.ok ? (r.message ?? "Sent.") : r.error); })}>
          {pending ? "Sending…" : "Send it again"}
        </button>
      )}
    </div>
  );
}
