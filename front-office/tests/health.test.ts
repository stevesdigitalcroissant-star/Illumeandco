/** Health check: status for monitors, details only with the operator secret, never secret values. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";
import { healthReport, recordHeartbeat } from "@/server/health";

afterEach(() => vi.unstubAllEnvs());
const call = (auth?: string) => GET(new Request("http://x/api/health", { headers: auth ? { authorization: auth } : {} }));

describe("health check", () => {
  it("is ok with a recent tick and a migrated database; degraded when cron stops", async () => {
    await recordHeartbeat("tick", {}, new Date());
    const ok = await healthReport();
    expect(ok.checks).toMatchObject({ database: { ok: true }, migrations: { ok: true }, backgroundJobs: { ok: true } });
    expect(ok.status).toBe("ok");
    await recordHeartbeat("tick", {}, new Date(Date.now() - 3600_000));
    const stale = await healthReport();
    expect(stale.status).toBe("degraded");
    expect((stale.checks as Record<string, { detail?: string }>).backgroundJobs?.detail).toMatch(/Last ran 60 min ago/);
    await recordHeartbeat("tick", {}, new Date());
  });

  it("shows details only with the operator secret, and never secret values", async () => {
    vi.stubEnv("CRON_SECRET", "op-secret");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-should-not-leak");
    const pub = await call();
    expect(pub.status).toBe(200);
    expect(await pub.json()).toEqual({ status: expect.any(String) });
    expect(Object.keys(await (await call("Bearer wrong")).json())).toEqual(["status"]);
    const full = await call("Bearer op-secret");
    const text = await full.text();
    expect(JSON.parse(text)).toMatchObject({ config: { ai: true, cronSecret: true } });
    expect(text).not.toContain("sk-ant-should-not-leak");
    expect(text).not.toContain("op-secret");
  });
});
