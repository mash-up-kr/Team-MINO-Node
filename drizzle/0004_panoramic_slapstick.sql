DROP INDEX "users_device_id_active_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_uid" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_uid_active_unique" ON "users" USING btree ("auth_uid") WHERE "users"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "device_id";