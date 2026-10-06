/**
 * Natural-language date/time parsing in the business timezone.
 * Used by the built-in rules engine and to validate model-supplied times.
 */
import { DateTime } from "luxon";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export type TimeOfDay = "morning" | "afternoon" | "evening";
export const TIME_OF_DAY_WINDOWS: Record<TimeOfDay, [string, string]> = {
  morning: ["00:00", "12:00"],
  afternoon: ["12:00", "17:00"],
  evening: ["17:00", "23:59"],
};

/** Returns an ISO date (YYYY-MM-DD) if the text names a day. */
export function parseDate(text: string, now: DateTime): string | null {
  const t = text.toLowerCase();
  if (/\bday after tomorrow\b/.test(t)) return now.plus({ days: 2 }).toISODate();
  if (/\b(tomorrow|tmrw|tmr)\b/.test(t)) return now.plus({ days: 1 }).toISODate();
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(t)) return now.toISODate();
  for (let i = 0; i < 7; i++) {
    const name = WEEKDAYS[i]!;
    const re = new RegExp(`\\b(next\\s+)?(${name}|${name.slice(0, 3)})\\b`);
    const m = re.exec(t);
    if (m) {
      let delta = (i + 1 - now.weekday + 7) % 7;
      if (delta === 0) delta = 7;
      if (m[1] && delta < 7 && /\bnext\s+week\b/.test(t)) delta += 7;
      return now.plus({ days: delta }).toISODate();
    }
  }
  // "12 oct", "oct 12", "12th of october"
  const md =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3})[a-z]*\b/.exec(t) ?? null;
  const dm = /\b([a-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/.exec(t) ?? null;
  const pick = (day: number, monIdx: number) => {
    let d = DateTime.fromObject({ year: now.year, month: monIdx + 1, day }, { zone: now.zone });
    if (!d.isValid) return null;
    if (d < now.startOf("day")) d = d.plus({ years: 1 });
    return d.toISODate();
  };
  if (md && MONTHS.includes(md[2]!)) return pick(Number(md[1]), MONTHS.indexOf(md[2]!));
  if (dm && MONTHS.includes(dm[1]!)) return pick(Number(dm[2]), MONTHS.indexOf(dm[1]!));
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ordinal = /\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/.exec(t);
  if (ordinal) {
    let d = now.set({ day: Number(ordinal[1]) });
    if (d < now.startOf("day")) d = d.plus({ months: 1 });
    return d.isValid ? d.toISODate() : null;
  }
  return null;
}

/** Returns "HH:mm" if the text names a clock time. Ambiguous small hours (1–7) are read as PM. */
export function parseTime(text: string): string | null {
  const t = text.toLowerCase().replace(/\./g, "");
  if (/\bnoon\b|\bmidday\b/.test(t)) return "12:00";
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(t) ?? /\b(?:at|for|around|by|make it|to)\s+(\d{1,2})(?::(\d{2}))?\b(?!\s*(?:min|minutes|hours|days|people|th|st|nd|rd))/.exec(t) ?? /\b(\d{1,2}):(\d{2})\b/.exec(t) ?? /^\s*(\d{1,2})(?::(\d{2}))?\s*(?:works|is good|please|ok|okay|sounds good)?[\s!.]*$/.exec(t);
  if (!m) {
    const oclock = /\b(\d{1,2})\s*o'?clock\b/.exec(t);
    if (!oclock) return null;
    return normalizeHour(Number(oclock[1]), 0, undefined);
  }
  return normalizeHour(Number(m[1]), Number(m[2] ?? 0), m[3]);
}

function normalizeHour(h: number, min: number, ampm: string | undefined) {
  if (h > 23 || min > 59) return null;
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (!ampm && h >= 1 && h <= 7) h += 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function parseTimeOfDay(text: string): TimeOfDay | null {
  const t = text.toLowerCase();
  if (/\bmorning\b/.test(t)) return "morning";
  if (/\bafternoon\b/.test(t)) return "afternoon";
  if (/\b(evening|tonight|after work)\b/.test(t)) return "evening";
  return null;
}

/**
 * Parse a model-supplied start time. Accepts full ISO with offset, or a local
 * "YYYY-MM-DDTHH:mm" which is interpreted in the business timezone.
 */
export function parseStartTime(value: string, timezone: string): Date | null {
  if (!value) return null;
  const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value.trim());
  const dt = hasOffset ? DateTime.fromISO(value.trim()) : DateTime.fromISO(value.trim(), { zone: timezone });
  return dt.isValid ? dt.toJSDate() : null;
}

export function localDateTime(date: string, time: string, timezone: string) {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  return dt.isValid ? dt.toJSDate() : null;
}
