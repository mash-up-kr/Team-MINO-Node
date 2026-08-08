ALTER TABLE "rooms" ALTER COLUMN "invite_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "nickname" SET DATA TYPE varchar(15);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar" jsonb;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "profile_image_url";