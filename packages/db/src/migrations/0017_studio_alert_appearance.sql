ALTER TABLE "studio_asset" DROP CONSTRAINT "studio_asset_png_only";--> statement-breakpoint
ALTER TABLE "studio_layer" ADD COLUMN "alert_events" jsonb;--> statement-breakpoint
ALTER TABLE "studio_layer" ADD COLUMN "alert_appearance" jsonb;--> statement-breakpoint
ALTER TABLE "studio_asset" ADD CONSTRAINT "studio_asset_image_type" CHECK ("studio_asset"."content_type" in ('image/png', 'image/jpeg', 'image/webp', 'image/gif'));