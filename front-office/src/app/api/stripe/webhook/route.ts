import { NextResponse } from "next/server";
import { AppError } from "@/server/context";
import { handleStripeWebhook } from "@/server/services/billing";

export async function POST(req: Request) {
  try {
    const result = await handleStripeWebhook(await req.text(), req.headers.get("stripe-signature"));
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof AppError && e.code === "not_configured" ? 503 : 400;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
