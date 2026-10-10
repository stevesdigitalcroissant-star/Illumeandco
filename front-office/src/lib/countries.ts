/**
 * Countries: one place for everything that depends on where a business is —
 * phone number format, default currency, emergency number and display name.
 * A business picks its country once; phone numbers typed in local format
 * ("0412 345 678", "(512) 555-0142") are stored in international format so
 * texts and WhatsApp messages can reach them.
 */
import { getCountries, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Markets we focus on, listed first in every country picker. */
export const FEATURED_COUNTRIES = ["US", "CA", "AU", "GB", "NZ", "IE", "AE"] as const;

const names = new Intl.DisplayNames(["en"], { type: "region" });
export const countryName = (code: string | null | undefined) => {
  if (!code) return null;
  try {
    return names.of(code.toUpperCase()) ?? null;
  } catch {
    return null;
  }
};

export const ALL_COUNTRIES: { code: string; name: string }[] = getCountries()
  .map((code) => ({ code: code as string, name: countryName(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Featured markets first, then every other country A–Z. */
export const COUNTRY_OPTIONS = [
  ...FEATURED_COUNTRIES.map((code) => ({ code: code as string, name: countryName(code)! })),
  ...ALL_COUNTRIES.filter((c) => !(FEATURED_COUNTRIES as readonly string[]).includes(c.code)),
];

export const isCountryCode = (code: string | null | undefined): code is string => Boolean(code && (getCountries() as string[]).includes(code.toUpperCase()));

const EURO = new Set(["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"]);
const CURRENCY: Record<string, string> = {
  US: "USD", CA: "CAD", AU: "AUD", NZ: "NZD", GB: "GBP", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR",
  EG: "EGP", IN: "INR", PK: "PKR", SG: "SGD", ZA: "ZAR", CH: "CHF", MX: "MXN", BR: "BRL", JP: "JPY", HK: "HKD", PH: "PHP",
};
/** The currency a business in this country most likely prices in (USD when unknown). */
export function defaultCurrency(code: string | null | undefined) {
  const c = code?.toUpperCase();
  if (!c) return "USD";
  return EURO.has(c) ? "EUR" : (CURRENCY[c] ?? "USD");
}

const EMERGENCY: Record<string, string> = { US: "911", CA: "911", MX: "911", AU: "000", NZ: "111", GB: "999", IE: "112 or 999", AE: "999", SA: "911", QA: "999", IN: "112", SG: "995", ZA: "10177" };
/** Local emergency number, if known. EU countries use 112. */
export function emergencyNumber(code: string | null | undefined) {
  const c = code?.toUpperCase();
  if (!c) return null;
  return EMERGENCY[c] ?? (EURO.has(c) ? "112" : null);
}

/**
 * Normalize a phone number. With the business's country, local formats are
 * understood and stored as +E.164. Without one, the number must already
 * include its country code to be usable for texting (digits are kept as-is).
 * Throws on something that can't be a phone number.
 */
export function toE164(raw: string, country?: string | null): string | null {
  const trimmed = raw.trim();
  const parsed = parsePhoneNumberFromString(trimmed, isCountryCode(country) ? (country!.toUpperCase() as CountryCode) : undefined);
  if (parsed && parsed.isPossible()) return parsed.number;
  return null;
}
