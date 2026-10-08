/**
 * The AI receptionist's tools. Each one performs a real action through the
 * service layer. Tools act only on the *current conversation's customer* —
 * the model can never read or change another customer's appointments.
 */
import { and, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { z } from "zod";
import { appointments, services as servicesTable } from "@/db/schema";
import { AppError, dbOf, invalid, notFound } from "../../context";
import { getChannel } from "../../channels/registry";
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  upcomingForCustomer,
} from "../../services/appointments";
import { getAvailableSlots } from "../../services/availability";
import { getBusinessHours } from "../../services/business";
import { listServices, listStaff } from "../../services/catalog";
import { addEvent, requestHandoff } from "../../services/conversations";
import { getCustomer, rememberFact, updateCustomer } from "../../services/customers";
import { scheduleFollowUp } from "../../services/followups";
import { attachContactDetails } from "../../services/identity";
import { searchKnowledge } from "../../services/knowledge";
import { latestLeadForCustomer, updateLead, upsertLead } from "../../services/leads";
import { scheduleReviewRequest } from "../../services/reviews";
import { addToWaitlist } from "../../recovery/slots";
import { formatMoney, spread } from "@/lib/utils";
import { parseStartTime, TIME_OF_DAY_WINDOWS } from "../datetime";
import { defineTool, type ToolContext, type ToolDef } from "./registry";

const WEEKDAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function priceText(s: { priceCents: number | null; priceIsFrom: boolean }, currency: string) {
  return formatMoney(s.priceCents, currency, { from: s.priceIsFrom });
}

/** Match a service by id or (fuzzy) name within this business. */
export async function resolveService(tc: ToolContext, ref: string) {
  const all = await listServices(tc.ctx);
  const byId = all.find((s) => s.id === ref);
  if (byId) return byId;
  const q = ref.toLowerCase().trim();
  const exact = all.find((s) => s.name.toLowerCase() === q);
  if (exact) return exact;
  const contains = all.filter((s) => s.name.toLowerCase().includes(q) || q.includes(s.name.toLowerCase()));
  if (contains.length === 1) return contains[0]!;
  const words = q.split(/\W+/).filter((w) => w.length > 2);
  const scored = all
    .map((s) => ({ s, score: words.filter((w) => s.name.toLowerCase().includes(w) || (s.category ?? "").toLowerCase().includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length && (scored.length === 1 || scored[0]!.score > scored[1]!.score)) return scored[0]!.s;
  throw new AppError(
    "not_found",
    `No single service matches "${ref}". Services offered: ${all.map((s) => s.name).join(", ") || "none configured"}.`,
  );
}

function slotForModel(s: { startsAt: string; label: string; staffName: string }) {
  return { start_time: s.startsAt, label: s.label, staff: s.staffName };
}

async function customerAppointment(tc: ToolContext, appointmentId?: string) {
  const upcoming = await upcomingForCustomer(tc.ctx, tc.customerId, tc.now);
  if (appointmentId) {
    const hit = upcoming.find((a) => a.appointment.id === appointmentId);
    // Either it doesn't exist or belongs to someone else — same answer, no information leak.
    if (!hit) throw notFound("Upcoming appointment for this customer");
    return hit;
  }
  if (!upcoming.length) throw new AppError("not_found", "This customer has no upcoming appointments.");
  if (upcoming.length > 1)
    throw new AppError(
      "invalid",
      `The customer has several upcoming appointments; ask which one: ${upcoming
        .map((a) => `${a.service.name} on ${DateTime.fromJSDate(a.appointment.startsAt).setZone(tc.business.timezone).toFormat("ccc d LLL, h:mm a")} (id ${a.appointment.id})`)
        .join("; ")}`,
    );
  return upcoming[0]!;
}

async function maybeSaveContact(tc: ToolContext, input: { customer_name?: string; customer_phone?: string; customer_email?: string }) {
  if (!input.customer_name && !input.customer_phone && !input.customer_email) return;
  const r = await attachContactDetails(tc.ctx, {
    conversationId: tc.conversationId,
    customerId: tc.customerId,
    name: input.customer_name,
    phone: input.customer_phone,
    email: input.customer_email,
  });
  tc.customerId = r.customerId;
}

const contactFields = {
  customer_name: z.string().min(1).max(120).optional().describe("Customer's full name, if they gave it"),
  customer_phone: z.string().max(40).optional().describe("Customer's phone number, if they gave it"),
  customer_email: z.string().max(200).optional().describe("Customer's email, if they gave it"),
};

export const TOOLS: ToolDef[] = [
  defineTool({
    name: "get_business_information",
    description: "Get the business's name, address, contact details, opening hours, timezone and policies (cancellation, refund, late arrival, booking).",
    permission: "answer_faqs",
    input: z.object({}),
    async run(tc) {
      const hours = await getBusinessHours(tc.ctx);
      const byDay: Record<number, string[]> = {};
      for (const h of hours) (byDay[h.weekday] ??= []).push(`${h.openTime}–${h.closeTime}`);
      const b = tc.business;
      return {
        name: b.name,
        type: b.type,
        description: b.description,
        address: [b.address, b.city, b.country].filter(Boolean).join(", ") || null,
        phone: b.phone,
        email: b.email,
        website: b.website,
        timezone: b.timezone,
        currency: b.currency,
        opening_hours: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [WEEKDAY_NAMES[d], byDay[d]?.join(", ") ?? "Closed"])),
        policies: {
          cancellation: b.policies.cancellation ?? null,
          refund: b.policies.refund ?? null,
          late_arrival: b.policies.late ?? null,
          booking: b.policies.booking ?? null,
        },
      };
    },
  }),

  defineTool({
    name: "search_knowledge_base",
    description: "Search the business's own knowledge base (FAQs, documents, website) for an answer. Always use this before answering questions about the business that other tools don't cover.",
    permission: "answer_faqs",
    input: z.object({ query: z.string().min(2).max(300).describe("The customer's question, rephrased as a search query") }),
    async run(tc, { query }) {
      const hits = await searchKnowledge(tc.ctx, query, 4);
      return hits.length
        ? { results: hits.map((h) => ({ source: h.sourceTitle, content: h.content })) }
        : { results: [], note: "Nothing in the knowledge base matches. Do not guess — say you don't have that information and offer to have the team confirm." };
    },
  }),

  defineTool({
    name: "get_services",
    description: "List the services offered, with prices, durations and whether they can be booked online.",
    permission: "answer_faqs",
    input: z.object({}),
    async run(tc) {
      const list = await listServices(tc.ctx);
      return {
        currency: tc.business.currency,
        services: list.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          price: priceText(s, tc.business.currency),
          duration_minutes: s.durationMinutes,
          bookable_online: s.onlineBookingEnabled,
        })),
      };
    },
  }),

  defineTool({
    name: "get_service_details",
    description: "Get details for one service (description, price, duration, who performs it, online booking).",
    permission: "answer_faqs",
    input: z.object({ service: z.string().min(1).describe("Service name or id") }),
    async run(tc, { service }) {
      const s = await resolveService(tc, service);
      tc.state.lastServiceId = s.id;
      const staffList = await listStaff(tc.ctx);
      const performers = s.staffIds.length ? staffList.filter((m) => s.staffIds.includes(m.id)).map((m) => m.name) : staffList.map((m) => m.name);
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        price: priceText(s, tc.business.currency),
        duration_minutes: s.durationMinutes,
        performed_by: performers,
        bookable_online: s.onlineBookingEnabled,
        note: s.onlineBookingEnabled ? undefined : "This service cannot be booked by the AI; offer to have the team arrange it.",
      };
    },
  }),

  defineTool({
    name: "get_available_appointments",
    description:
      "Find real available appointment times for a service. Never state availability without calling this. Dates are YYYY-MM-DD in the business timezone. Returns start_time values to pass to book_appointment.",
    permission: ["book_appointments", "reschedule_appointments"],
    input: z.object({
      service: z.string().min(1).describe("Service name or id"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Day to search (default: today)"),
      date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Optional last day of a range (max 14 days)"),
      time_of_day: z.enum(["morning", "afternoon", "evening", "any"]).optional(),
      staff: z.string().optional().describe("Preferred staff member name"),
      time: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("Specific time HH:mm the customer asked for; returns the closest available times"),
    }),
    async run(tc, input) {
      const s = await resolveService(tc, input.service);
      tc.state.lastServiceId = s.id;
      const today = DateTime.fromJSDate(tc.now).setZone(tc.business.timezone).toISODate()!;
      const from = input.date ?? today;
      let to = input.date_to ?? (input.date ? input.date : DateTime.fromISO(today).plus({ days: 6 }).toISODate()!);
      if (DateTime.fromISO(to).diff(DateTime.fromISO(from), "days").days > 14) to = DateTime.fromISO(from).plus({ days: 14 }).toISODate()!;
      let staffId: string | undefined;
      if (input.staff) {
        const match = (await listStaff(tc.ctx)).find((m) => m.name.toLowerCase().includes(input.staff!.toLowerCase()));
        if (!match) throw notFound(`Staff member "${input.staff}"`);
        staffId = match.id;
      }
      const window = input.time_of_day && input.time_of_day !== "any" ? TIME_OF_DAY_WINDOWS[input.time_of_day] : undefined;
      const { slots, reason } = await getAvailableSlots(tc.ctx, {
        serviceId: s.id,
        fromDate: from,
        toDate: to,
        staffId,
        timeFrom: window?.[0],
        timeTo: window?.[1],
        now: tc.now,
      });
      let shown: typeof slots;
      if (input.time) {
        // Closest times to the requested one (an exact match comes first if free).
        const target = DateTime.fromISO(`${from}T${input.time}`, { zone: tc.business.timezone }).toMillis();
        shown = [...slots]
          .sort((a, b) => Math.abs(DateTime.fromISO(a.startsAt).toMillis() - target) - Math.abs(DateTime.fromISO(b.startsAt).toMillis() - target))
          .slice(0, 6)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      } else {
        // A sample spread across the whole period, not just the first hours.
        shown = spread(slots, 12);
      }
      tc.state.lastDate = from;
      tc.state.offeredSlots = shown.map((x) => ({ startsAt: x.startsAt, label: x.label, staffId: x.staffId }));
      return {
        service: s.name,
        duration_minutes: s.durationMinutes,
        price: priceText(s, tc.business.currency),
        searched: { from, to, time_of_day: input.time_of_day ?? "any", ...(input.time ? { requested_time: input.time } : {}) },
        available: shown.map(slotForModel),
        total_available: slots.length,
        ...(slots.length ? {} : { note: reason ?? "No availability in that period." }),
      };
    },
  }),

  defineTool({
    name: "book_appointment",
    description:
      "Book an appointment at a start_time returned by get_available_appointments. Include the customer's name and phone or email if they have shared them. Only tell the customer they are booked if this returns success.",
    permission: "book_appointments",
    input: z.object({
      service: z.string().min(1),
      start_time: z.string().min(10).describe("ISO 8601 start time from get_available_appointments"),
      staff: z.string().optional(),
      notes: z.string().max(500).optional(),
      ...contactFields,
    }),
    async run(tc, input) {
      const s = await resolveService(tc, input.service);
      const startsAt = parseStartTime(input.start_time, tc.business.timezone);
      if (!startsAt) throw invalid("start_time is not a valid date/time.");
      await maybeSaveContact(tc, input);
      const customer = await getCustomer(tc.ctx, tc.customerId);
      const rules = tc.settings.booking;
      const missing: string[] = [];
      if (rules.requireName && !customer.name) missing.push("name");
      if (rules.requireContact && !customer.phone && !customer.email) missing.push("phone number or email");
      if (missing.length) {
        tc.state.pendingBooking = { serviceId: s.id, startsAt: startsAt.toISOString() };
        throw new AppError("invalid", `Not booked yet: the business requires the customer's ${missing.join(" and ")} before booking. Ask for it, then call book_appointment again.`);
      }
      let staffId: string | undefined;
      if (input.staff) staffId = (await listStaff(tc.ctx)).find((m) => m.name.toLowerCase().includes(input.staff!.toLowerCase()))?.id;
      const r = await bookAppointment(tc.ctx, {
        serviceId: s.id,
        startsAt,
        staffId,
        customerId: tc.customerId,
        source: "ai",
        conversationId: tc.conversationId,
        notes: input.notes,
        now: tc.now,
      });
      tc.state.pendingBooking = undefined;
      tc.state.offeredSlots = undefined;
      return {
        booked: true,
        appointment_id: r.appointment.id,
        service: r.service.name,
        when: r.label,
        start_time: r.appointment.startsAt.toISOString(),
        with: r.staffName,
        price: priceText(r.service, tc.business.currency),
        customer_name: customer.name,
      };
    },
  }),

  defineTool({
    name: "get_customer_appointments",
    description: "List the current customer's upcoming appointments (with ids for rescheduling or cancelling).",
    permission: ["book_appointments", "reschedule_appointments", "cancel_appointments"],
    input: z.object({}),
    async run(tc) {
      const list = await upcomingForCustomer(tc.ctx, tc.customerId, tc.now);
      return {
        appointments: list.map((a) => ({
          appointment_id: a.appointment.id,
          service: a.service.name,
          when: DateTime.fromJSDate(a.appointment.startsAt).setZone(tc.business.timezone).toFormat("ccc d LLL, h:mm a"),
          start_time: a.appointment.startsAt.toISOString(),
          with: a.staff.name,
          status: a.appointment.status,
        })),
      };
    },
  }),

  defineTool({
    name: "reschedule_appointment",
    description:
      "Move the current customer's upcoming appointment to a new start time. If appointment_id is omitted and they have exactly one upcoming appointment, that one is used. Check availability first.",
    permission: "reschedule_appointments",
    input: z.object({
      appointment_id: z.string().uuid().optional(),
      new_start_time: z.string().min(10).describe("ISO 8601 start time"),
    }),
    async run(tc, input) {
      const target = await customerAppointment(tc, input.appointment_id);
      const startsAt = parseStartTime(input.new_start_time, tc.business.timezone);
      if (!startsAt) throw invalid("new_start_time is not a valid date/time.");
      const r = await rescheduleAppointment(tc.ctx, target.appointment.id, { startsAt, now: tc.now });
      return { rescheduled: true, appointment_id: r.appointment.id, service: r.service.name, from: r.previousLabel, to: r.label, with: r.staffName };
    },
  }),

  defineTool({
    name: "cancel_appointment",
    description: "Cancel the current customer's upcoming appointment. Confirm with the customer first and mention the cancellation policy if there is one.",
    permission: "cancel_appointments",
    input: z.object({ appointment_id: z.string().uuid().optional(), reason: z.string().max(300).optional() }),
    async run(tc, input) {
      const target = await customerAppointment(tc, input.appointment_id);
      const r = await cancelAppointment(tc.ctx, target.appointment.id, input.reason ?? "Cancelled by customer via AI receptionist");
      tc.state.pendingCancelId = undefined;
      return { cancelled: true, appointment_id: r.appointment.id, service: r.serviceName, was: r.label };
    },
  }),

  defineTool({
    name: "create_customer",
    description: "Save the current customer's contact details (name, phone, email) when they share them.",
    permission: "capture_leads",
    input: z.object(contactFields),
    async run(tc, input) {
      if (!input.customer_name && !input.customer_phone && !input.customer_email) throw invalid("Provide at least one detail.");
      await maybeSaveContact(tc, input);
      const c = await getCustomer(tc.ctx, tc.customerId);
      return { saved: true, customer: { name: c.name, phone: c.phone, email: c.email } };
    },
  }),

  defineTool({
    name: "update_customer",
    description: "Correct the current customer's name, phone or email.",
    permission: "update_customers",
    input: z.object(contactFields),
    async run(tc, input) {
      const c = await updateCustomer(tc.ctx, tc.customerId, {
        ...(input.customer_name !== undefined ? { name: input.customer_name } : {}),
        ...(input.customer_phone !== undefined ? { phone: input.customer_phone } : {}),
        ...(input.customer_email !== undefined ? { email: input.customer_email } : {}),
      });
      return { updated: true, customer: { name: c.name, phone: c.phone, email: c.email } };
    },
  }),

  defineTool({
    name: "remember_customer_preference",
    description: "Remember a durable, non-medical preference about this customer (e.g. preferred staff member, language, usual time). Never store health information.",
    permission: "update_customers",
    input: z.object({ key: z.string().min(1).max(40), value: z.string().min(1).max(200) }),
    async run(tc, { key, value }) {
      await rememberFact(tc.ctx, tc.customerId, key, value);
      return { remembered: true };
    },
  }),

  defineTool({
    name: "create_lead",
    description: "Record this customer as a lead interested in a service.",
    permission: "capture_leads",
    input: z.object({ service: z.string().optional(), interest: z.string().max(200).optional(), notes: z.string().max(500).optional() }),
    async run(tc, input) {
      let serviceId: string | null = null;
      let interest = input.interest ?? null;
      if (input.service) {
        const s = await resolveService(tc, input.service).catch(() => null);
        serviceId = s?.id ?? null;
        interest = interest ?? s?.name ?? input.service;
      }
      const { lead, created } = await upsertLead(tc.ctx, {
        customerId: tc.customerId,
        source: tc.channel,
        conversationId: tc.conversationId,
        serviceId,
        serviceInterest: interest,
        notes: input.notes,
      });
      return { lead_id: lead.id, status: lead.status, created };
    },
  }),

  defineTool({
    name: "add_to_waitlist",
    description:
      "Put the customer on the waitlist for a service when no suitable time is available. They'll be offered a slot if one frees up (by message, first come first served). Needs their phone or email first. Never promise they will get a slot.",
    permission: "capture_leads",
    input: z.object({
      service: z.string().describe("Service name or id"),
      earliest_date: z.string().describe("YYYY-MM-DD, first acceptable day"),
      latest_date: z.string().optional().describe("YYYY-MM-DD, last acceptable day"),
      times_of_day: z.array(z.enum(["morning", "afternoon", "evening"])).optional().describe("Empty = any time"),
    }),
    async run(tc, input) {
      const customer = await getCustomer(tc.ctx, tc.customerId);
      if (!customer.phone && !customer.email) throw invalid("Ask for the customer's phone number or email first, so we can tell them when a slot opens.");
      const service = await resolveService(tc, input.service);
      const entry = await addToWaitlist(tc.ctx, {
        customerId: tc.customerId,
        serviceId: service.id,
        earliestDate: input.earliest_date,
        latestDate: input.latest_date ?? null,
        dayparts: input.times_of_day ?? [],
        source: tc.channel,
      });
      return { waitlisted: true, service: service.name, from: entry.earliestDate, to: entry.latestDate, times_of_day: entry.dayparts.length ? entry.dayparts : ["any"] };
    },
  }),

  defineTool({
    name: "update_lead",
    description: "Update the current customer's lead status or notes (e.g. qualified, lost).",
    permission: "capture_leads",
    input: z.object({ status: z.enum(["contacted", "qualified", "lost"]).optional(), notes: z.string().max(500).optional() }),
    async run(tc, input) {
      const lead = await latestLeadForCustomer(tc.ctx, tc.customerId);
      if (!lead) throw notFound("Lead");
      const l = await updateLead(tc.ctx, lead.id, {
        ...(input.status ? { status: input.status } : {}),
        ...(input.notes ? { notes: lead.notes ? `${lead.notes}\n${input.notes}` : input.notes } : {}),
      });
      return { lead_id: l.id, status: l.status };
    },
  }),

  defineTool({
    name: "send_message",
    description: "Send the current customer a message on another channel (email, sms or whatsapp), e.g. booking details by email. Reports honestly if that channel is not set up.",
    permission: "send_messages",
    input: z.object({ channel: z.enum(["email", "sms", "whatsapp"]), text: z.string().min(1).max(1500), subject: z.string().max(150).optional() }),
    async run(tc, input) {
      const customer = await getCustomer(tc.ctx, tc.customerId);
      if (customer.optedOut) throw new AppError("invalid", "The customer opted out of messages.");
      const adapter = getChannel(input.channel);
      const result = await adapter.send({
        businessId: tc.ctx.businessId,
        businessName: tc.business.name,
        to: { name: customer.name, email: customer.email, phone: customer.phone },
        subject: input.subject,
        text: input.text,
      });
      if (!result.ok) throw new AppError("unavailable", `Message NOT sent: ${result.detail}`);
      await addEvent(tc.ctx, tc.conversationId, `Sent ${adapter.label.toLowerCase()} to customer: "${input.text.slice(0, 120)}"`, { kind: "message_sent", channel: input.channel });
      return { sent: true, channel: input.channel, status: result.status };
    },
  }),

  defineTool({
    name: "escalate_to_human",
    description:
      "Hand the conversation to a human team member. Use when the customer asks for a person, is unhappy, raises anything medical/clinical, legal, financial (refunds, disputes), an emergency, or anything you can't help with. After calling this, tell the customer a team member will reply and stop.",
    permission: null,
    input: z.object({ reason: z.string().min(3).max(300) }),
    async run(tc, { reason }) {
      await requestHandoff(tc.ctx, tc.conversationId, reason);
      tc.handedOff = true;
      return { handed_off: true, note: "The team has been notified and will reply in this conversation. The AI will stay silent from now on." };
    },
  }),

  defineTool({
    name: "create_follow_up",
    description: "Schedule a follow-up message to the customer later (e.g. they want to think about it).",
    permission: "create_follow_ups",
    input: z.object({ delay_hours: z.number().min(1).max(24 * 30).optional(), reason: z.string().min(3).max(200), message: z.string().max(500).optional() }),
    async run(tc, input) {
      const lead = await latestLeadForCustomer(tc.ctx, tc.customerId);
      const f = await scheduleFollowUp(tc.ctx, {
        customerId: tc.customerId,
        leadId: lead?.id ?? null,
        conversationId: tc.conversationId,
        delayHours: input.delay_hours,
        reason: input.reason,
        message: input.message,
      });
      return { scheduled: true, follow_up_id: f.id, when: DateTime.fromJSDate(f.scheduledFor).setZone(tc.business.timezone).toFormat("ccc d LLL, h:mm a") };
    },
  }),

  defineTool({
    name: "request_review",
    description: "Send a review request for one of this customer's completed appointments.",
    permission: "request_reviews",
    input: z.object({ appointment_id: z.string().uuid() }),
    async run(tc, { appointment_id }) {
      const appt = await dbOf(tc.ctx).query.appointments.findFirst({
        where: and(eq(appointments.businessId, tc.ctx.businessId), eq(appointments.id, appointment_id), eq(appointments.customerId, tc.customerId)),
      });
      if (!appt) throw notFound("Appointment");
      if (appt.status !== "completed") throw invalid("Reviews can only be requested after a completed appointment.");
      const r = await scheduleReviewRequest(tc.ctx, appt.id, { now: tc.now });
      if (!r) throw new AppError("unavailable", "Review requests are turned off for this business.");
      return { scheduled: true, review_id: r.id };
    },
  }),
];

export async function serviceNames(tc: ToolContext) {
  const rows = await dbOf(tc.ctx)
    .select({ id: servicesTable.id, name: servicesTable.name })
    .from(servicesTable)
    .where(and(eq(servicesTable.businessId, tc.ctx.businessId), eq(servicesTable.active, true)));
  return rows;
}
