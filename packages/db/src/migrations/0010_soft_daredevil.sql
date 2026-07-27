ALTER TYPE "public"."obs_tile_action" ADD VALUE 'recording';--> statement-breakpoint
ALTER TYPE "public"."obs_tile_action" ADD VALUE 'virtualcam';--> statement-breakpoint
ALTER TYPE "public"."obs_tile_action" ADD VALUE 'replaybuffer';--> statement-breakpoint
ALTER TYPE "public"."obs_tile_action" ADD VALUE 'recordpause';--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "obs_desired_recording" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "obs_recording" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "obs_desired_virtual_cam" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "obs_virtual_cam" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "obs_desired_replay_buffer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "obs_replay_buffer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "obs_desired_record_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "obs_record_paused" boolean DEFAULT false NOT NULL;