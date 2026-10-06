/**
 * Final product test — simulate a complete business and conversation.
 *
 *   npm run simulate
 *
 * Builds "Dubai Smile Clinic" (in its own isolated organization), then plays:
 *   price question → availability → book → reschedule → human handoff
 * and prints the transcript, each tool call, the resulting appointment,
 * lead, inbox state and audit log. Uses Claude when ANTHROPIC_API_KEY is set,
 * otherwise the built-in rules engine.
 */
import "dotenv/config";
import { asc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db, getPool } from "../src/db";
import { aiActions, auditLogs, leads } from "../src/db/schema";
import { signUp } from "../src/server/auth";
import type { Ctx } from "../src/server/context";
import { activeEngineInfo } from "../src/server/ai/agent";
import { handleInbound } from "../src/server/ai/orchestrator";
import { listAppointments } from "../src/server/services/appointments";
import { createBusiness, setBusinessHours, updateBusiness } from "../src/server/services/business";
import { createService, createStaff } from "../src/server/services/catalog";
import { getConversation, listConversations } from "../src/server/services/conversations";
import { addSource } from "../src/server/services/knowledge";

const TZ = "Asia/Dubai";
const c = { dim: "\x1b[2m", bold: "\x1b[1m", teal: "\x1b[36m", green: "\x1b[32m", red: "\x1b[31m", reset: "\x1b[0m" };

async function main() {
  const engine = activeEngineInfo();
  console.log(`${c.bold}AI Front Office — Dubai Smile Clinic simulation${c.reset}`);
  console.log(`${c.dim}Engine: ${engine.label}${engine.model ? ` (${engine.model})` : ""}${c.reset}\n`);

  const stamp = Date.now();
  const { user, organization } = await signUp({ name: "Simulation Owner", email: `simulation+${stamp}@frontoffice.dev`, password: `sim-${stamp}-password` });
  const business = await createBusiness(organization.id, { name: "Dubai Smile Clinic", type: "dentist", timezone: TZ, currency: "AED" });
  const ctx: Ctx = { businessId: business.id, actor: { type: "user", userId: user.id, name: user.name, role: "owner" } };
  await updateBusiness(ctx, { city: "Dubai", country: "UAE", address: "Dubai Healthcare City", policies: { cancellation: "Please give 24 hours' notice to cancel or reschedule." } });
  await setBusinessHours(ctx, [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, openTime: "09:00", closeTime: "19:00" })));
  const dentist = await createStaff(ctx, { name: "Dr. Amira Hassan", title: "Dentist" });
  await createService(ctx, { name: "Dental consultation", priceCents: 25000, durationMinutes: 30, staffIds: [dentist.id] });
  await createService(ctx, { name: "Teeth whitening", priceCents: 65000, durationMinutes: 60, staffIds: [dentist.id] });
  await createService(ctx, { name: "Cleaning", priceCents: 30000, durationMinutes: 45, staffIds: [dentist.id] });
  await addSource(ctx, { kind: "faq", title: "FAQs", content: "Q: Does teeth whitening hurt?\nA: Most patients feel little or no discomfort.\n\nQ: Do you have parking?\nA: Yes, free parking for patients." });
  console.log(`${c.dim}Business ${business.id} · services: consultation AED 250/30m, whitening AED 650/60m, cleaning AED 300/45m${c.reset}\n`);

  const visitor = `simulation-${stamp}`;
  const script = [
    "Hi, how much is teeth whitening?",
    "Can I come tomorrow?",
    "2pm works",
    "Sarah Johnson, +971 50 123 4567",
    "Actually can we make it 3pm?",
    "Can I speak to someone?",
  ];
  let conversationId = "";
  for (const text of script) {
    console.log(`${c.bold}Customer:${c.reset} ${text}`);
    const r = await handleInbound({ businessId: business.id, channel: "web_chat", identity: visitor, text });
    conversationId = r.conversationId;
    for (const t of r.turn?.toolCalls ?? []) console.log(`  ${t.ok ? c.green + "✓" : c.red + "✗"} ${t.tool}${c.reset}`);
    console.log(`${c.teal}AI:${c.reset} ${r.reply ?? `${c.dim}(silent — a human owns this conversation)${c.reset}`}\n`);
  }

  // ── Verify the dashboard state ─────────────────────────────────────────
  const appts = await listAppointments(ctx);
  const conv = await getConversation(ctx, conversationId);
  const [lead] = await db.select().from(leads).where(eq(leads.businessId, business.id));
  const inbox = await listConversations(ctx, { status: "needs_human" });
  const calls = await db.select().from(aiActions).where(eq(aiActions.conversationId, conversationId)).orderBy(asc(aiActions.createdAt));
  const log = await db.select().from(auditLogs).where(eq(auditLogs.businessId, business.id)).orderBy(asc(auditLogs.createdAt));

  console.log(`${c.bold}Appointments${c.reset}`);
  for (const a of appts)
    console.log(`  ${a.service.name} · ${DateTime.fromJSDate(a.appointment.startsAt).setZone(TZ).toFormat("ccc d LLL, HH:mm")} · ${a.customer.name} · ${a.appointment.status} · source=${a.appointment.source}`);
  console.log(`${c.bold}Lead${c.reset}: ${lead?.status} (interest: ${lead?.serviceInterest ?? "—"})`);
  console.log(`${c.bold}Conversation${c.reset}: owner=${conv.owner} status=${conv.status} · HUMAN REQUIRED in inbox: ${inbox.some((i) => i.conversation.id === conv.id)}`);
  console.log(`${c.bold}AI tool calls${c.reset}: ${calls.map((x) => `${x.tool}(${x.status})`).join(", ")}`);
  console.log(`\n${c.bold}Audit log${c.reset}`);
  for (const l of log.filter((x) => x.actorType !== "user"))
    console.log(`  ${DateTime.fromJSDate(l.createdAt).setZone(TZ).toFormat("HH:mm:ss")}  ${l.actorLabel.padEnd(28)} ${l.action.padEnd(32)} ${l.summary}`);

  const checks: [string, boolean][] = [
    ["exactly one appointment", appts.length === 1],
    ["moved to 15:00 tomorrow", appts[0] ? DateTime.fromJSDate(appts[0].appointment.startsAt).setZone(TZ).toFormat("HH:mm") === "15:00" : false],
    ["booked by the AI", appts[0]?.appointment.source === "ai"],
    ["lead is appointment_booked", lead?.status === "appointment_booked"],
    ["conversation handed to a human", conv.owner === "human"],
    ["booking + reschedule + handoff audited", ["appointment.booked", "appointment.rescheduled", "conversation.handoff_requested"].every((a) => log.some((l) => l.action === a))],
  ];
  console.log(`\n${c.bold}Checks${c.reset}`);
  for (const [name, ok] of checks) console.log(`  ${ok ? c.green + "PASS" : c.red + "FAIL"}${c.reset} ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
