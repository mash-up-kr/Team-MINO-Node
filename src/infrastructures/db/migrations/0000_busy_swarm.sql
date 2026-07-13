CREATE TABLE "place_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"shortcode" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"error_code" text,
	"error_message" text,
	"processing_lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_jobs_status_check" CHECK ("place_jobs"."status" in ('pending', 'processing', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "place_jobs_dedup_shortcode_idx" ON "place_jobs" USING btree ("shortcode") WHERE "place_jobs"."status" in ('pending', 'processing', 'succeeded');