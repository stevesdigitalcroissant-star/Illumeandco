import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { parseDate, parseStartTime, parseTime, parseTimeOfDay } from "@/server/ai/datetime";
import { extractContact, findMentionedService } from "@/server/ai/providers/rules";
import { findUnsupportedClaim, preCheck } from "@/server/ai/safety";

const now = DateTime.fromISO("2026-10-06T10:00", { zone: "Asia/Dubai" }); // a Tuesday

describe("natural language parsing", () => {
  it("parses times", () => {
    expect(parseTime("2pm works")).toBe("14:00");
    expect(parseTime("2:30 PM")).toBe("14:30");
    expect(parseTime("14:30")).toBe("14:30");
    expect(parseTime("Actually can we make it 3pm?")).toBe("15:00");
    expect(parseTime("at 3")).toBe("15:00");
    expect(parseTime("11am")).toBe("11:00");
    expect(parseTime("noon")).toBe("12:00");
    expect(parseTime("2")).toBe("14:00");
    expect(parseTime("I need 2 people booked")).toBeNull();
    expect(parseTime("how much is whitening")).toBeNull();
  });

  it("parses dates relative to the business timezone", () => {
    expect(parseDate("can I come tomorrow?", now)).toBe("2026-10-07");
    expect(parseDate("today please", now)).toBe("2026-10-06");
    expect(parseDate("on friday", now)).toBe("2026-10-09");
    expect(parseDate("next tuesday", now)).toBe("2026-10-13");
    expect(parseDate("12 October", now)).toBe("2026-10-12");
    expect(parseDate("Oct 3", now)).toBe("2027-10-03");
    expect(parseDate("how much", now)).toBeNull();
    expect(parseTimeOfDay("tomorrow afternoon")).toBe("afternoon");
  });

  it("interprets model-supplied times in the business timezone unless an offset is given", () => {
    expect(parseStartTime("2026-10-07T14:00", "Asia/Dubai")!.toISOString()).toBe("2026-10-07T10:00:00.000Z");
    expect(parseStartTime("2026-10-07T14:00:00+04:00", "UTC")!.toISOString()).toBe("2026-10-07T10:00:00.000Z");
    expect(parseStartTime("nonsense", "UTC")).toBeNull();
  });

  it("extracts contact details and services", () => {
    expect(extractContact("Sarah Johnson, +971 50 123 4567")).toEqual({ name: "Sarah Johnson", email: null, phone: "+971 50 123 4567" });
    expect(extractContact("my name is maya patel, maya@example.com")).toMatchObject({ name: "Maya Patel", email: "maya@example.com" });
    const services = [
      { id: "1", name: "Dental consultation", category: null },
      { id: "2", name: "Teeth whitening", category: null },
      { id: "3", name: "Cleaning", category: null },
    ];
    expect(findMentionedService("how much is whitening?", services)?.id).toBe("2");
    expect(findMentionedService("I'd like a consultation", services)?.id).toBe("1");
    expect(findMentionedService("hello", services)).toBeNull();
  });
});

describe("safety layer", () => {
  it("routes sensitive messages before the model", () => {
    expect(preCheck("Can someone call me?", "salon").kind).toBe("handoff");
    expect(preCheck("STOP", "salon").kind).toBe("opt_out");
    expect(preCheck("I want a refund", "salon").kind).toBe("handoff");
    expect(preCheck("What dose of ibuprofen should I take?", "dentist").kind).toBe("handoff");
    expect(preCheck("Do you do root canal treatment?", "dentist").kind).toBe("none");
    expect(preCheck("How much is a haircut?", "barber").kind).toBe("none");
  });

  it("flags claims that no tool backs up", () => {
    expect(findUnsupportedClaim("I've booked you for 3pm", [])).toBe("booking");
    expect(findUnsupportedClaim("I've booked you for 3pm", [{ tool: "book_appointment", ok: true }])).toBeNull();
    expect(findUnsupportedClaim("I've booked you for 3pm", [{ tool: "book_appointment", ok: false }])).toBe("booking");
    expect(findUnsupportedClaim("Your appointment has been cancelled", [])).toBe("cancellation");
    expect(findUnsupportedClaim("Would you like me to book it?", [])).toBeNull();
  });
});
