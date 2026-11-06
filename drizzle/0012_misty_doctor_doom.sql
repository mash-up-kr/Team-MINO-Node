ALTER TABLE "pin_comments" ADD COLUMN "author_nickname" varchar(15);--> statement-breakpoint
ALTER TABLE "pin_comments" ADD COLUMN "author_avatar" jsonb;--> statement-breakpoint
UPDATE "pin_comments" AS c SET "author_nickname" = u."nickname", "author_avatar" = u."avatar" FROM "users" AS u WHERE c."created_by" = u."id" AND c."author_nickname" IS NULL;