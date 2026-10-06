import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { widgetBusiness, widgetConfig } from "@/server/channels/web-chat";
import { ChatWidget } from "./chat";

export const metadata: Metadata = { title: "Chat", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function WidgetPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ embed?: string }> }) {
  const { key } = await params;
  const { embed } = await searchParams;
  const business = await widgetBusiness(key);
  if (!business) notFound();
  const config = await widgetConfig(business.id);
  return <ChatWidget publicKey={key} businessName={business.name} config={config} embedded={embed === "1"} />;
}
