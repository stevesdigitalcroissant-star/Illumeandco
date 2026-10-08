/**
 * Fixed-window rate limiter.
 *
 * With UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN set, counters live
 * in Redis and are shared by every server instance (required once the app
 * runs on more than one instance, e.g. serverless). Without them — or if
 * Redis can't be reached — it falls back to a per-instance in-memory window,
 * so limits still apply (never "unlimited").
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export type RateLimitResult = { ok: boolean; remaining: number; shared: boolean };

function memory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    return { ok: true, remaining: limit - 1, shared: false };
  }
  b.count++;
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), shared: false };
}

export const sharedRateLimitConfigured = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

async function redis(key: string, limit: number, windowMs: number): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, "");
  const window = Math.floor(Date.now() / windowMs);
  const k = `rl:${key}:${window}`;
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", k],
        ["PEXPIRE", k, String(windowMs)],
      ]),
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) return null;
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    const count = Number(out[0]?.result);
    if (!Number.isFinite(count)) return null;
    return { ok: count <= limit, remaining: Math.max(0, limit - count), shared: true };
  } catch {
    return null;
  }
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  if (sharedRateLimitConfigured()) {
    const r = await redis(key, limit, windowMs);
    if (r) return r;
    console.warn("[rate-limit] Redis unavailable — falling back to in-memory limits");
  }
  return memory(key, limit, windowMs);
}

export function clientIp(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
