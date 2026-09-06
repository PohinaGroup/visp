CREATE TYPE "public"."multichat_provider" AS ENUM('twitch', 'kick', 'tiktok');--> statement-breakpoint
CREATE TABLE "multichat_overlay" (
	"user_id" text PRIMARY KEY NOT NULL,
	"token_id" text,
	"token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "multichat_source" (
	"user_id" text NOT NULL,
	"provider" "multichat_provider" NOT NULL,
	"channel_login" text NOT NULL,
	"channel_id" text,
	"kick_subscription_id" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "multichat_source_user_id_provider_pk" PRIMARY KEY("user_id","provider"),
	CONSTRAINT "multichat_source_login_length" CHECK (char_length("multichat_source"."channel_login") between 1 and 64)
);
--> statement-breakpoint
ALTER TABLE "multichat_overlay" ADD CONSTRAINT "multichat_overlay_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multichat_source" ADD CONSTRAINT "multichat_source_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;