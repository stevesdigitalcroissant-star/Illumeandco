import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiSettings, auditLogs } from "@/db/schema";
import type { Ctx } from "@/server/context";
import { updateAutomationSettings } from "@/server/services/settings-ext";
import { listAuditLogs } from "@/server/services/audit-log";
import { createClinic } from "./helpers";

const settingsOf = async (businessId: string) => (await db.query.aiSettings.findFirst({ where: eq(aiSettings.businessId, businessId) }))!;

describe("updateAutomationSettings", () => {
  it("merges a partial patch into the business's own settings and audits it", async () => {
    const a = await createClinic("Clinic A");
    const b = await createClinic("Clinic B");
    const before = await settingsOf(b.business.id);
    await updateAutomationSettings(a.ctx, {
      followUp: { delayHours: 48, style: "direct" },
      reminders: { sameDayHoursBefore: 2, templates: { same_day: "See you at {{time}}, {{customer_name}}!" } },
      reviews: { positiveThreshold: 5, links: [{ label: "Google", url: "https://g.page/r/abc" }] },
      missedOpportunities: { staleLeadHours: 72 },
    });
    const s = await settingsOf(a.business.id);
    expect(s.followUp).toMatchObject({ delayHours: 48, style: "direct", maxAttempts: 2, enabled: true });
    expect(s.reminders.sameDayHoursBefore).toBe(2);
    expect(s.reminders.templates.same_day).toBe("See you at {{time}}, {{customer_name}}!");
    expect(s.reminders.templates.confirmation).toContain("{{service}}"); // untouched template kept
    expect(s.reviews.links).toEqual([{ label: "Google", url: "https://g.page/r/abc" }]);
    expect(s.missedOpportunities).toEqual({ staleLeadHours: 72, noReturnDays: 120 });
    // Tenant isolation: the other business is untouched.
    expect(await settingsOf(b.business.id)).toEqual(before);
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.businessId, a.business.id), eq(auditLogs.action, "ai.settings_updated")));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.summary).toMatch(/AI follow-ups/);
  });

  it("rejects out-of-range values and unsafe links", async () => {
    const { ctx, business } = await createClinic();
    await expect(updateAutomationSettings(ctx, { followUp: { delayHours: 0 } })).rejects.toThrow(/between 1 and 720/);
    await expect(updateAutomationSettings(ctx, { followUp: { maxAttempts: 6 } })).rejects.toThrow(/between 1 and 5/);
    await expect(updateAutomationSettings(ctx, { reviews: { positiveThreshold: 0 } })).rejects.toThrow(/between 1 and 5/);
    await expect(updateAutomationSettings(ctx, { reviews: { links: [{ label: "x", url: "javascript:alert(1)" }] } })).rejects.toThrow(/http/);
    await expect(updateAutomationSettings(ctx, { reviews: { template: "Thanks!" } })).rejects.toThrow(/review_link/);
    await expect(updateAutomationSettings(ctx, { reminders: { templates: { confirmation: "  " } } })).rejects.toThrow(/empty/);
    await expect(updateAutomationSettings(ctx, {})).rejects.toThrow(/Nothing/);
    expect((await settingsOf(business.id)).followUp.delayHours).toBe(24);
  });

  it("requires business.manage", async () => {
    const { ctx } = await createClinic();
    const staffCtx: Ctx = { ...ctx, actor: { type: "user", userId: (ctx.actor as { userId: string }).userId, name: "S", role: "staff" } };
    await expect(updateAutomationSettings(staffCtx, { followUp: { delayHours: 10 } })).rejects.toThrow(/permission/);
  });
});

describe("listAuditLogs", () => {
  it("filters by category, actor and search, scoped to the business", async () => {
    const a = await createClinic("Audit A");
    await createClinic("Audit B");
    const all = await listAuditLogs(a.ctx);
    expect(all.total).toBeGreaterThan(0);
    expect(all.rows.every((r) => r.businessId === a.business.id)).toBe(true);
    const settings = await listAuditLogs(a.ctx, { category: "settings" });
    expect(settings.rows.length).toBeGreaterThan(0);
    expect(settings.rows.every((r) => ["business.updated", "service.updated", "staff.updated", "knowledge.updated"].includes(r.action))).toBe(true);
    const search = await listAuditLogs(a.ctx, { q: "whitening" });
    expect(search.rows.every((r) => /whitening/i.test(r.summary))).toBe(true);
    expect((await listAuditLogs(a.ctx, { actorType: "ai" })).total).toBe(0);
    expect((await listAuditLogs(a.ctx, { q: "100%_" })).total).toBe(0);
  });
});
