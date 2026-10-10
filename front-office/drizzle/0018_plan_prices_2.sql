-- New plan prices (allowances unchanged): Starter $99, Growth $249, Pro $499.
UPDATE "plans" SET "price_monthly_cents" = 9900 WHERE "id" = 'starter';--> statement-breakpoint
UPDATE "plans" SET "price_monthly_cents" = 24900 WHERE "id" = 'growth';--> statement-breakpoint
UPDATE "plans" SET "price_monthly_cents" = 49900 WHERE "id" = 'pro';
