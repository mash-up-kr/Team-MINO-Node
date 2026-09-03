DROP INDEX "pin_accesses_user_id_pin_id_index";--> statement-breakpoint
DROP INDEX "pin_comments_pin_id_index";--> statement-breakpoint
CREATE INDEX "pin_accesses_user_id_pin_id_created_at_index" ON "pin_accesses" USING btree ("user_id","pin_id","created_at");--> statement-breakpoint
CREATE INDEX "pin_comments_pin_id_index" ON "pin_comments" USING btree ("pin_id") WHERE "pin_comments"."deleted_at" is null;
