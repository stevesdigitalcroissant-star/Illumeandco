ALTER TABLE "businesses" ADD COLUMN "sms_from" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "whatsapp_from" text;--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_sms_from_idx" ON "businesses" USING btree ("sms_from") WHERE "businesses"."sms_from" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_whatsapp_from_idx" ON "businesses" USING btree ("whatsapp_from") WHERE "businesses"."whatsapp_from" is not null;