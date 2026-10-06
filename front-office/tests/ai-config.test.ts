import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { Ctx } from "@/server/context";
import { handleInbound } from "@/server/ai/orchestrator";
import { updateAgent, updateAiPermissions, updateWidget } from "@/server/services/ai-config";
import { getAgent, getAiSettings } from "@/server/services/business";
import { createClinic, visitor } from "./helpers";

describe("AI configuration", () => {
  it("permission changes are saved and audited; refunds/prices can never be enabled", async () => {
    const c = await createClinic();
    const next = await updateAiPermissions(c.ctx, { cancel_appointments: false, issue_refunds: true, change_prices: true });
    expect(next.cancel_appointments).toBe(false);
    expect(next.issue_refunds).toBe(false);
    expect(next.change_prices).toBe(false);
    const [log] = await db.select().from(auditLogs).where(and(eq(auditLogs.businessId, c.business.id), eq(auditLogs.action, "ai.settings_updated")));
    expect(log?.summary).toMatch(/Cancel: off/);
  });

  it("only owners and managers can change the AI", async () => {
    const c = await createClinic();
    const staff: Ctx = { businessId: c.business.id, actor: { type: "user", userId: c.user.id, name: "Staff", role: "staff" } };
    await expect(updateAiPermissions(staff, { book_appointments: false })).rejects.toThrow(/permission/);
    await expect(updateAgent(staff, { name: "Hacked" })).rejects.toThrow(/permission/);
    expect((await getAiSettings(c.ctx)).permissions.book_appointments).toBe(true);
  });

  it("validates personality and widget settings", async () => {
    const c = await createClinic();
    await updateAgent(c.ctx, { name: "Nora", tone: "warm", languages: ["EN", "ar"] });
    const a = await getAgent(c.ctx);
    expect(a.name).toBe("Nora");
    expect(a.languages).toEqual(["en", "ar"]);
    await expect(updateAgent(c.ctx, { tone: "sarcastic" })).rejects.toThrow(/tone/);
    await expect(updateWidget(c.ctx, { accentColor: "red" })).rejects.toThrow(/hex/);
    await expect(updateWidget(c.ctx, { logoUrl: "javascript:alert(1)" })).rejects.toThrow(/https/);
  });

  it("turning the AI off routes new conversations straight to the team", async () => {
    const c = await createClinic();
    await updateAgent(c.ctx, { active: false });
    const r = await handleInbound({ businessId: c.business.id, channel: "web_chat", identity: visitor(), text: "How much is whitening?" });
    expect(r.aiActive).toBe(false);
    expect(r.reply).toMatch(/team know/);
  });
});
