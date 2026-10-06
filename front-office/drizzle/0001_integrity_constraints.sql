-- Integrity guarantees that the ORM cannot express.

-- 1. Double-booking prevention at the database level.
--    No two active appointments for the same staff member may overlap,
--    including the buffer time after each appointment. This holds even under
--    concurrent requests from the AI, the dashboard and the widget.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "staff_id" WITH =,
    tstzrange("starts_at", "blocked_until", '[)') WITH &&
  ) WHERE ("status" IN ('booked', 'confirmed'));
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_time_order" CHECK ("ends_at" > "starts_at" AND "blocked_until" >= "ends_at");
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_duration_positive" CHECK ("duration_minutes" > 0 AND "duration_minutes" <= 1440);
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_price_nonnegative" CHECK ("price_cents" IS NULL OR "price_cents" >= 0);
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_weekday" CHECK ("weekday" BETWEEN 1 AND 7 AND "open_time" < "close_time");
--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_weekday" CHECK ("weekday" BETWEEN 1 AND 7 AND "start_time" < "end_time");
--> statement-breakpoint

-- 2. Knowledge retrieval: full-text search (always available) + trigram fallback.
ALTER TABLE "knowledge_chunks"
  ADD COLUMN "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "content")) STORED;
--> statement-breakpoint
CREATE INDEX "knowledge_chunks_tsv_idx" ON "knowledge_chunks" USING gin ("tsv");
--> statement-breakpoint
CREATE INDEX "knowledge_chunks_trgm_idx" ON "knowledge_chunks" USING gin ("content" gin_trgm_ops);
--> statement-breakpoint
-- Semantic search when embeddings are configured.
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
