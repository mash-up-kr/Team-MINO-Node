CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"type_label" text NOT NULL,
	"target_name" text NOT NULL,
	"thumbnail_url" text,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "fcm_token" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_recipient_id_created_at_index" ON "notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_fcm_token_active_unique" ON "users" USING btree ("fcm_token") WHERE "users"."fcm_token" is not null and "users"."deleted_at" is null;