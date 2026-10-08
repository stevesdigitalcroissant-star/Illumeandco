"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { run, str, type ActionResult } from "@/lib/action";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { endSession, getSession, startSession } from "@/lib/session";
import { roleForBusiness, setActiveBusiness, signUp, verifyCredentials } from "@/server/auth";
import { requestPasswordReset, resetPassword, sendVerificationEmail } from "@/server/account";
import { AppError } from "@/server/context";

export async function signupAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ip = clientIp(await headers());
  if (!(await rateLimit(`signup:${ip}`, 10, 3600_000)).ok) return { ok: false, error: "Too many attempts. Please try again later." };
  const r = await run(async () => {
    const { user } = await signUp({ name: str(fd, "name"), email: str(fd, "email"), password: String(fd.get("password") ?? "") });
    await startSession(user.id);
    await sendVerificationEmail(user.id, await baseUrl()).catch(() => false);
  });
  if (!r.ok) return r;
  redirect("/onboarding");
}

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ip = clientIp(await headers());
  const email = str(fd, "email").toLowerCase();
  if (!(await rateLimit(`login:${ip}`, 20, 15 * 60_000)).ok || !(await rateLimit(`login:${email}`, 8, 15 * 60_000)).ok)
    return { ok: false, error: "Too many sign-in attempts. Please wait a few minutes." };
  const user = await verifyCredentials(email, String(fd.get("password") ?? ""));
  if (!user) return { ok: false, error: "Incorrect email or password." };
  await startSession(user.id);
  const next = str(fd, "next");
  redirect(next.startsWith("/app") ? next : "/app");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

export async function switchBusinessAction(businessId: string) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await roleForBusiness(s.user.id, businessId))) throw new AppError("forbidden", "No access to that business");
  await setActiveBusiness(s.token, businessId);
  redirect("/app");
}

async function baseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function forgotPasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ip = clientIp(await headers());
  const email = str(fd, "email").toLowerCase();
  if (!(await rateLimit(`reset:${ip}`, 10, 3600_000)).ok || !(await rateLimit(`reset:${email}`, 3, 3600_000)).ok)
    return { ok: false, error: "Too many requests. Please try again later." };
  const r = await requestPasswordReset(email, await baseUrl());
  if (!r.available) return { ok: false, error: "Password reset by email isn't available yet — please contact your administrator." };
  return { ok: true, message: "If an account exists for that email, we've sent a link to reset your password. It works for 1 hour." };
}

export async function resetPasswordAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ip = clientIp(await headers());
  if (!(await rateLimit(`reset-use:${ip}`, 20, 3600_000)).ok) return { ok: false, error: "Too many attempts. Please try again later." };
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("confirm") ?? "")) return { ok: false, error: "The passwords don't match." };
  const r = await run(() => resetPassword(str(fd, "token"), password));
  if (!r.ok) return r;
  redirect("/login?reset=1");
}

export async function resendVerificationAction(): Promise<ActionResult> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await rateLimit(`verify:${s.user.id}`, 3, 3600_000)).ok) return { ok: false, error: "Please wait a while before asking again." };
  const sent = await sendVerificationEmail(s.user.id, await baseUrl());
  return sent ? { ok: true, message: "Sent — check your inbox." } : { ok: false, error: "Couldn't send the email right now." };
}
