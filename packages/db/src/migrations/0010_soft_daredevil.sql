DO $$ BEGIN
	ALTER TYPE "public"."obs_tile_action" ADD VALUE 'recording';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TYPE "public"."obs_tile_action" ADD VALUE 'virtualcam';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TYPE "public"."obs_tile_action" ADD VALUE 'replaybuffer';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TYPE "public"."obs_tile_action" ADD VALUE 'recordpause';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "obs_desired_recording" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "obs_recording" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "obs_desired_virtual_cam" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "obs_virtual_cam" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "obs_desired_replay_buffer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "obs_replay_buffer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "obs_desired_record_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN IF NOT EXISTS "obs_record_paused" boolean DEFAULT false NOT NULL;
