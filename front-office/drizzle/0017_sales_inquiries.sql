CREATE TABLE "sales_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"organization" text NOT NULL,
	"locations" text NOT NULL,
	"message" text,
	"status" text DEFAULT 'new' NOT NULL,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sales_inquiries_created_idx" ON "sales_inquiries" USING btree ("created_at");