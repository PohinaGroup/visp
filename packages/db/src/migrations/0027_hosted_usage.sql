CREATE TABLE "hosted_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"units" bigint NOT NULL,
	"unit" text NOT NULL,
	"provider" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosted_usage_feature_known" CHECK ("hosted_usage"."feature" in ('tts', 'subtitles', 'audio_isolation')),
	CONSTRAINT "hosted_usage_units_positive" CHECK ("hosted_usage"."units" > 0),
	CONSTRAINT "hosted_usage_unit_known" CHECK ("hosted_usage"."unit" in ('characters', 'seconds'))
);--> statement-breakpoint
CREATE TABLE "unit_price" (
	"id" serial PRIMARY KEY NOT NULL,
	"feature" text NOT NULL,
	"unit" text NOT NULL,
	"provider" text,
	"eur_per_unit" numeric(12, 8) NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	CONSTRAINT "unit_price_feature_unit_provider_valid_from_key" UNIQUE NULLS NOT DISTINCT("feature","unit","provider","valid_from"),
	CONSTRAINT "unit_price_feature_known" CHECK ("unit_price"."feature" in ('tts', 'subtitles', 'audio_isolation')),
	CONSTRAINT "unit_price_unit_known" CHECK ("unit_price"."unit" in ('characters', 'seconds')),
	CONSTRAINT "unit_price_nonnegative" CHECK ("unit_price"."eur_per_unit" >= 0)
);--> statement-breakpoint
ALTER TABLE "hosted_usage" ADD CONSTRAINT "hosted_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hosted_usage_user_occurred_at_idx" ON "hosted_usage" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "hosted_usage_feature_occurred_at_idx" ON "hosted_usage" USING btree ("feature","occurred_at");
