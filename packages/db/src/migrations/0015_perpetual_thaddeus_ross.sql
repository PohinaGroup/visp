ALTER TABLE "path" ADD COLUMN "compositor_healthy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "path" ADD COLUMN "compositor_program_url" text;--> statement-breakpoint
ALTER TABLE "path" ADD COLUMN "compositor_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio" DROP COLUMN "compositor_healthy";--> statement-breakpoint
ALTER TABLE "studio" DROP COLUMN "program_url";--> statement-breakpoint
ALTER TABLE "studio" DROP COLUMN "compositor_checked_at";