/** Static choices shared by the onboarding server actions and client forms. */
import type { AiPermissionKey } from "@/server/ai/permissions";

export const FAQ_SOURCE_TITLE = "Frequently asked questions";

export const WEEKDAYS = [
  { n: 1, short: "Mon", label: "Monday" },
  { n: 2, short: "Tue", label: "Tuesday" },
  { n: 3, short: "Wed", label: "Wednesday" },
  { n: 4, short: "Thu", label: "Thursday" },
  { n: 5, short: "Fri", label: "Friday" },
  { n: 6, short: "Sat", label: "Saturday" },
  { n: 7, short: "Sun", label: "Sunday" },
] as const;

export const CURRENCIES = [
  { code: "USD", label: "USD — US dollar" },
  { code: "CAD", label: "CAD — Canadian dollar" },
  { code: "AUD", label: "AUD — Australian dollar" },
  { code: "NZD", label: "NZD — New Zealand dollar" },
  { code: "GBP", label: "GBP — British pound" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "AED", label: "AED — UAE dirham" },
  { code: "SAR", label: "SAR — Saudi riyal" },
  { code: "QAR", label: "QAR — Qatari riyal" },
  { code: "KWD", label: "KWD — Kuwaiti dinar" },
  { code: "BHD", label: "BHD — Bahraini dinar" },
  { code: "OMR", label: "OMR — Omani rial" },
  { code: "CHF", label: "CHF — Swiss franc" },
  { code: "SGD", label: "SGD — Singapore dollar" },
  { code: "HKD", label: "HKD — Hong Kong dollar" },
  { code: "INR", label: "INR — Indian rupee" },
  { code: "PKR", label: "PKR — Pakistani rupee" },
  { code: "EGP", label: "EGP — Egyptian pound" },
  { code: "ZAR", label: "ZAR — South African rand" },
  { code: "MXN", label: "MXN — Mexican peso" },
  { code: "BRL", label: "BRL — Brazilian real" },
  { code: "JPY", label: "JPY — Japanese yen" },
  { code: "PHP", label: "PHP — Philippine peso" },
] as const;

/** Must match the tones accepted by updateAgent() in server/services/ai-config. */
export const TONES = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "warm", label: "Warm" },
  { value: "calm", label: "Calm" },
  { value: "upbeat", label: "Upbeat" },
  { value: "luxurious", label: "Luxurious" },
] as const;

export const EMOJI_OPTIONS = [
  { value: "none", label: "None" },
  { value: "light", label: "Light" },
  { value: "frequent", label: "Frequent" },
] as const;

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "hi", label: "Hindi" },
  { code: "ur", label: "Urdu" },
  { code: "ru", label: "Russian" },
  { code: "tr", label: "Turkish" },
  { code: "zh", label: "Chinese" },
] as const;

/** Permissions owners choose during onboarding (all on by default). */
export const ONBOARDING_PERMISSIONS = [
  "answer_faqs",
  "capture_leads",
  "book_appointments",
  "reschedule_appointments",
  "cancel_appointments",
] as const satisfies readonly AiPermissionKey[];

/** Shown, always off, never available to the AI. */
export const NEVER_PERMISSIONS = ["issue_refunds", "change_prices"] as const satisfies readonly AiPermissionKey[];
