CREATE TABLE "spend_budget" (
	"feature" text PRIMARY KEY NOT NULL,
	"weekly_eur" numeric(12, 2) NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spend_budget_feature_known" CHECK ("spend_budget"."feature" in ('all', 'tts', 'subtitles', 'audio_isolation', 'encoder')),
	CONSTRAINT "spend_budget_weekly_eur_nonnegative" CHECK ("spend_budget"."weekly_eur" >= 0)
);--> statement-breakpoint
ALTER TABLE "admin_audit_log" DROP CONSTRAINT "admin_audit_log_target_type";--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_target_type" CHECK ("admin_audit_log"."target_type" in ('user', 'relay', 'setting'));
