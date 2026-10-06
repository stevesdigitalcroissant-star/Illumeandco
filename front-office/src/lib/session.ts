/** Next.js glue for sessions and tenant resolution (server-only). */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import {
  createSession,
  invalidateSession,
  listAccessibleBusinesses,
  SESSION_COOKIE,
  validateSessionToken,
} from "@/server/auth";
import { roleCan, type Ctx, type Permission, type Role } from "@/server/context";

export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await validateSessionToken(token);
  return s ? { ...s, token } : null;
});

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/**
 * Resolve the signed-in user's active business. The business id comes from
 * the server-side session and is re-checked against organization membership
 * on every request — never from the client.
 */
export const requireBusiness = cache(async () => {
  const s = await requireUser();
  const list = await listAccessibleBusinesses(s.user.id);
  if (!list.length) redirect("/onboarding");
  const active = list.find((b) => b.id === s.session.activeBusinessId) ?? list[0]!;
  const business = await db.query.businesses.findFirst({ where: eq(businesses.id, active.id) });
  if (!business) redirect("/onboarding");
  const role = active.role as Role;
  const ctx: Ctx = { businessId: business.id, actor: { type: "user", userId: s.user.id, name: s.user.name, role } };
  return { ctx, user: s.user, business, role, businesses: list, token: s.token };
});

export async function requirePermission(permission: Permission) {
  const r = await requireBusiness();
  if (!roleCan(r.role, permission)) redirect("/app?denied=1");
  return r;
}

export async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(token);
  jar.delete(SESSION_COOKIE);
}
