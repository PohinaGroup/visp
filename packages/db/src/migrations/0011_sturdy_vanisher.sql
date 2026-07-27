ALTER TABLE "app_user" ADD COLUMN "direct_beta" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "direct_twitch_state" text;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "direct_twitch_error" text;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "direct_kick_state" text;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "direct_kick_error" text;--> statement-breakpoint
ALTER TABLE "path" ADD COLUMN "direct_twitch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "path" ADD COLUMN "direct_kick" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "path_direct_twitch_owner" ON "path" USING btree ("user_id") WHERE "path"."direct_twitch";--> statement-breakpoint
CREATE UNIQUE INDEX "path_direct_kick_owner" ON "path" USING btree ("user_id") WHERE "path"."direct_kick";