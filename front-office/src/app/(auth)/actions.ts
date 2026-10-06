"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { run, str, type ActionResult } from "@/lib/action";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { endSession, getSession, startSession } from "@/lib/session";
import { roleForBusiness, setActiveBusiness, signUp, verifyCredentials } from "@/server/auth";
import { AppError } from "@/server/context";

export async function signupAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ip = clientIp(await headers());
  if (!rateLimit(`signup:${ip}`, 10, 3600_000).ok) return { ok: false, error: "Too many attempts. Please try again later." };
  const r = await run(async () => {
    const { user } = await signUp({ name: str(fd, "name"), email: str(fd, "email"), password: String(fd.get("password") ?? "") });
    await startSession(user.id);
  });
  if (!r.ok) return r;
  redirect("/onboarding");
}

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ip = clientIp(await headers());
  const email = str(fd, "email").toLowerCase();
  if (!rateLimit(`login:${ip}`, 20, 15 * 60_000).ok || !rateLimit(`login:${email}`, 8, 15 * 60_000).ok)
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
