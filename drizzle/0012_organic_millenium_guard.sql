CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" varchar(16) NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" varchar(16) NOT NULL,
	"detail" text,
	"target_snapshot" jsonb,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"action_memo" text,
	"acted_at" timestamp with time zone,
	"acted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('pending','reviewed','actioned','dismissed')),
	CONSTRAINT "reports_target_type_check" CHECK ("reports"."target_type" in ('pin','pin_comment','user')),
	CONSTRAINT "reports_reason_check" CHECK ("reports"."reason" in ('SPAM','HARASSMENT','SEXUAL','HATE','ILLEGAL','OTHER')),
	CONSTRAINT "reports_detail_len_check" CHECK ("reports"."detail" is null or char_length("reports"."detail") <= 2000),
	CONSTRAINT "reports_state_check" CHECK (("reports"."status" = 'pending' and "reports"."acted_at" is null) or ("reports"."status" <> 'pending' and "reports"."acted_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_acted_by_users_id_fk" FOREIGN KEY ("acted_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_reporter_target_pending_unique" ON "reports" USING btree ("reporter_id","target_type","target_id") WHERE "reports"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "reports_status_created_at_index" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_type_target_id_index" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_id_created_at_index" ON "reports" USING btree ("reporter_id","created_at");