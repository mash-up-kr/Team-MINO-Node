CREATE TABLE "pin_accesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pin_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pin_accesses" ADD CONSTRAINT "pin_accesses_pin_id_pins_id_fk" FOREIGN KEY ("pin_id") REFERENCES "pins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pin_accesses" ADD CONSTRAINT "pin_accesses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pin_accesses_user_id_pin_id_index" ON "pin_accesses" USING btree ("user_id","pin_id");--> statement-breakpoint
CREATE INDEX "pin_accesses_pin_id_index" ON "pin_accesses" USING btree ("pin_id");