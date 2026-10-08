ALTER TABLE "ai_settings" ADD COLUMN "whatsapp_templates" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD COLUMN "template_vars" jsonb;