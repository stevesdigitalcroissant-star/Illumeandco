/** Rate limiting: shared via Redis when configured, per-instance otherwise — and never unlimited. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("rate limiting", () => {
  it("in memory: allows up to the limit per window", async () => {
    const key = `t:${Math.random()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(key, 3, 60_000));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[0]!.shared).toBe(false);
  });

  it("with Upstash: counts in Redis (shared across instances)", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
    const counts = new Map<string, number>();
    const calls: string[][][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://redis.example/pipeline");
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
        const cmds = JSON.parse(String(init.body)) as string[][];
        calls.push(cmds);
        const k = cmds[0]![1]!;
        counts.set(k, (counts.get(k) ?? 0) + 1);
        return new Response(JSON.stringify([{ result: counts.get(k) }, { result: 1 }]));
      }),
    );
    const r1 = await rateLimit("login:a@b.c", 2, 60_000);
    const r2 = await rateLimit("login:a@b.c", 2, 60_000);
    const r3 = await rateLimit("login:a@b.c", 2, 60_000);
    expect([r1.ok, r2.ok, r3.ok]).toEqual([true, true, false]);
    expect(r1.shared).toBe(true);
    expect(calls[0]![1]).toEqual(["PEXPIRE", calls[0]![0]![1], "60000"]);
  });

  it("if Redis is down, falls back to in-memory limits rather than none", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "tok");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const key = `down:${Math.random()}`;
    const r = [await rateLimit(key, 1, 60_000), await rateLimit(key, 1, 60_000)];
    expect(r.map((x) => [x.ok, x.shared])).toEqual([[true, false], [false, false]]);
  });
});
