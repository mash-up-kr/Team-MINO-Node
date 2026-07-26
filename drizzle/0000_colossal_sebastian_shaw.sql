CREATE TABLE "pin_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pin_id" uuid NOT NULL,
	"created_by" uuid,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"source_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(16) NOT NULL,
	"provider_place_id" varchar(128) NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(32),
	"district" varchar(32),
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"category" varchar(64),
	"phone" varchar(32),
	"external_url" text,
	"images" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "room_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"type" varchar(16) NOT NULL,
	"name" varchar(20) NOT NULL,
	"description" text,
	"color" varchar(7) NOT NULL,
	"invite_code" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "place_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(16) NOT NULL,
	"original_url" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" text NOT NULL,
	"nickname" varchar(10) NOT NULL,
	"profile_image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pin_comments" ADD CONSTRAINT "pin_comments_pin_id_pins_id_fk" FOREIGN KEY ("pin_id") REFERENCES "pins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pin_comments" ADD CONSTRAINT "pin_comments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pins" ADD CONSTRAINT "pins_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pins" ADD CONSTRAINT "pins_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pins" ADD CONSTRAINT "pins_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pins" ADD CONSTRAINT "pins_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_sources" ADD CONSTRAINT "place_sources_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_sources" ADD CONSTRAINT "place_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pin_comments_pin_id_index" ON "pin_comments" USING btree ("pin_id");--> statement-breakpoint
CREATE INDEX "pin_comments_created_by_index" ON "pin_comments" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "pins_room_id_place_id_active_unique" ON "pins" USING btree ("room_id","place_id") WHERE "pins"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "pins_place_id_index" ON "pins" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "pins_source_id_index" ON "pins" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "pins_created_by_index" ON "pins" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "places_provider_provider_place_id_active_unique" ON "places" USING btree ("provider","provider_place_id") WHERE "places"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "room_members_room_id_user_id_active_unique" ON "room_members" USING btree ("room_id","user_id") WHERE "room_members"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "room_members_user_id_index" ON "room_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_invite_code_active_unique" ON "rooms" USING btree ("invite_code") WHERE "rooms"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "rooms_owner_id_index" ON "rooms" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "place_sources_place_id_source_id_active_unique" ON "place_sources" USING btree ("place_id","source_id") WHERE "place_sources"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "place_sources_source_id_index" ON "place_sources" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_original_url_active_unique" ON "sources" USING btree ("original_url") WHERE "sources"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_device_id_active_unique" ON "users" USING btree ("device_id") WHERE "users"."deleted_at" is null;