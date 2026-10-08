import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/input";
import { EmptyState, PageHeader, Table } from "@/components/ui/misc";
import { requirePermission } from "@/lib/session";
import { cn, formatMoney } from "@/lib/utils";
import { headers } from "next/headers";
import { DateTime } from "luxon";
import { getChannel, listChannels } from "@/server/channels/registry";
import { isAllowed } from "@/server/ai/permissions";
import { listConnectors, webhookState, type ConnectorStatus } from "@/server/integrations/connectors";
import { listRecentEvents } from "@/server/integrations/ingest";
import { roleCan } from "@/server/context";
import { BUSINESS_TYPES } from "@/server/defaults";
import { billingConfigured } from "@/server/services/billing";
import { getAiSettings, getBusinessHours } from "@/server/services/business";
import { getStaffAvailability, listBlackouts, listServices, listStaff } from "@/server/services/catalog";
import { listMembers } from "@/server/services/team";
import { addBlackoutAction, saveBusinessAction, savePoliciesAction } from "./actions";
import { CardFooter, HoursCard, MissedCallCard, RemoveBlackoutButton, ServicesCard, StaffCard, TeamCard, WebhookSecretButton } from "./settings-client";

export const metadata = { title: "Settings" };

const TABS = [
  { key: "business", label: "Business" },
  { key: "hours", label: "Opening hours" },
  { key: "services", label: "Services" },
  { key: "staff", label: "Staff" },
  { key: "blackouts", label: "Closures" },
  { key: "policies", label: "Policies" },
  { key: "team", label: "Team & roles" },
  { key: "integrations", label: "Integrations" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function timezones() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const r = await requirePermission("business.manage");
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === sp.tab)?.key ?? "business";
  return (
    <>
      <PageHeader title="Settings" description={`Everything your front office and AI receptionist know about ${r.business.name}.`} />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b" aria-label="Settings sections">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "business" ? "/app/settings" : `/app/settings?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="max-w-4xl space-y-6">
        {tab === "business" ? <BusinessTab r={r} /> : null}
        {tab === "hours" ? <HoursTab r={r} /> : null}
        {tab === "services" ? <ServicesTab r={r} /> : null}
        {tab === "staff" ? <StaffTab r={r} /> : null}
        {tab === "blackouts" ? <BlackoutsTab r={r} /> : null}
        {tab === "policies" ? <PoliciesTab r={r} /> : null}
        {tab === "team" ? <TeamTab r={r} /> : null}
        {tab === "integrations" ? <IntegrationsTab r={r} /> : null}
      </div>
    </>
  );
}

type R = Awaited<ReturnType<typeof requirePermission>>;

function BusinessTab({ r }: { r: R }) {
  const b = r.business;
  return (
    <Card>
      <ActionForm action={saveBusinessAction} className="space-y-0 [&>p]:px-5 [&>p]:pb-3">
        <CardHeader title="Business profile" description="Shown to customers by the AI and on your chat widget." />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name"><Input name="name" defaultValue={b.name} required maxLength={120} /></Field>
            <Field label="Type">
              <NativeSelect name="type" defaultValue={b.type}>{BUSINESS_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</NativeSelect>
            </Field>
          </div>
          <Field label="Description" hint="A sentence or two the AI can use to introduce your business."><Textarea name="description" defaultValue={b.description ?? ""} maxLength={1000} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Address" className="sm:col-span-3"><Input name="address" defaultValue={b.address ?? ""} /></Field>
            <Field label="City"><Input name="city" defaultValue={b.city ?? ""} /></Field>
            <Field label="Country"><Input name="country" defaultValue={b.country ?? ""} /></Field>
            <Field label="Phone"><Input name="phone" defaultValue={b.phone ?? ""} /></Field>
            <Field label="Email"><Input name="email" type="email" defaultValue={b.email ?? ""} /></Field>
            <Field label="Website" className="sm:col-span-2"><Input name="website" type="url" defaultValue={b.website ?? ""} placeholder="https://" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Timezone" hint="All opening hours and appointment times use this timezone.">
              <NativeSelect name="timezone" defaultValue={b.timezone}>{timezones().map((tz) => <option key={tz} value={tz}>{tz}</option>)}</NativeSelect>
            </Field>
            <Field label="Currency" hint="3-letter code used for prices, e.g. AED."><Input name="currency" defaultValue={b.currency} maxLength={3} className="uppercase" required /></Field>
          </div>
        </CardBody>
        <div className="border-t">
          <CardHeader className="border-b-0 pb-0" title="Booking rules" description="Applied to every booking — by the AI, online and by your team." />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Slot interval (minutes)" hint="Start times are offered every N minutes (5–240)."><Input name="slotIntervalMinutes" type="number" min={5} max={240} defaultValue={b.slotIntervalMinutes} required /></Field>
            <Field label="Default buffer (minutes)" hint="Gap after each appointment unless a service overrides it."><Input name="defaultBufferMinutes" type="number" min={0} max={240} defaultValue={b.defaultBufferMinutes} required /></Field>
            <Field label="Minimum notice (minutes)" hint="How soon before a slot it can still be booked."><Input name="minNoticeMinutes" type="number" min={0} max={10080} defaultValue={b.minNoticeMinutes} required /></Field>
            <Field label="Booking window (days)" hint="How far ahead customers can book."><Input name="maxAdvanceDays" type="number" min={1} max={730} defaultValue={b.maxAdvanceDays} required /></Field>
          </CardBody>
        </div>
        <CardFooter><SubmitButton size="sm">Save changes</SubmitButton></CardFooter>
      </ActionForm>
    </Card>
  );
}

async function HoursTab({ r }: { r: R }) {
  const hours = await getBusinessHours(r.ctx);
  return <HoursCard initial={hours.map((h) => ({ weekday: h.weekday, start: h.openTime, end: h.closeTime }))} />;
}

async function ServicesTab({ r }: { r: R }) {
  const [services, staff] = await Promise.all([listServices(r.ctx, { includeInactive: true }), listStaff(r.ctx, { includeInactive: true })]);
  const cur = r.business.currency;
  return (
    <ServicesCard
      currency={cur}
      defaultBuffer={r.business.defaultBufferMinutes}
      staff={staff.map((s) => ({ id: s.id, name: s.name, active: s.active }))}
      services={services
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
        .map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          category: s.category,
          priceCents: s.priceCents,
          priceLabel: formatMoney(s.priceCents, cur, { from: s.priceIsFrom }),
          priceIsFrom: s.priceIsFrom,
          durationMinutes: s.durationMinutes,
          bufferMinutes: s.bufferMinutes,
          onlineBookingEnabled: s.onlineBookingEnabled,
          active: s.active,
          staffIds: s.staffIds,
        }))}
    />
  );
}

async function StaffTab({ r }: { r: R }) {
  const [staff, avail, members] = await Promise.all([listStaff(r.ctx, { includeInactive: true }), getStaffAvailability(r.ctx), listMembers(r.ctx)]);
  return (
    <StaffCard
      members={members.map((m) => ({ userId: m.userId, name: m.name, email: m.email }))}
      staff={staff.map((s) => ({
        id: s.id,
        name: s.name,
        title: s.title,
        email: s.email,
        phone: s.phone,
        userId: s.userId,
        active: s.active,
        work: avail.filter((a) => a.staffId === s.id && a.kind === "work").map((a) => ({ weekday: a.weekday, start: a.startTime, end: a.endTime })),
        breaks: avail.filter((a) => a.staffId === s.id && a.kind === "break").map((a) => ({ weekday: a.weekday, start: a.startTime, end: a.endTime })),
      }))}
    />
  );
}

async function BlackoutsTab({ r }: { r: R }) {
  const [rows, staff] = await Promise.all([listBlackouts(r.ctx), listStaff(r.ctx, { includeInactive: true })]);
  const name = (id: string | null) => (id ? (staff.find((s) => s.id === id)?.name ?? "Staff member") : "Whole business");
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return (
    <>
      <Card>
        <CardHeader title="Add a closure" description="Public holidays, renovations or a staff member's leave. Nobody can be booked on these dates." />
        <ActionForm action={addBlackoutAction} resetOnSuccess className="p-5">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="From"><Input name="startDate" type="date" required /></Field>
            <Field label="To" hint="Inclusive. Empty = one day."><Input name="endDate" type="date" /></Field>
            <Field label="Applies to">
              <NativeSelect name="staffId" defaultValue="">
                <option value="">Whole business</option>
                {staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Reason"><Input name="reason" placeholder="e.g. National Day" maxLength={120} /></Field>
          </div>
          <div className="flex justify-end"><SubmitButton size="sm">Add closure</SubmitButton></div>
        </ActionForm>
      </Card>
      <Card>
        <CardHeader title="Scheduled closures" />
        {rows.length ? (
          <Table>
            <thead><tr><th>Dates</th><th>Applies to</th><th>Reason</th><th className="w-12"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap">{fmt(b.startDate)}{b.endDate !== b.startDate ? ` → ${fmt(b.endDate)}` : ""}</td>
                  <td>{name(b.staffId)}</td>
                  <td className="text-muted-foreground">{b.reason ?? "—"}</td>
                  <td className="text-right"><RemoveBlackoutButton id={b.id} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No closures scheduled" description="Bookings follow your regular opening hours." />
        )}
      </Card>
    </>
  );
}

function PoliciesTab({ r }: { r: R }) {
  const p = r.business.policies;
  const fields = [
    { name: "cancellation", label: "Cancellation policy", placeholder: "e.g. Please give at least 24 hours' notice to cancel or reschedule." },
    { name: "refund", label: "Refund policy", placeholder: "e.g. Deposits are refundable with 48 hours' notice." },
    { name: "late", label: "Late arrival policy", placeholder: "e.g. If you're more than 15 minutes late we may need to reschedule." },
    { name: "booking", label: "Booking policy", placeholder: "e.g. New patients should arrive 10 minutes early to complete forms." },
  ] as const;
  return (
    <Card>
      <ActionForm action={savePoliciesAction} className="space-y-0 [&>p]:px-5 [&>p]:pb-3">
        <CardHeader title="Policies" description="The AI quotes these word-for-word when customers ask. It never makes exceptions or issues refunds itself." />
        <CardBody className="space-y-4">
          {fields.map((f) => (
            <Field key={f.name} label={f.label}>
              <Textarea name={f.name} defaultValue={p[f.name] ?? ""} placeholder={f.placeholder} maxLength={2000} />
            </Field>
          ))}
        </CardBody>
        <CardFooter><SubmitButton size="sm">Save policies</SubmitButton></CardFooter>
      </ActionForm>
    </Card>
  );
}

async function TeamTab({ r }: { r: R }) {
  const members = await listMembers(r.ctx);
  const roles = [
    { role: "Owner", text: "Full access: settings, AI, automations, billing, team members, analytics and every conversation, customer and appointment." },
    { role: "Manager", text: "Day-to-day operations: all conversations, customers, leads and appointments, settings and AI configuration, analytics and the audit log. No billing or team management." },
    { role: "Staff", text: "Their assigned conversations, customers and appointments — reply, book and update. No settings, analytics or other staff's work." },
  ];
  return (
    <>
      <TeamCard
        canManage={roleCan(r.role, "members.manage")}
        members={members.map((m) => ({ id: m.id, userId: m.userId, name: m.name, email: m.email, role: m.role, isMe: m.userId === r.user.id }))}
      />
      <Card>
        <CardHeader title="What each role can do" description="Team membership applies to every location in this organization." />
        <dl className="divide-y">
          {roles.map((x) => (
            <div key={x.role} className="grid gap-1 px-5 py-3 sm:grid-cols-[120px_1fr]">
              <dt className="text-sm font-medium">{x.role}</dt>
              <dd className="text-[13px] text-muted-foreground">{x.text}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}

function StatusBadge({ s }: { s: "active" | "config" | "na" }) {
  return s === "active" ? <Badge tone="success">Active</Badge> : s === "config" ? <Badge tone="warning">Configuration required</Badge> : <Badge tone="outline">Not available yet</Badge>;
}

type IntegrationItem = { name: string; desc: string; status: "active" | "config" | "na"; hint?: string };

function Section({ title, description, items }: { title: string; description: string; items: IntegrationItem[] }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <ul className="divide-y">
        {items.map((i) => (
          <li key={i.name} className="flex items-start justify-between gap-4 px-5 py-3.5">
            <div>
              <p className="text-sm font-medium">{i.name}</p>
              <p className="text-[13px] text-muted-foreground">{i.desc}</p>
              {i.hint ? <p className="mt-1 text-xs text-muted-foreground">{i.hint}</p> : null}
            </div>
            <StatusBadge s={i.status} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

const CONNECTOR_BADGE: Record<ConnectorStatus, React.ReactNode> = {
  active: <Badge tone="success">Receiving events</Badge>,
  ready: <Badge tone="primary">Ready</Badge>,
  config: <Badge tone="warning">Configuration required</Badge>,
  na: <Badge tone="outline">Not available yet</Badge>,
};
const EVENT_TONE = { processed: "success", ignored: "neutral", failed: "danger", received: "info", processing: "info" } as const;

async function IntegrationsTab({ r }: { r: R }) {
  const [connectors, hook, settings, events] = await Promise.all([listConnectors(r.ctx), webhookState(r.ctx), getAiSettings(r.ctx), listRecentEvents(r.ctx, 15)]);
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const key = r.business.publicKey;
  const phoneChannel = getChannel("sms").isConfigured() || getChannel("whatsapp").isConfigured();
  const textHint = !phoneChannel
    ? "Texting back needs SMS or WhatsApp (Twilio) — configuration required. Until then, missed calls are listed for your team to call back."
    : !isAllowed(settings.permissions, "send_messages")
      ? "The AI's \"Send messages\" permission is off (AI Receptionist → Permissions), so missed calls go to your team to call back."
      : null;
  const tz = r.business.timezone;
  return (
    <>
      <Card>
        <CardHeader title="Connect your existing systems" description="We sit on top of the tools you already use — your phone system, forms and booking software keep working as they are. Events flow in; recovered revenue flows out." />
        <ul className="divide-y">
          {connectors.map((c) => (
            <li key={c.key} className="space-y-3 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-[13px] text-muted-foreground">{c.description}</p>
                  {c.hint ? <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p> : null}
                </div>
                {CONNECTOR_BADGE[c.status]}
              </div>
              {c.key === "webhook" ? (
                <div className="space-y-3 rounded-md bg-muted/50 p-3 text-[13px]">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Endpoint</p>
                    <code className="break-all">POST {origin}/api/integrations/webhook/{key}</code>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Headers <code>X-AFO-Timestamp</code> (unix seconds) and <code>X-AFO-Signature</code> = hex HMAC-SHA256 of <code>{"`${timestamp}.${body}`"}</code> with your secret. Body:{" "}
                    <code className="break-all">{`{"id":"call-123","type":"call.missed","data":{"from":"+971501234567","reason":"no_answer"}}`}</code>. Repeated ids are ignored.
                  </div>
                  <WebhookSecretButton hasSecret={hook.hasSecret} disabled={!hook.encryption} />
                </div>
              ) : c.key === "twilio_voice" && c.status !== "config" ? (
                <div className="rounded-md bg-muted/50 p-3 text-[13px]">
                  <p className="text-xs font-medium text-muted-foreground">In Twilio, set the number&apos;s &quot;A call comes in&quot; webhook to</p>
                  <code className="break-all">{origin}/api/integrations/twilio-voice/{key}/incoming</code>
                  <p className="mt-1 text-xs text-muted-foreground">{r.business.phone ? `Calls are forwarded to ${r.business.phone}; unanswered ones become missed-call opportunities.` : "Add your business phone in Settings → Business first — calls are forwarded there."}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <MissedCallCard initial={settings.recovery.missedCall} canText={!textHint} textHint={textHint} />
      <Card>
        <CardHeader title="Recent events" description="Everything your systems sent us, and what we did with it." />
        {events.length ? (
          <Table>
            <thead>
              <tr><th>Received</th><th>Source</th><th>Event</th><th>Status</th><th>Result</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-muted-foreground">{DateTime.fromJSDate(e.createdAt).setZone(tz).toFormat("d LLL, h:mm a")}</td>
                  <td>{e.connector === "twilio_voice" ? "Twilio Voice" : "Webhook"}</td>
                  <td><code className="text-xs">{e.type}</code></td>
                  <td><Badge tone={EVENT_TONE[e.status]}>{e.status}</Badge></td>
                  <td className="text-[13px] text-muted-foreground">{e.result}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No events yet" description="Connect your phone system above; missed calls will appear here as they arrive." />
        )}
      </Card>
      <OtherIntegrations />
    </>
  );
}

function OtherIntegrations() {
  const channels = listChannels();
  const billing = billingConfigured();
  const rows: IntegrationItem[] = [
    { name: "Built-in calendar", desc: "Appointments, availability and double-booking protection.", status: "active" },
    { name: "Google Calendar", desc: "Two-way calendar sync.", status: "na" },
    { name: "Outlook Calendar", desc: "Two-way calendar sync.", status: "na" },
  ];
  const channelRows = channels.map((c) => ({
    name: c.label,
    desc: c.kind === "web_chat" ? "The chat widget on your website." : c.kind === "voice" ? "Requires a telephony provider." : `Customer messaging over ${c.label}.`,
    status: (c.kind === "web_chat" ? "active" : c.kind === "instagram" || c.kind === "voice" ? "na" : c.configured ? "active" : "config") as "active" | "config" | "na",
    hint: c.kind === "voice" ? "Requires telephony provider — not available yet." : c.configured || c.kind === "web_chat" ? undefined : c.hint,
  }));
  return (
    <>
      <Section title="Calendar" description="Where appointments live." items={rows} />
      <Section title="Messaging channels" description="Channels are enabled by your administrator with provider credentials; there's nothing to connect from here yet." items={channelRows} />
      <Section
        title="Billing"
        description="Subscription payments."
        items={[{ name: "Stripe", desc: "Plans, checkout and the billing portal.", status: billing ? "active" : "config", hint: billing ? undefined : "Set STRIPE_SECRET_KEY and each plan's Stripe price ID." }]}
      />
    </>
  );
}
