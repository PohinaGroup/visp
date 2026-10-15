ALTER TABLE "hosted_usage" DROP CONSTRAINT "hosted_usage_feature_known";--> statement-breakpoint
ALTER TABLE "hosted_usage" DROP CONSTRAINT "hosted_usage_unit_known";--> statement-breakpoint
ALTER TABLE "unit_price" DROP CONSTRAINT "unit_price_feature_known";--> statement-breakpoint
ALTER TABLE "unit_price" DROP CONSTRAINT "unit_price_unit_known";--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "plan_status" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "plan_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "comped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_usage" ADD CONSTRAINT "hosted_usage_feature_known" CHECK ("hosted_usage"."feature" in ('tts', 'subtitles', 'audio_isolation', 'typography_export'));--> statement-breakpoint
ALTER TABLE "hosted_usage" ADD CONSTRAINT "hosted_usage_unit_known" CHECK ("hosted_usage"."unit" in ('characters', 'seconds', 'items'));--> statement-breakpoint
ALTER TABLE "unit_price" ADD CONSTRAINT "unit_price_feature_known" CHECK ("unit_price"."feature" in ('tts', 'subtitles', 'audio_isolation', 'typography_export'));--> statement-breakpoint
ALTER TABLE "unit_price" ADD CONSTRAINT "unit_price_unit_known" CHECK ("unit_price"."unit" in ('characters', 'seconds', 'items'));--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_plan_known" CHECK ("app_user"."plan" in ('free', 'plus'));--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_plan_status_known" CHECK ("app_user"."plan_status" in ('active', 'past_due'));