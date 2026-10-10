ALTER TABLE "businesses" ADD COLUMN "country_code" text;--> statement-breakpoint
-- Backfill from the free-text country where it's unambiguous.
UPDATE "businesses" SET "country_code" = CASE
  WHEN lower(trim("country")) IN ('uae', 'united arab emirates', 'ae') THEN 'AE'
  WHEN lower(trim("country")) IN ('usa', 'us', 'united states', 'united states of america') THEN 'US'
  WHEN lower(trim("country")) IN ('canada', 'ca') THEN 'CA'
  WHEN lower(trim("country")) IN ('australia', 'au') THEN 'AU'
  WHEN lower(trim("country")) IN ('uk', 'united kingdom', 'great britain', 'gb', 'england') THEN 'GB'
  WHEN lower(trim("country")) IN ('new zealand', 'nz') THEN 'NZ'
  WHEN lower(trim("country")) IN ('ireland', 'ie') THEN 'IE'
END WHERE "country_code" IS NULL AND "country" IS NOT NULL;
