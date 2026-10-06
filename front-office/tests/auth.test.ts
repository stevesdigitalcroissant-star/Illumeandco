import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import {
  createSession,
  invalidateSession,
  roleForBusiness,
  sha256,
  signUp,
  validateSessionToken,
  verifyCredentials,
} from "@/server/auth";
import { createClinic } from "./helpers";

const email = () => `user-${Math.random().toString(36).slice(2)}@test.dev`;

describe("authentication", () => {
  it("signs up an owner with an organization and verifies credentials", async () => {
    const e = email();
    const { user, organization } = await signUp({ name: "Ada", email: e, password: "a-long-password" });
    expect(organization.id).toBeTruthy();
    expect(user.passwordHash).not.toContain("a-long-password");
    expect((await verifyCredentials(e.toUpperCase(), "a-long-password"))?.id).toBe(user.id);
    expect(await verifyCredentials(e, "wrong-password")).toBeNull();
    expect(await verifyCredentials("nobody@test.dev", "a-long-password")).toBeNull();
  });

  it("rejects duplicate emails (case-insensitive) and weak passwords", async () => {
    const e = email();
    await signUp({ name: "A", email: e, password: "a-long-password" });
    await expect(signUp({ name: "B", email: e.toUpperCase(), password: "a-long-password" })).rejects.toThrow(/already exists/);
    await expect(signUp({ name: "C", email: email(), password: "short" })).rejects.toThrow(/at least 10/);
    await expect(signUp({ name: "D", email: "not-an-email", password: "a-long-password" })).rejects.toThrow(/valid email/);
  });

  it("stores only a hash of the session token and invalidates it on logout", async () => {
    const { user } = await signUp({ name: "S", email: email(), password: "a-long-password" });
    const { token } = await createSession(user.id);
    const row = await db.query.sessions.findFirst({ where: eq(sessions.id, sha256(token)) });
    expect(row).toBeTruthy();
    expect(await db.query.sessions.findFirst({ where: eq(sessions.id, token) })).toBeUndefined();
    expect((await validateSessionToken(token))?.user.id).toBe(user.id);
    await invalidateSession(token);
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("rejects expired sessions and unknown tokens", async () => {
    const { user } = await signUp({ name: "X", email: email(), password: "a-long-password" });
    const { token } = await createSession(user.id);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, sha256(token)));
    expect(await validateSessionToken(token)).toBeNull();
    expect(await validateSessionToken("made-up-token")).toBeNull();
  });

  it("only grants business access through organization membership", async () => {
    const a = await createClinic("Clinic A");
    const b = await createClinic("Clinic B");
    expect(await roleForBusiness(a.user.id, a.business.id)).toBe("owner");
    expect(await roleForBusiness(a.user.id, b.business.id)).toBeNull();
  });
});
