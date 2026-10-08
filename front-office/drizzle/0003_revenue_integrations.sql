CREATE TYPE "public"."integration_event_status" AS ENUM('received', 'processing', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TABLE "integration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"connector" text NOT NULL,
	"external_id" text NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "integration_event_status" DEFAULT 'received' NOT NULL,
	"result" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"customer_id" uuid,
	"opportunity_id" uuid,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "recovery" jsonb DEFAULT '{"missedCall":{"enabled":true,"textBack":true,"template":"Hi, this is {{business}} — sorry we missed your call! How can we help? Reply here and we''ll take care of you."}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD COLUMN "purpose" text DEFAULT 'lead' NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "last_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_events_external_idx" ON "integration_events" USING btree ("business_id","connector","external_id");--> statement-breakpoint
CREATE INDEX "integration_events_business_idx" ON "integration_events" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "integration_events_pending_idx" ON "integration_events" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_purpose_check" CHECK ("purpose" in ('lead', 'missed_call'));
