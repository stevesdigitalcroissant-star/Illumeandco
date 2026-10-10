/** Countries: local phone formats, default currency and emergency numbers follow the business's country. */
import { describe, expect, it } from "vitest";
import { preCheck } from "@/server/ai/safety";
import { COUNTRY_OPTIONS, defaultCurrency, emergencyNumber, isCountryCode, toE164 } from "@/lib/countries";
import { updateBusiness } from "@/server/services/business";
import { createCustomer, findCustomerByContact, normalizePhone } from "@/server/services/customers";
import { updateSenders } from "@/server/services/senders";
import { createClinic } from "./helpers";

describe("countries", () => {
  it("reads local phone formats in the business's country", () => {
    expect(toE164("(512) 555-0142", "US")).toBe("+15125550142");
    expect(toE164("416-555-0199", "CA")).toBe("+14165550199");
    expect(toE164("0412 345 678", "AU")).toBe("+61412345678");
    expect(toE164("021 123 4567", "NZ")).toBe("+64211234567");
    expect(toE164("050 123 4567", "AE")).toBe("+971501234567");
    expect(toE164("+44 7911 123456", "US")).toBe("+447911123456"); // a foreign number with its code is kept
    expect(normalizePhone("0412 345 678")).toBe("0412345678"); // no country known: digits only, as before
    expect(() => normalizePhone("12")).toThrow();
  });

  it("knows each market's currency and emergency number; featured markets come first", () => {
    expect(["US", "CA", "AU", "GB", "NZ", "AE", "DE", "XX"].map(defaultCurrency)).toEqual(["USD", "CAD", "AUD", "GBP", "NZD", "AED", "EUR", "USD"]);
    expect(emergencyNumber("US")).toBe("911");
    expect(emergencyNumber("AU")).toBe("000");
    expect(emergencyNumber("FR")).toBe("112");
    expect(COUNTRY_OPTIONS.slice(0, 3).map((c) => c.code)).toEqual(["US", "CA", "AU"]);
    expect(COUNTRY_OPTIONS.length).toBeGreaterThan(200);
    expect(isCountryCode("au")).toBe(true);
    expect(isCountryCode("ZZ")).toBe(false);
  });

  it("the emergency reply gives the local number", () => {
    const msg = (c?: string) => (preCheck("I can't breathe, chest pain", "dentist", c) as { reply: string }).reply;
    expect(msg("AU")).toMatch(/call 000 right away/);
    expect(msg("US")).toMatch(/call 911 right away/);
    expect(msg()).toMatch(/your local emergency number/);
  });

  it("an Australian clinic's customers are stored in international format and found by either format", async () => {
    const c = await createClinic("Sydney Smiles");
    await expect(updateBusiness(c.ctx, { countryCode: "QQ" })).rejects.toThrow(/choose a country/);
    const b = await updateBusiness(c.ctx, { countryCode: "au" });
    expect(b).toMatchObject({ countryCode: "AU", country: "Australia" });
    const { customer } = await createCustomer(c.ctx, { name: "Olivia", phone: "0412 345 678" });
    expect(customer.phone).toBe("+61412345678");
    expect((await findCustomerByContact(c.ctx, { phone: "+61 412 345 678" }))?.id).toBe(customer.id);
    expect((await createCustomer(c.ctx, { phone: "0412345678" })).created).toBe(false);
    const s = await updateSenders(c.ctx, { smsFrom: "0491 570 006" });
    expect(s.smsFrom).toBe("+61491570006");
  });
});
