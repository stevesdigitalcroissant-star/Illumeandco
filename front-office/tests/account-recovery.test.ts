/** Password reset and email verification: single-use, expiring, no account enumeration, sign-out everywhere. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, sessions, users } from "@/db/schema";
import { requestPasswordReset, resetPassword, sendVerificationEmail, verifyEmail } from "@/server/account";
import { createSession, sha256, signUp, validateSessionToken, verifyCredentials } from "@/server/auth";

let mails: { to: string[]; subject: string; text: string }[] = [];
const BASE = "https://front.example";
const tokenFrom = (text: string) => text.match(/token=([A-Za-z0-9_-]+)/)![1]!;

beforeEach(() => {
  mails = [];
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "AI Front Office <no-reply@front.example>");
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => (mails.push(JSON.parse(String(init.body))), new Response(JSON.stringify({ id: "m1" }), { status: 200 }))));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function account() {
  const email = `user-${randomBytes(4).toString("hex")}@test.dev`;
  const { user } = await signUp({ name: "Rana Saleh", email, password: "original-password-1" });
  return { user, email };
}

describe("password reset", () => {
  it("emails a single-use link, signs out everywhere, and the old password stops working", async () => {
    const { user, email } = await account();
    const s = await createSession(user.id);
    expect(await requestPasswordReset(email.toUpperCase(), BASE)).toEqual({ available: true });
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toEqual([email]);
    expect(mails[0]!.text).toContain(`${BASE}/reset-password?token=`);
    const token = tokenFrom(mails[0]!.text);
    expect(await db.query.authTokens.findFirst({ where: eq(authTokens.id, token) })).toBeUndefined(); // only the hash is stored

    await expect(resetPassword(token, "short")).rejects.toThrow(/at least 10/);
    await resetPassword(token, "brand-new-password-2");
    expect(await verifyCredentials(email, "original-password-1")).toBeNull();
    expect((await verifyCredentials(email, "brand-new-password-2"))?.id).toBe(user.id);
    expect(await validateSessionToken(s.token)).toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    await expect(resetPassword(token, "another-password-3")).rejects.toThrow(/invalid or has expired/);
  });

  it("doesn't reveal whether an account exists", async () => {
    expect(await requestPasswordReset("nobody-here@test.dev", BASE)).toEqual({ available: true });
    expect(await requestPasswordReset("not an email", BASE)).toEqual({ available: true });
    expect(mails).toHaveLength(0);
  });

  it("only the newest link works, and links expire", async () => {
    const { user, email } = await account();
    await requestPasswordReset(email, BASE);
    await requestPasswordReset(email, BASE);
    const [first, second] = mails.map((m) => tokenFrom(m.text));
    await expect(resetPassword(first!, "brand-new-password-2")).rejects.toThrow(/invalid or has expired/);
    await db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authTokens.id, sha256(second!)));
    await expect(resetPassword(second!, "brand-new-password-2")).rejects.toThrow(/invalid or has expired/);
    expect((await verifyCredentials(email, "original-password-1"))?.id).toBe(user.id);
  });

  it("says plainly when email isn't configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { email } = await account();
    expect(await requestPasswordReset(email, BASE)).toEqual({ available: false });
    expect(mails).toHaveLength(0);
  });
});

describe("email verification", () => {
  it("verifies once; resending replaces the old link", async () => {
    const { user } = await account();
    expect(await sendVerificationEmail(user.id, BASE)).toBe(true);
    expect(await sendVerificationEmail(user.id, BASE)).toBe(true);
    const [old, fresh] = mails.map((m) => tokenFrom(m.text));
    expect(await verifyEmail(old!)).toBe(false);
    expect(await verifyEmail(fresh!)).toBe(true);
    expect(await verifyEmail(fresh!)).toBe(false);
    expect((await db.query.users.findFirst({ where: eq(users.id, user.id) }))?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await sendVerificationEmail(user.id, BASE)).toBe(false); // already verified
  });
});
