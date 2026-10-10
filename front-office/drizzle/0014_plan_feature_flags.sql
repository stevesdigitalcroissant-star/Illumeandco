-- Plans: slot recovery becomes an explicit entitlement (Growth and Pro).
UPDATE "plans" SET "entitlements" = "entitlements" || '{"slotRecovery":false}'::jsonb WHERE "id" = 'starter';--> statement-breakpoint
UPDATE "plans" SET "entitlements" = "entitlements" || '{"slotRecovery":true}'::jsonb WHERE "id" IN ('growth', 'pro');
