import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runTick } from "@/server/jobs/tick";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Vercel Cron (or any scheduler) calls this every few minutes with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runTick());
}
export const POST = GET;
