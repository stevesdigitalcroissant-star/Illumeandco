import { NextResponse } from "next/server";
import { widgetBusiness, widgetConfig } from "@/server/channels/web-chat";

/** Public, non-secret launcher config for widget.js (called cross-origin from customer sites). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const business = await widgetBusiness(key);
  if (!business) return NextResponse.json({ error: "Unknown widget" }, { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
  const c = await widgetConfig(business.id);
  return NextResponse.json(
    { title: c.title, accentColor: c.accentColor, position: c.position },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60" } },
  );
}
