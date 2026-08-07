ALTER TYPE "public"."chat_provider" ADD VALUE 'youtube';--> statement-breakpoint
ALTER TYPE "public"."setup_use_case" ADD VALUE 'direct' BEFORE 'phone_to_obs';--> statement-breakpoint
ALTER TYPE "public"."stream_destination" ADD VALUE 'youtube' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "direct_twitch" boolean;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "direct_kick" boolean;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "direct_youtube" boolean;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "direct_youtube_title" text DEFAULT 'Live from VISP' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "direct_youtube_stream_id" text;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "direct_twitch_reserved_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "direct_kick_reserved_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "direct_youtube_state" text;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "direct_youtube_error" text;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "direct_youtube_reserved_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "direct_youtube_broadcast_id" text;--> statement-breakpoint
ALTER TABLE "path" ADD COLUMN "direct_youtube" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "path_direct_youtube_owner" ON "path" USING btree ("user_id") WHERE "path"."direct_youtube";