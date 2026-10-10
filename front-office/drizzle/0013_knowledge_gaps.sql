CREATE TABLE "knowledge_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"question" text NOT NULL,
	"normalized" text NOT NULL,
	"times_asked" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"first_asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "knowledge_gaps" ADD CONSTRAINT "knowledge_gaps_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_gaps_question_idx" ON "knowledge_gaps" USING btree ("business_id","normalized");--> statement-breakpoint
CREATE INDEX "knowledge_gaps_open_idx" ON "knowledge_gaps" USING btree ("business_id","status","last_asked_at");