/**
 * Account recovery: password reset and email verification by single-use link.
 *
 * - Links carry a random token; only its sha256 is stored. Reset links last
 *   1 hour, verification links 7 days; each works once.
 * - Asking for a reset never reveals whether an account exists.
 * - A reset signs the user out everywhere.
 * - Both need email (RESEND_API_KEY + EMAIL_FROM). Without it the flows say
 *   so instead of pretending a link was sent.
 */
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, sessions, users } from "@/db/schema";
import { getChannel } from "./channels/registry";
import { hashPassword, normalizeEmail, randomToken, sha256, validatePassword } from "./auth";
import { invalid } from "./context";

const HOUR = 3600_000;
export const emailConfigured = () => getChannel("email").isConfigured();

async function issue(userId: string, purpose: "password_reset" | "email_verify", ttlMs: number) {
  // Only the newest link of each kind works.
  await db.update(authTokens).set({ usedAt: new Date() }).where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
  const token = randomToken(32);
  await db.insert(authTokens).values({ id: sha256(token), userId, purpose, expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

/** Consume a token atomically. Returns the user id, or null if unknown / used / expired. */
async function consume(token: string, purpose: "password_reset" | "email_verify") {
  if (!token || token.length > 200) return null;
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.id, sha256(token)), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .returning();
  return row?.userId ?? null;
}

async function sendEmail(to: string, subject: string, text: string) {
  const r = await getChannel("email").send({ businessId: "", businessName: "AI Front Office", to: { name: null, email: to, phone: null }, subject, text });
  return r.ok;
}

/** Always resolves the same way whether or not the account exists. */
export async function requestPasswordReset(emailInput: string, baseUrl: string) {
  if (!emailConfigured()) return { available: false as const };
  let email: string;
  try {
    email = normalizeEmail(emailInput);
  } catch {
    return { available: true as const };
  }
  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  if (user) {
    const token = await issue(user.id, "password_reset", HOUR);
    await sendEmail(
      user.email,
      "Reset your password",
      `Hi ${user.name.split(" ")[0]},\n\nSomeone (hopefully you) asked to reset your AI Front Office password. Choose a new one here — the link works once, for 1 hour:\n\n${baseUrl}/reset-password?token=${token}\n\nIf it wasn't you, ignore this email; your password hasn't changed.`,
    );
  }
  return { available: true as const };
}

export async function resetPassword(token: string, newPassword: string) {
  validatePassword(newPassword);
  const userId = await consume(token, "password_reset");
  if (!userId) throw invalid("This reset link is invalid or has expired. Please request a new one.");
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId)); // sign out everywhere
  return userId;
}

export async function sendVerificationEmail(userId: string, baseUrl: string) {
  if (!emailConfigured()) return false;
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.emailVerifiedAt) return false;
  const token = await issue(user.id, "email_verify", 7 * 24 * HOUR);
  return sendEmail(user.email, "Confirm your email", `Hi ${user.name.split(" ")[0]},\n\nPlease confirm your email address for AI Front Office:\n\n${baseUrl}/verify-email?token=${token}\n\nThis link works once and expires in 7 days.`);
}

export async function verifyEmail(token: string) {
  const userId = await consume(token, "email_verify");
  if (!userId) return false;
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  return true;
}
