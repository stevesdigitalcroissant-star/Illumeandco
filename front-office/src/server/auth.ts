/**
 * Authentication core: password hashing and database-backed sessions.
 * Framework-agnostic — the Next.js cookie glue lives in src/lib/session.ts.
 *
 * - Passwords: bcrypt (cost 12).
 * - Sessions: 256-bit random token in an httpOnly cookie; only its SHA-256 is
 *   stored, so a database leak does not leak usable sessions.
 */
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { businesses, organizationMembers, organizations, sessions, users } from "@/db/schema";
import { AppError, invalid, type Role } from "./context";

export const SESSION_COOKIE = "afo_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_REFRESH_MS = 24 * 60 * 60 * 1000;
// A real hash compared against when the email is unknown, so timing does not reveal accounts.
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash(randomBytes(16).toString("hex"), 12));

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function validatePassword(password: string) {
  if (password.length < 10) throw invalid("Password must be at least 10 characters.");
  if (password.length > 200) throw invalid("Password is too long.");
}

export function normalizeEmail(email: string) {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw invalid("Please enter a valid email address.");
  return e;
}

export async function signUp(input: { name: string; email: string; password: string }) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!name) throw invalid("Please enter your name.");
  validatePassword(input.password);
  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    const existing = await tx.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
    if (existing) throw new AppError("conflict", "An account with this email already exists.");
    const [user] = await tx.insert(users).values({ email, name, passwordHash }).returning();
    const [org] = await tx.insert(organizations).values({ name: `${name}'s organization` }).returning();
    await tx.insert(organizationMembers).values({ organizationId: org!.id, userId: user!.id, role: "owner" });
    return { user: user!, organization: org! };
  });
}

export async function verifyCredentials(emailInput: string, password: string) {
  let email: string;
  try {
    email = normalizeEmail(emailInput);
  } catch {
    await bcrypt.compare(password, await getDummyHash());
    return null;
  }
  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
  return ok && user ? user : null;
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function validateSessionToken(token: string) {
  const id = sha256(token);
  const row = await db
    .select({ session: sessions, user: { id: users.id, email: users.email, name: users.name } })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const hit = row[0];
  if (!hit) return null;
  // Sliding expiry, written at most once a day.
  if (hit.session.expiresAt.getTime() - Date.now() < SESSION_TTL_MS - SESSION_REFRESH_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    hit.session.expiresAt = expiresAt;
  }
  return hit;
}

export async function invalidateSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function setActiveBusiness(token: string, businessId: string) {
  await db.update(sessions).set({ activeBusinessId: businessId }).where(eq(sessions.id, sha256(token)));
}

/** Businesses the user may access, with the role they hold in the owning organization. */
export async function listAccessibleBusinesses(userId: string) {
  return db
    .select({
      id: businesses.id,
      name: businesses.name,
      organizationId: businesses.organizationId,
      onboardingCompletedAt: businesses.onboardingCompletedAt,
      isDemo: businesses.isDemo,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(businesses, eq(businesses.organizationId, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(businesses.createdAt);
}

export async function membershipsFor(userId: string) {
  return db
    .select({ organizationId: organizationMembers.organizationId, role: organizationMembers.role })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId));
}

/** Resolve the role a user holds for a business, or null when they have no access (tenant boundary). */
export async function roleForBusiness(userId: string, businessId: string): Promise<Role | null> {
  const rows = await db
    .select({ role: organizationMembers.role })
    .from(businesses)
    .innerJoin(
      organizationMembers,
      and(eq(organizationMembers.organizationId, businesses.organizationId), eq(organizationMembers.userId, userId)),
    )
    .where(eq(businesses.id, businessId))
    .limit(1);
  return rows[0]?.role ?? null;
}
