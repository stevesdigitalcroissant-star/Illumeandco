import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { newVisitorToken, widgetBusiness } from "@/server/channels/web-chat";

/** Issue a visitor token. The conversation itself is created on the first message. */
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!rateLimit(`widget-session:${clientIp(req.headers)}`, 30, 3600_000).ok)
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const business = await widgetBusiness(key);
  if (!business) return NextResponse.json({ error: "Unknown widget" }, { status: 404 });
  return NextResponse.json({ token: newVisitorToken() });
}
