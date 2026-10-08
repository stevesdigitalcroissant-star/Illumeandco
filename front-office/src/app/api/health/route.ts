import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { healthReport } from "@/server/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — public: just the status (200 ok/degraded, 503 down).
 * With `Authorization: Bearer $CRON_SECRET`: the individual checks and which
 * integrations are configured (booleans only).
 */
export async function GET(req: Request) {
  const report = await healthReport();
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret ?? ""}`);
  const detailed = Boolean(secret) && got.length === want.length && timingSafeEqual(got, want);
  const body = detailed ? report : { status: report.status };
  return NextResponse.json(body, { status: report.status === "down" ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
