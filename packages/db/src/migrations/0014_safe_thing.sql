ALTER TABLE "app_user" ADD COLUMN "first_live_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "relay_stream_session" ADD COLUMN "first_live_at" timestamp with time zone;