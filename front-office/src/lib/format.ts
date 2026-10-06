import { DateTime } from "luxon";

export function fmtDateTime(d: Date | string, tz: string, fmt = "ccc d LLL, h:mm a") {
  return DateTime.fromJSDate(new Date(d)).setZone(tz).toFormat(fmt);
}
export function fmtTime(d: Date | string, tz: string) {
  return DateTime.fromJSDate(new Date(d)).setZone(tz).toFormat("h:mm a");
}
export function fmtRelative(d: Date | string | null | undefined) {
  if (!d) return "—";
  return DateTime.fromJSDate(new Date(d)).toRelative({ style: "short" }) ?? "—";
}
export function fmtDuration(secs: number | null) {
  if (secs == null) return "—";
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}
