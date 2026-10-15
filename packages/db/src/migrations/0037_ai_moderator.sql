ALTER TABLE "chat_bot_alert" DROP CONSTRAINT "chat_bot_alert_event";--> statement-breakpoint
ALTER TABLE "hosted_usage" DROP CONSTRAINT "hosted_usage_feature_known";--> statement-breakpoint
ALTER TABLE "hosted_usage" DROP CONSTRAINT "hosted_usage_unit_known";--> statement-breakpoint
ALTER TABLE "unit_price" DROP CONSTRAINT "unit_price_feature_known";--> statement-breakpoint
ALTER TABLE "unit_price" DROP CONSTRAINT "unit_price_unit_known";--> statement-breakpoint
ALTER TABLE "chat_bot" ADD COLUMN "mod_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_bot" ADD COLUMN "mod_rules" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_bot" ADD COLUMN "mod_max_timeout_seconds" integer DEFAULT 600 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_bot" ADD COLUMN "mod_on_raid" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_bot" ADD COLUMN "mod_on_gift" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_bot" ADD COLUMN "mod_on_signal" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_bot" ADD COLUMN "mod_on_questions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_bot" ADD CONSTRAINT "chat_bot_mod_rules_length" CHECK (char_length("chat_bot"."mod_rules") <= 2000);--> statement-breakpoint
ALTER TABLE "chat_bot" ADD CONSTRAINT "chat_bot_mod_max_timeout_range" CHECK ("chat_bot"."mod_max_timeout_seconds" between 1 and 1209600);--> statement-breakpoint
ALTER TABLE "chat_bot_alert" ADD CONSTRAINT "chat_bot_alert_event" CHECK ("chat_bot_alert"."event" in ('live', 'brb', 'back', 'offline', 'degraded'));--> statement-breakpoint
ALTER TABLE "hosted_usage" ADD CONSTRAINT "hosted_usage_feature_known" CHECK ("hosted_usage"."feature" in ('tts', 'subtitles', 'audio_isolation', 'typography_export', 'ai_moderator'));--> statement-breakpoint
ALTER TABLE "hosted_usage" ADD CONSTRAINT "hosted_usage_unit_known" CHECK ("hosted_usage"."unit" in ('characters', 'seconds', 'items', 'tokens'));--> statement-breakpoint
ALTER TABLE "unit_price" ADD CONSTRAINT "unit_price_feature_known" CHECK ("unit_price"."feature" in ('tts', 'subtitles', 'audio_isolation', 'typography_export', 'ai_moderator'));--> statement-breakpoint
ALTER TABLE "unit_price" ADD CONSTRAINT "unit_price_unit_known" CHECK ("unit_price"."unit" in ('characters', 'seconds', 'items', 'tokens'));