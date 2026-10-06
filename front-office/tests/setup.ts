import "dotenv/config";
import { afterAll } from "vitest";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// Tests must never call real external providers.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
delete process.env.VOYAGE_API_KEY;
delete process.env.RESEND_API_KEY;
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.STRIPE_SECRET_KEY;
process.env.APP_URL = "http://localhost:3000";

afterAll(async () => {
  const { getPool } = await import("@/db");
  await getPool().end();
  (globalThis as { __afoPool?: unknown; __afoDb?: unknown }).__afoPool = undefined;
  (globalThis as { __afoPool?: unknown; __afoDb?: unknown }).__afoDb = undefined;
});
