ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "direct_beta" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN IF NOT EXISTS "direct_twitch_state" text;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN IF NOT EXISTS "direct_twitch_error" text;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN IF NOT EXISTS "direct_kick_state" text;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN IF NOT EXISTS "direct_kick_error" text;--> statement-breakpoint
ALTER TABLE "path" ADD COLUMN IF NOT EXISTS "direct_twitch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "path" ADD COLUMN IF NOT EXISTS "direct_kick" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "path_direct_twitch_owner" ON "path" USING btree ("user_id") WHERE "path"."direct_twitch";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "path_direct_kick_owner" ON "path" USING btree ("user_id") WHERE "path"."direct_kick";
