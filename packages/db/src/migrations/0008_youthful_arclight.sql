CREATE TYPE "public"."direct_role" AS ENUM('landscape', 'portrait');--> statement-breakpoint
CREATE TABLE "direct_destination" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"path_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"role" "direct_role" DEFAULT 'landscape' NOT NULL,
	"crop" jsonb,
	"state" text,
	"error" text,
	"reserved_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direct_destination_user_provider_role_unique" UNIQUE("user_id","provider","role"),
	CONSTRAINT "direct_destination_provider_known" CHECK ("direct_destination"."provider" in ('twitch', 'kick', 'youtube')),
	CONSTRAINT "direct_destination_crop_role" CHECK (("direct_destination"."role" = 'landscape' and "direct_destination"."crop" is null) or ("direct_destination"."role" = 'portrait' and "direct_destination"."crop" is not null))
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "direct_dual_output" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "direct_destination" ADD CONSTRAINT "direct_destination_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_destination" ADD CONSTRAINT "direct_destination_path_id_path_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."path"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_destination_path_idx" ON "direct_destination" USING btree ("path_id");