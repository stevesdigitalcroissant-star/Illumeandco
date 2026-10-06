import Link from "next/link";
import { headers } from "next/headers";
import { CircleCheck, CircleDashed, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requirePermission } from "@/lib/session";
import { activeEngineInfo } from "@/server/ai/agent";
import { AI_PERMISSION_LABELS, type AiPermissionKey } from "@/server/ai/permissions";
import { getAgent, getAiSettings, getBusinessHours } from "@/server/services/business";
import { listServices, listStaff } from "@/server/services/catalog";
import { knowledgeStats } from "@/server/services/knowledge";
import { ActiveSwitch, BookingRules, CopySnippet, PermissionRow } from "./controls";
import { PersonalityForm, WidgetForm } from "./forms";

export const metadata = { title: "AI Receptionist" };

export default async function ReceptionistPage() {
  const { ctx, business } = await requirePermission("business.manage");
  const [agent, settings, services, staff, hours, kb] = await Promise.all([
    getAgent(ctx),
    getAiSettings(ctx),
    listServices(ctx),
    listStaff(ctx),
    getBusinessHours(ctx),
    knowledgeStats(ctx),
  ]);
  const engine = activeEngineInfo();
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const snippet = `<script src="${origin}/widget.js" data-key="${business.publicKey}" async></script>`;
  const policies = Object.values(business.policies).filter(Boolean).length;

  const access: [string, boolean, string][] = [
    ["Business information", !!(business.address || business.phone), business.address ? "Address & contact details" : "Add address and phone in Settings"],
    ["Services & prices", services.length > 0, `${services.length} active service${services.length === 1 ? "" : "s"}`],
    ["Opening hours", hours.length > 0, hours.length ? `${new Set(hours.map((x) => x.weekday)).size} days a week` : "Not set — the AI can't offer times"],
    ["Staff & availability", staff.length > 0, `${staff.length} staff member${staff.length === 1 ? "" : "s"}`],
    ["FAQs & knowledge", kb.indexed > 0, `${kb.indexed} source${kb.indexed === 1 ? "" : "s"}, ${kb.chunks} passages`],
    ["Policies", policies > 0, `${policies} of 4 policies written`],
    ["Customer & conversation history", true, "Always available, per customer"],
  ];

  return (
    <>
      <PageHeader
        title="AI Receptionist"
        description="Control exactly what your AI front desk knows, how it sounds and what it's allowed to do."
        actions={
          <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2">
            <span className="text-sm font-medium">{agent.active ? "On — answering customers" : "Off — conversations go to your team"}</span>
            <ActiveSwitch active={agent.active} />
          </div>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="personality">Personality</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="widget">Website chat</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <Card>
              <CardHeader title="AI engine" />
              <div className="space-y-3 p-5 text-sm">
                {engine.id === "anthropic" ? (
                  <p>
                    <Badge tone="primary">Claude</Badge> <span className="ml-1">Running on <span className="font-mono text-[13px]">{engine.model}</span> with tool use. Every action goes through your permissions and is logged.</span>
                  </p>
                ) : (
                  <>
                    <p><Badge>Basic rules engine</Badge> <span className="ml-1">No language model is configured, so the built-in engine is answering.</span></p>
                    <Notice tone="warning">
                      The basic engine handles prices, availability, booking, rescheduling, cancellations, opening hours and FAQs using your real data — but it understands far less than an LLM.
                      Set <span className="font-mono">ANTHROPIC_API_KEY</span> on the server to switch to Claude.
                    </Notice>
                  </>
                )}
                <p className="text-[13px] text-muted-foreground">
                  Whatever the engine, the AI never invents prices, availability or policies, never claims an action it didn&apos;t perform, and hands sensitive or clinical questions to your team.
                </p>
              </div>
            </Card>
            <Card>
              <CardHeader title="What your receptionist can see" description="It answers only from this information — fill the gaps to make it more useful." />
              <ul>
                {access.map(([label, ok, detail]) => (
                  <li key={label} className="flex items-center gap-3 border-t px-5 py-3 first:border-t-0">
                    {ok ? <CircleCheck className="size-4 text-success" /> : <CircleDashed className="size-4 text-warning" />}
                    <span className="flex-1 text-sm">{label}</span>
                    <span className="text-[13px] text-muted-foreground">{detail}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <Card className="overflow-hidden lg:col-span-2">
            <CardHeader
              title="Try it"
              description="A live chat with your receptionist. Test conversations appear in your Inbox."
              action={
                <Link href={`/widget/${business.publicKey}`} target="_blank" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
                  Open <ExternalLink className="size-3.5" />
                </Link>
              }
            />
            <iframe src={`/widget/${business.publicKey}`} title="Test chat" className="h-[560px] w-full border-0" />
          </Card>
        </TabsContent>

        <TabsContent value="personality">
          <Card className="max-w-3xl">
            <CardHeader title="Personality" description="Default: friendly, professional, concise, helpful and human." />
            <PersonalityForm agent={agent} />
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="max-w-3xl space-y-6">
          <Card>
            <CardHeader title="Allowed actions" description="The AI can only perform actions switched on here. Attempts outside these are refused and logged." />
            <ul>
              {(Object.keys(AI_PERMISSION_LABELS) as AiPermissionKey[]).map((k) => (
                <PermissionRow
                  key={k}
                  k={k}
                  label={AI_PERMISSION_LABELS[k].label}
                  description={AI_PERMISSION_LABELS[k].description}
                  value={settings.permissions[k]}
                  locked={!AI_PERMISSION_LABELS[k].implemented}
                />
              ))}
              <li className="flex items-start gap-4 border-t px-5 py-3.5">
                <div className="flex-1">
                  <p className="text-sm font-medium">Hand off to a human</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">Always on. Customers can always reach a person.</p>
                </div>
                <Badge tone="success">Always on</Badge>
              </li>
            </ul>
          </Card>
          <Card>
            <CardHeader title="Booking requirements" />
            <BookingRules requireName={settings.booking.requireName} requireContact={settings.booking.requireContact} />
          </Card>
        </TabsContent>

        <TabsContent value="widget" className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <Card>
              <CardHeader title="Add to your website" description="Paste this before the closing </body> tag on every page." />
              <div className="p-5">
                <CopySnippet code={snippet} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Appearance" />
              <WidgetForm widget={settings.widget} />
            </Card>
          </div>
          <Card className="overflow-hidden lg:col-span-2">
            <CardHeader title="Preview" />
            <iframe src={`/widget/${business.publicKey}`} title="Widget preview" className="h-[560px] w-full border-0" />
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
