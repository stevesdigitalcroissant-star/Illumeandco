/** Custom-plan enquiries: validated, always saved, emailed when configured, visible only to platform admins. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { salesInquiries } from "@/db/schema";
import { isPlatformAdmin, listInquiries, setInquiryStatus, submitInquiry } from "@/server/services/sales";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const valid = { name: "Hana Group", email: "Ops@HanaClinics.com", organization: "Hana Clinics", locations: "6–20" as const, message: "12 clinics in Dubai and Abu Dhabi" };

describe("sales enquiries", () => {
  it("validates input", async () => {
    await expect(submitInquiry({ ...valid, email: "not-an-email" })).rejects.toThrow(/valid email/);
    await expect(submitInquiry({ ...valid, organization: "" })).rejects.toThrow(/organization/);
    await expect(submitInquiry({ ...valid, locations: "1000" as never })).rejects.toThrow(/locations/);
  });

  it("is saved, and emailed to the sales inbox (reply-to the requester) only when email is configured", async () => {
    const calls: { to: string[]; reply_to: string; subject: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => (calls.push(JSON.parse(String(init.body))), new Response("{}", { status: 200 }))));
    const quiet = await submitInquiry(valid);
    expect(quiet).toMatchObject({ email: "ops@hanaclinics.com", status: "new", emailedAt: null });
    expect(calls).toHaveLength(0);

    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "AI Front Office <hello@example.com>");
    vi.stubEnv("SALES_EMAIL", "sales@example.com, founder@example.com");
    const sent = await submitInquiry(valid);
    expect(calls[0]).toMatchObject({ to: ["sales@example.com", "founder@example.com"], reply_to: "ops@hanaclinics.com" });
    expect(calls[0]!.subject).toContain("Hana Clinics (6–20 locations)");
    const [row] = await db.select().from(salesInquiries).where(eq(salesInquiries.id, sent.id));
    expect(row!.emailedAt).not.toBeNull();
  });

  it("only platform admins can list or update enquiries", async () => {
    vi.stubEnv("PLATFORM_ADMINS", "Admin@Example.com");
    expect(isPlatformAdmin("admin@example.com")).toBe(true);
    expect(isPlatformAdmin("owner@clinic.com")).toBe(false);
    expect(isPlatformAdmin(null)).toBe(false);
    const r = await submitInquiry(valid);
    expect((await listInquiries("admin@example.com")).some((x) => x.id === r.id)).toBe(true);
    await expect(listInquiries("owner@clinic.com")).rejects.toThrow();
    await expect(setInquiryStatus("owner@clinic.com", r.id, "closed")).rejects.toThrow();
    await setInquiryStatus("admin@example.com", r.id, "contacted");
    vi.stubEnv("PLATFORM_ADMINS", "");
    expect(isPlatformAdmin("admin@example.com")).toBe(false);
  });
});
