CREATE TABLE "usage_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_credits" ADD CONSTRAINT "usage_credits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_credits_ref_idx" ON "usage_credits" USING btree ("organization_id","kind","ref");--> statement-breakpoint
CREATE INDEX "usage_credits_org_idx" ON "usage_credits" USING btree ("organization_id","kind");