CREATE TYPE "public"."opportunity_action" AS ENUM('follow_up', 'offer_rebooking', 'reactivate', 'human_review', 'none');--> statement-breakpoint
CREATE TYPE "public"."opportunity_blocker" AS ENUM('none', 'price', 'availability', 'undecided', 'consulting_someone', 'unresponsive', 'opted_out', 'needs_staff');--> statement-breakpoint
CREATE TYPE "public"."opportunity_kind" AS ENUM('lead', 'cancellation', 'no_show', 'reactivation', 'needs_human', 'missed_call');--> statement-breakpoint
CREATE TYPE "public"."opportunity_stage" AS ENUM('new_lead', 'interested', 'high_intent', 'booking_in_progress', 'needs_follow_up', 'waiting', 'booked', 'cancelled', 'no_show', 'reactivation', 'needs_human', 'completed', 'lost');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('open', 'won', 'lost', 'dismissed');--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" "opportunity_kind" NOT NULL,
	"stage" "opportunity_stage" NOT NULL,
	"status" "opportunity_status" DEFAULT 'open' NOT NULL,
	"customer_id" uuid NOT NULL,
	"conversation_id" uuid,
	"lead_id" uuid,
	"source_appointment_id" uuid,
	"service_id" uuid,
	"title" text NOT NULL,
	"wants" text,
	"blocker" "opportunity_blocker" DEFAULT 'none' NOT NULL,
	"blocker_detail" text,
	"intent_score" smallint DEFAULT 0 NOT NULL,
	"next_action" "opportunity_action" DEFAULT 'none' NOT NULL,
	"next_action_label" text,
	"next_action_at" timestamp with time zone,
	"next_action_by" text DEFAULT 'human' NOT NULL,
	"follow_up_id" uuid,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_value_cents" integer,
	"won_appointment_id" uuid,
	"recovered" boolean DEFAULT false NOT NULL,
	"recovered_value_cents" integer,
	"closed_reason" text,
	"closed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_business_id_customer_id_customers_business_id_id_fk" FOREIGN KEY ("business_id","customer_id") REFERENCES "public"."customers"("business_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_business_id_conversation_id_conversations_business_id_id_fk" FOREIGN KEY ("business_id","conversation_id") REFERENCES "public"."conversations"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_business_id_source_appointment_id_appointments_business_id_id_fk" FOREIGN KEY ("business_id","source_appointment_id") REFERENCES "public"."appointments"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_business_id_won_appointment_id_appointments_business_id_id_fk" FOREIGN KEY ("business_id","won_appointment_id") REFERENCES "public"."appointments"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_business_id_service_id_services_business_id_id_fk" FOREIGN KEY ("business_id","service_id") REFERENCES "public"."services"("business_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_open_key_idx" ON "opportunities" USING btree ("business_id","key") WHERE "opportunities"."status" = 'open';--> statement-breakpoint
CREATE INDEX "opportunities_business_status_idx" ON "opportunities" USING btree ("business_id","status","stage");--> statement-breakpoint
CREATE INDEX "opportunities_next_action_idx" ON "opportunities" USING btree ("business_id","next_action_at");--> statement-breakpoint
CREATE INDEX "opportunities_customer_idx" ON "opportunities" USING btree ("business_id","customer_id");