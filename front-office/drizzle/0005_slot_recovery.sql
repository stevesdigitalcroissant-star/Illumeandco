CREATE TYPE "public"."slot_offer_status" AS ENUM('sent', 'accepted', 'declined', 'expired', 'taken', 'failed');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('open', 'offering', 'pending_staff', 'filled', 'expired', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."waitlist_status" AS ENUM('active', 'booked', 'removed');--> statement-breakpoint
CREATE TABLE "slot_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"waitlist_entry_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "slot_offer_status" DEFAULT 'sent' NOT NULL,
	"score" integer NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conversation_id" uuid,
	"follow_up_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slot_recoveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_appointment_id" uuid,
	"external_ref" text,
	"staff_id" uuid,
	"service_id" uuid,
	"label" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "slot_status" DEFAULT 'open' NOT NULL,
	"lost_value_cents" integer,
	"filled_appointment_id" uuid,
	"filled_customer_id" uuid,
	"filled_value_cents" integer,
	"filled_by" text,
	"status_note" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slot_recoveries_business_id_unique" UNIQUE("business_id","id")
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"staff_id" uuid,
	"earliest_date" text NOT NULL,
	"latest_date" text,
	"dayparts" text[] DEFAULT '{}' NOT NULL,
	"notes" text,
	"status" "waitlist_status" DEFAULT 'active' NOT NULL,
	"source" text NOT NULL,
	"created_by" "actor_type" NOT NULL,
	"booked_appointment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_entries_business_id_unique" UNIQUE("business_id","id")
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ALTER COLUMN "recovery" SET DEFAULT '{"missedCall":{"enabled":true,"textBack":true,"template":"Hi, this is {{business}} — sorry we missed your call! How can we help? Reply here and we''ll take care of you."},"slots":{"enabled":true,"autoOffer":false,"batchSize":3,"offerMinutes":60,"template":"Hi {{customer_name}}, good news — a {{service}} appointment just opened up at {{business}}: {{when}}. Reply YES to take it (first come, first served)."},"leads":{"enabled":true,"firstTouch":true,"template":"Hi {{customer_name}}, thanks for your enquiry{{about_service}} at {{business}}! When would suit you? Reply here and I''ll check availability."}}'::jsonb;--> statement-breakpoint
ALTER TABLE "slot_offers" ADD CONSTRAINT "slot_offers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_offers" ADD CONSTRAINT "slot_offers_business_id_slot_id_slot_recoveries_business_id_id_fk" FOREIGN KEY ("business_id","slot_id") REFERENCES "public"."slot_recoveries"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_offers" ADD CONSTRAINT "slot_offers_business_id_waitlist_entry_id_waitlist_entries_business_id_id_fk" FOREIGN KEY ("business_id","waitlist_entry_id") REFERENCES "public"."waitlist_entries"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_offers" ADD CONSTRAINT "slot_offers_business_id_customer_id_customers_business_id_id_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_recoveries" ADD CONSTRAINT "slot_recoveries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_recoveries" ADD CONSTRAINT "slot_recoveries_business_id_staff_id_staff_business_id_id_fk" FOREIGN KEY ("business_id","staff_id") REFERENCES "public"."staff"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_recoveries" ADD CONSTRAINT "slot_recoveries_business_id_service_id_services_business_id_id_fk" FOREIGN KEY ("business_id","service_id") REFERENCES "public"."services"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_business_id_customer_id_customers_business_id_id_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_business_id_service_id_services_business_id_id_fk" FOREIGN KEY ("business_id","service_id") REFERENCES "public"."services"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_business_id_staff_id_staff_business_id_id_fk" FOREIGN KEY ("business_id","staff_id") REFERENCES "public"."staff"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slot_offers_slot_customer_idx" ON "slot_offers" USING btree ("slot_id","customer_id");--> statement-breakpoint
CREATE INDEX "slot_offers_customer_idx" ON "slot_offers" USING btree ("business_id","customer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_recoveries_source_appt_idx" ON "slot_recoveries" USING btree ("business_id","source_appointment_id","starts_at") WHERE "slot_recoveries"."source_appointment_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "slot_recoveries_external_idx" ON "slot_recoveries" USING btree ("business_id","external_ref") WHERE "slot_recoveries"."external_ref" is not null;--> statement-breakpoint
CREATE INDEX "slot_recoveries_status_idx" ON "slot_recoveries" USING btree ("business_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "waitlist_entries_active_idx" ON "waitlist_entries" USING btree ("business_id","status");--> statement-breakpoint
UPDATE "ai_settings" SET "recovery" = "recovery" || '{"slots":{"enabled":true,"autoOffer":false,"batchSize":3,"offerMinutes":60,"template":"Hi {{customer_name}}, good news — a {{service}} appointment just opened up at {{business}}: {{when}}. Reply YES to take it (first come, first served)."}}'::jsonb WHERE NOT ("recovery" ? 'slots');--> statement-breakpoint
ALTER TABLE "follow_ups" DROP CONSTRAINT "follow_ups_purpose_check";--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_purpose_check" CHECK ("purpose" in ('lead', 'missed_call', 'first_touch', 'slot_offer'));
