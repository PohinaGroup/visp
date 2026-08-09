ALTER TABLE "app_user" ADD COLUMN "brb_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "brb_message" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "brb_source" text DEFAULT 'snapshot' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "brb_image_key" text;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "brb_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_brb_source_known" CHECK ("app_user"."brb_source" in ('snapshot', 'image', 'color'));