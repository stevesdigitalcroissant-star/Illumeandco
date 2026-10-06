import { describe, expect, it } from "vitest";
import { twilioSignature, twiml, verifyTwilioSignature } from "@/server/channels/twilio";
import { handleInbound } from "@/server/ai/orchestrator";
import { getConversation } from "@/server/services/conversations";
import { getCustomer } from "@/server/services/customers";
import { createClinic } from "./helpers";

describe("channels", () => {
  it("verifies Twilio signatures (Twilio's documented example)", () => {
    const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
    const params = { CallSid: "CA1234567890ABCDE", Caller: "+12349013030", Digits: "1234", From: "+12349013030", To: "+18005551212" };
    expect(twilioSignature("12345", url, params)).toBe("0/KCTR6DLpKmkAf8muzZqo1nDgQ=");
    expect(verifyTwilioSignature("12345", url, params, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(true);
    expect(verifyTwilioSignature("12345", url, { ...params, Digits: "9999" }, "0/KCTR6DLpKmkAf8muzZqo1nDgQ=")).toBe(false);
    expect(verifyTwilioSignature("12345", url, params, null)).toBe(false);
    expect(twiml("a < b & c")).toContain("<Message>a &lt; b &amp; c</Message>");
  });

  it("an SMS conversation uses the same AI brain and knows the sender's phone", async () => {
    const c = await createClinic();
    const r = await handleInbound({ businessId: c.business.id, channel: "sms", identity: "+971501119999", text: "How much is a cleaning?", contact: { phone: "+971501119999" } });
    expect(r.reply).toMatch(/AED 300/);
    expect((await getConversation(c.ctx, r.conversationId)).channel).toBe("sms");
    expect((await getCustomer(c.ctx, r.customerId)).phone).toBe("+971501119999");
    // Same number again → same conversation
    const again = await handleInbound({ businessId: c.business.id, channel: "sms", identity: "+971501119999", text: "thanks", contact: { phone: "+971501119999" } });
    expect(again.conversationId).toBe(r.conversationId);
  });
});
