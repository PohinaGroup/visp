CREATE TYPE "public"."obs_tile_action" AS ENUM('scene', 'stream');--> statement-breakpoint
CREATE TABLE "obs_tile" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"color" text,
	"action" "obs_tile_action" NOT NULL,
	"scene_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obs_tile_label_length" CHECK (char_length(trim("obs_tile"."label")) between 1 and 64),
	CONSTRAINT "obs_tile_scene_requires_name" CHECK ("obs_tile"."action" <> 'scene' or "obs_tile"."scene_name" is not null)
);
--> statement-breakpoint
ALTER TABLE "obs_tile" ADD CONSTRAINT "obs_tile_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "obs_tile_user_position_idx" ON "obs_tile" USING btree ("user_id","position");