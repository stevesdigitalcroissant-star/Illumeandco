/**
 * Built-in rules engine — the offline provider used when no LLM is configured.
 *
 * It understands the core front-desk intents (prices, availability, booking,
 * rescheduling, cancelling, hours, location, FAQs) with deterministic parsing,
 * and performs every action through the same permission-checked tools as the
 * LLM. Replies are composed only from tool results, so it cannot invent
 * facts. It is clearly labelled in the dashboard as the basic engine.
 */
import { DateTime } from "luxon";
import { spread } from "@/lib/utils";
import { listServices } from "../../services/catalog";
import { parseDate, parseTime, parseTimeOfDay } from "../datetime";
import type { ToolResult } from "../tools/registry";
import type { ModelProvider, ProviderInput, ProviderOutput } from "./types";

type Svc = { id: string; name: string; category: string | null };
type SlotOut = { start_time: string; label: string; staff: string };

const GENERIC_WORDS = new Set(["treatment", "session", "service", "appointment", "dental", "full", "basic", "premium", "standard", "with", "and", "the", "for", "minute", "minutes", "hair"]);

export function findMentionedService(text: string, services: Svc[]): Svc | null {
  const t = text.toLowerCase();
  const exact = services.filter((s) => t.includes(s.name.toLowerCase()));
  if (exact.length) return exact.sort((a, b) => b.name.length - a.name.length)[0]!;
  const scored = services
    .map((s) => {
      const words = s.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w));
      return { s, score: words.filter((w) => new RegExp(`\\b${w.replace(/s$/, "")}`).test(t)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length && (scored.length === 1 || scored[0]!.score > scored[1]!.score)) return scored[0]!.s;
  return null;
}

export function extractContact(text: string) {
  const email = /[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}/i.exec(text)?.[0] ?? null;
  const phoneMatch = /(\+?\d[\d\s\-()]{6,}\d)/.exec(text.replace(email ?? "", ""));
  const phone = phoneMatch ? phoneMatch[1]!.trim() : null;
  let name: string | null = null;
  const named = /\b(?:my name is|i am|i'm|this is|name'?s|it'?s)\s+([a-z][a-z'-]+(?:\s+[a-z][a-z'-]+){0,3})/i.exec(text);
  if (named) name = named[1]!;
  else {
    // "Sarah Johnson, +971 50 123 4567" → leading capitalised words
    const rest = text.replace(email ?? "", "").replace(phone ?? "", "").replace(/[,;:]/g, " ").trim();
    const caps = /^([A-Z][a-z'-]+(?:\s+[A-Z][a-z'-]+){0,3})\b/.exec(rest);
    if (caps && (email || phone) && !/^(Hi|Hello|Hey|Yes|Sure|Ok|Okay|My|It|Thanks)$/i.test(caps[1]!.split(" ")[0]!)) name = caps[1]!;
  }
  if (name) name = name.replace(/\b(and|my|phone|number|email|is)\b.*$/i, "").trim().replace(/\b\w/g, (c) => c.toUpperCase());
  return { name: name || null, email, phone };
}

const YES_RE = /^\s*(yes|yeah|yep|yup|sure|ok|okay|please|please do|go ahead|confirm|correct|that'?s right|do it)\b/i;
const NO_RE = /^\s*(no|nope|nah|don'?t|do not|never ?mind|keep it)\b/i;

function listTimes(slots: SlotOut[], tz: string, sameDay: boolean) {
  const fmt = (s: SlotOut) => {
    const dt = DateTime.fromISO(s.start_time).setZone(tz);
    return sameDay ? dt.toFormat("h:mm a") : dt.toFormat("ccc d LLL 'at' h:mm a");
  };
  const picks = spread(slots, 3).map(fmt);
  if (picks.length === 1) return picks[0]!;
  return `${picks.slice(0, -1).join(", ")} and ${picks.at(-1)}`;
}

function dayPhrase(date: string, now: DateTime) {
  const d = DateTime.fromISO(date, { zone: now.zone });
  const diff = Math.round(d.startOf("day").diff(now.startOf("day"), "days").days);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return `on ${d.toFormat("cccc d LLLL")}`;
}

export function createRulesProvider(): ModelProvider {
  return {
    id: "rules",
    label: "Built-in rules engine (basic)",
    isConfigured: () => true,
    async run(input: ProviderInput): Promise<ProviderOutput> {
      const tc = input.toolContext;
      const tz = tc.business.timezone;
      const now = DateTime.fromJSDate(tc.now).setZone(tz);
      const text = [...input.history].reverse().find((h) => h.role === "user")?.text ?? "";
      const lower = text.toLowerCase();
      const allowed = new Set(input.tools.map((t) => t.name));
      // Disallowed tools are still routed through execute so the attempt is refused and logged.
      const call = (name: string, args: Record<string, unknown> = {}): Promise<ToolResult> => input.execute(name, args);
      const reply = (t: string): ProviderOutput => ({ text: t, stopReason: "end_turn", model: "rules" });
      const state = tc.state;
      const services: Svc[] = (await listServices(tc.ctx)).map((s) => ({ id: s.id, name: s.name, category: s.category }));
      const mentioned = findMentionedService(text, services);
      const date = parseDate(text, now);
      const time = parseTime(text);
      const timeOfDay = parseTimeOfDay(text);
      const contact = extractContact(text);

      // ── Pending cancellation confirmation ─────────────────────────
      if (state.pendingCancelId) {
        if (YES_RE.test(text)) {
          const r = await call("cancel_appointment", { appointment_id: state.pendingCancelId });
          state.pendingCancelId = undefined;
          if (!r.ok) return reply(`I wasn't able to cancel it: ${r.error}`);
          const d = r.data as { service: string; was: string };
          return reply(`Done — your ${d.service} on ${d.was} has been cancelled. Would you like to book another time?`);
        }
        if (NO_RE.test(text)) {
          state.pendingCancelId = undefined;
          return reply("No problem — I've left your appointment as it is.");
        }
      }

      // ── Offer of human help accepted ──────────────────────────────
      if (state.offeredHandoff && YES_RE.test(text)) {
        state.offeredHandoff = false;
        const r = await call("escalate_to_human", { reason: String(state.offeredHandoffReason ?? "Customer question the AI could not answer") });
        return reply(r.ok ? "Great — I've passed this to the team and someone will reply here shortly." : "Sorry, I couldn't reach the team just now. Please try again in a moment.");
      }

      // ── Contact details shared ────────────────────────────────────
      if (contact.email || contact.phone || (contact.name && state.pendingBooking)) {
        if (state.pendingBooking) {
          const pb = state.pendingBooking;
          const r = await call("book_appointment", {
            service: pb.serviceId,
            start_time: pb.startsAt,
            ...(contact.name ? { customer_name: contact.name } : {}),
            ...(contact.phone ? { customer_phone: contact.phone } : {}),
            ...(contact.email ? { customer_email: contact.email } : {}),
          });
          if (r.ok) {
            const d = r.data as { service: string; when: string; with: string; customer_name: string | null };
            return reply(`Perfect${d.customer_name ? `, ${d.customer_name.split(" ")[0]}` : ""}. I've booked your ${d.service} for ${d.when} with ${d.with}. See you then!`);
          }
          return reply(r.error.startsWith("Not booked yet") ? "Thanks! Could you also share your full name and a phone number or email so I can complete the booking?" : `I couldn't complete the booking: ${r.error}`);
        }
        const r = await call("create_customer", {
          ...(contact.name ? { customer_name: contact.name } : {}),
          ...(contact.phone ? { customer_phone: contact.phone } : {}),
          ...(contact.email ? { customer_email: contact.email } : {}),
        });
        if (r.ok) return reply("Thanks, I've saved your details. How can I help — would you like to book an appointment?");
      }

      // ── Cancellation ──────────────────────────────────────────────
      if (/\bcancel\b/.test(lower) && !/\bpolicy\b/.test(lower)) {
        const r = await call("get_customer_appointments");
        if (!r.ok) return reply(r.denied ? "I'm not able to cancel appointments here, but I can connect you with the team. Would you like that?" : `Sorry, I couldn't look that up: ${r.error}`);
        const list = (r.data as { appointments: { appointment_id: string; service: string; when: string }[] }).appointments;
        if (!list.length) return reply("I can't find an upcoming appointment for you in this conversation. Could you share the name and phone number or email used for the booking?");
        const target = list[0]!;
        if (!allowed.has("cancel_appointment")) {
          state.offeredHandoff = true;
          state.offeredHandoffReason = "Customer wants to cancel an appointment";
          return reply("I'm not able to cancel appointments myself, but I can ask the team to help. Shall I do that?");
        }
        state.pendingCancelId = target.appointment_id;
        const info = await call("get_business_information");
        const policy = info.ok ? (info.data as { policies: { cancellation: string | null } }).policies.cancellation : null;
        return reply(`Just to confirm — cancel your ${target.service} on ${target.when}?${policy ? ` (Our cancellation policy: ${policy})` : ""}`);
      }

      // ── Reschedule an existing appointment ────────────────────────
      const wantsChange = /\b(reschedul|move|change|push|instead|actually|make it|switch|later|earlier)\w*/.test(lower);
      if ((wantsChange || state.rescheduling) && !state.pendingBooking) {
        const r = await call("get_customer_appointments");
        const list = r.ok ? (r.data as { appointments: { appointment_id: string; service: string; start_time: string }[] }).appointments : [];
        if (list.length) {
          const target = list[0]!;
          if (!time && !date) {
            state.rescheduling = true;
            return reply(`Sure — what day and time would suit you better for your ${target.service}?`);
          }
          const current = DateTime.fromISO(target.start_time).setZone(tz);
          const newDate = date ?? current.toISODate()!;
          const newTime = time ?? current.toFormat("HH:mm");
          const start = DateTime.fromISO(`${newDate}T${newTime}`, { zone: tz });
          const res = await call("reschedule_appointment", { appointment_id: target.appointment_id, new_start_time: start.toISO() });
          state.rescheduling = false;
          if (res.ok) {
            const d = res.data as { service: string; to: string; with: string };
            return reply(`Done — I've moved your ${d.service} to ${d.to} with ${d.with}.`);
          }
          if (res.denied) {
            state.offeredHandoff = true;
            state.offeredHandoffReason = "Customer wants to reschedule";
            return reply("I'm not able to reschedule appointments myself, but I can ask the team to help. Shall I do that?");
          }
          const alt = await call("get_available_appointments", { service: target.service, date: newDate, time: newTime });
          const slots = alt.ok ? (alt.data as { available: SlotOut[] }).available : [];
          return reply(
            slots.length
              ? `Sorry, ${start.toFormat("h:mm a")} isn't available ${dayPhrase(newDate, now)}. I have ${listTimes(slots, tz, true)} — would one of those work?`
              : `Sorry, that time isn't available and ${dayPhrase(newDate, now)} is fully booked. Would another day work?`,
          );
        }
      }

      // ── Picking a time (booking) ──────────────────────────────────
      const serviceForBooking = mentioned?.id ?? state.lastServiceId;
      if (time && serviceForBooking) {
        const day = date ?? (state.lastDate as string | undefined) ?? now.toISODate()!;
        const start = DateTime.fromISO(`${day}T${time}`, { zone: tz });
        const avail = await call("get_available_appointments", { service: serviceForBooking, date: day, time });
        if (!avail.ok) return reply(avail.denied ? "I'm not able to book appointments here, but I can connect you with the team. Would you like that?" : `Sorry, I couldn't check availability: ${avail.error}`);
        const slots = (avail.data as { available: SlotOut[]; service: string }).available;
        const hit = slots.find((s) => DateTime.fromISO(s.start_time).toMillis() === start.toMillis());
        if (!hit) {
          return reply(
            slots.length
              ? `Sorry, ${start.toFormat("h:mm a")} isn't available ${dayPhrase(day, now)}. I have ${listTimes(slots, tz, true)} — would one of those work?`
              : `Sorry, there's no availability ${dayPhrase(day, now)}. Would you like me to check another day?`,
          );
        }
        const r = await call("book_appointment", { service: serviceForBooking, start_time: hit.start_time });
        if (r.ok) {
          const d = r.data as { service: string; when: string; with: string; customer_name: string | null };
          return reply(`Perfect${d.customer_name ? `, ${d.customer_name.split(" ")[0]}` : ""}. I've booked your ${d.service} for ${d.when} with ${d.with}.`);
        }
        if (r.error.startsWith("Not booked yet")) {
          state.pendingBooking = { serviceId: serviceForBooking, startsAt: hit.start_time };
          return reply(`${start.toFormat("h:mm a")} ${dayPhrase(day, now)} is available. To confirm the booking, could I have your full name and a phone number or email?`);
        }
        return reply(r.denied ? "I'm not able to book appointments myself, but I can ask the team to arrange it. Would you like that?" : `I couldn't book that: ${r.error}`);
      }

      // ── Availability ──────────────────────────────────────────────
      const asksAvailability = /\b(availab|free|open(ing)?s?\b|slot|can i (come|book|get)|come in|book|appointment|schedule|any(thing| time)|when can)\w*/.test(lower) || (!!date && !time);
      if (asksAvailability && !/\b(hours|open on|close)\b/.test(lower)) {
        if (!serviceForBooking) {
          const names = services.map((s) => s.name);
          return reply(names.length ? `Happy to check. Which service would you like — ${names.slice(0, -1).join(", ")}${names.length > 1 ? " or " : ""}${names.at(-1)}?` : "Online booking isn't set up yet — I can ask the team to contact you. Would you like that?");
        }
        if (mentioned) await call("create_lead", { service: mentioned.id });
        const day = date ?? now.toISODate()!;
        const r = await call("get_available_appointments", { service: serviceForBooking, date: day, ...(timeOfDay ? { time_of_day: timeOfDay } : {}) });
        if (!r.ok) return reply(r.denied ? "I'm not able to book here, but I can connect you with the team. Would you like that?" : `Sorry, I couldn't check availability: ${r.error}`);
        const d = r.data as { available: SlotOut[]; service: string };
        if (d.available.length) {
          state.lastDate = day;
          return reply(`Yes — ${dayPhrase(day, now)}${timeOfDay ? ` ${timeOfDay === "evening" ? "evening" : timeOfDay === "morning" ? "morning" : "afternoon"}` : ""} I have ${listTimes(d.available, tz, true)} available for ${d.service.toLowerCase()}. Which works better?`);
        }
        const wk = await call("get_available_appointments", { service: serviceForBooking, date: DateTime.fromISO(day).plus({ days: 1 }).toISODate(), date_to: DateTime.fromISO(day).plus({ days: 7 }).toISODate() });
        const next = wk.ok ? (wk.data as { available: SlotOut[] }).available : [];
        if (next.length) {
          state.lastDate = DateTime.fromISO(next[0]!.start_time).setZone(tz).toISODate()!;
          return reply(`Sorry, there's nothing ${dayPhrase(day, now)}${timeOfDay ? ` in the ${timeOfDay}` : ""}. The next available times are ${listTimes(next, tz, false)}. Would any of those work?`);
        }
        return reply("Sorry, I couldn't find any availability in the next week. Would you like me to ask the team to contact you?");
      }

      // ── Service / price question ──────────────────────────────────
      if (mentioned) {
        const r = await call("get_service_details", { service: mentioned.id });
        if (r.ok) {
          await call("create_lead", { service: mentioned.id });
          const d = r.data as { name: string; price: string; duration_minutes: number; bookable_online: boolean; description: string | null };
          const price = d.price === "Price on request" ? "is priced on request" : d.price.startsWith("from") ? `starts at ${d.price.slice(5)}` : `is ${d.price}`;
          return reply(`Our ${d.name.toLowerCase()} ${price} and takes about ${d.duration_minutes} minutes.${d.bookable_online ? " Would you like me to check availability this week?" : " The team books this one directly — shall I ask them to contact you?"}`);
        }
      }
      if (/\b(price|prices|cost|how much|menu|services|treatments|what do you (offer|do))\b/.test(lower)) {
        const r = await call("get_services");
        if (r.ok) {
          const d = r.data as { services: { name: string; price: string }[] };
          if (!d.services.length) return reply("I don't have our service list available yet, but I can have someone from the team confirm. Would you like that?");
          return reply(`Here's what we offer: ${d.services.slice(0, 6).map((s) => `${s.name} (${s.price})`).join(", ")}. Which one are you interested in?`);
        }
      }

      // ── Hours, location, policies ────────────────────────────────
      if (/\b(hours|open|opening|close|closing|when are you)\b/.test(lower)) {
        const r = await call("get_business_information");
        if (r.ok) {
          const d = r.data as { opening_hours: Record<string, string> };
          const entries = Object.entries(d.opening_hours);
          if (entries.every(([, v]) => v === "Closed")) return reply("I don't have our opening hours available, but I can have someone confirm. Would you like that?");
          return reply(`Our opening hours are: ${entries.map(([k, v]) => `${k} ${v}`).join(", ")}.`);
        }
      }
      if (/\b(where|address|location|located|directions|find you)\b/.test(lower)) {
        const r = await call("get_business_information");
        const addr = r.ok ? (r.data as { address: string | null }).address : null;
        if (addr) return reply(`We're at ${addr}.`);
      }
      if (/\bpolic(y|ies)\b|\blate\b|\brefund\b/.test(lower)) {
        const r = await call("get_business_information");
        if (r.ok) {
          const p = (r.data as { policies: Record<string, string | null> }).policies;
          const key = /cancel/.test(lower) ? "cancellation" : /late/.test(lower) ? "late_arrival" : /refund/.test(lower) ? "refund" : "booking";
          if (p[key]) return reply(p[key]!);
        }
      }

      // ── Small talk ────────────────────────────────────────────────
      if (/^\s*(thanks|thank you|thx|cheers|great|perfect|awesome)\b/i.test(text)) return reply("You're welcome! Is there anything else I can help with?");
      if (/^\s*(hi|hello|hey|good (morning|afternoon|evening)|salam|marhaba)\b[\s!.,]*$/i.test(text))
        return reply(`Hi! Welcome to ${tc.business.name}. How can I help you today?`);

      // ── Knowledge base ────────────────────────────────────────────
      const kb = await call("search_knowledge_base", { query: text.slice(0, 300) });
      if (kb.ok) {
        const results = (kb.data as { results: { content: string }[] }).results;
        if (results.length) {
          const top = results[0]!.content;
          const answer = /^Q:[\s\S]*?\nA:\s*([\s\S]+)$/.exec(top)?.[1] ?? top.split("\n").slice(1).join(" ").trim() ?? top;
          return reply(answer.length > 500 ? `${answer.slice(0, 497)}…` : answer);
        }
      }
      state.offeredHandoff = true;
      state.offeredHandoffReason = `Unanswered question: ${text.slice(0, 150)}`;
      return reply(`I don't have that information available, but I can have someone from ${tc.business.name} confirm it for you. Would you like that?`);
    },
  };
}
