ALTER TABLE "app_user" ADD COLUMN "obs_media_sources_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "path" ADD COLUMN "low_latency" boolean DEFAULT false NOT NULL;