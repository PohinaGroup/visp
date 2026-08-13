CREATE TABLE "chat_bot" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"commands_enabled" boolean DEFAULT true NOT NULL,
	"prefix" text DEFAULT '!' NOT NULL,
	"post_twitch" boolean DEFAULT true NOT NULL,
	"post_kick" boolean DEFAULT true NOT NULL,
	"post_youtube" boolean DEFAULT true NOT NULL,
	"alert_live" boolean DEFAULT true NOT NULL,
	"alert_brb" boolean DEFAULT true NOT NULL,
	"alert_back" boolean DEFAULT true NOT NULL,
	"alert_offline" boolean DEFAULT false NOT NULL,
	"live_message" text,
	"brb_message" text,
	"back_message" text,
	"offline_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_bot_prefix_length" CHECK (char_length("chat_bot"."prefix") between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "chat_bot_alert" (
	"path_id" bigint NOT NULL,
	"event" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_bot_alert_path_id_event_pk" PRIMARY KEY("path_id","event"),
	CONSTRAINT "chat_bot_alert_event" CHECK ("chat_bot_alert"."event" in ('live', 'brb', 'back', 'offline'))
);
--> statement-breakpoint
CREATE TABLE "chat_bot_command" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"response" text NOT NULL,
	"mod_only" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cooldown_seconds" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_bot_command_user_name_unique" UNIQUE("user_id","name"),
	CONSTRAINT "chat_bot_command_name" CHECK ("chat_bot_command"."name" ~ '^[a-z0-9_-]{1,24}$'),
	CONSTRAINT "chat_bot_command_response_length" CHECK (char_length("chat_bot_command"."response") between 1 and 200),
	CONSTRAINT "chat_bot_command_cooldown_range" CHECK ("chat_bot_command"."cooldown_seconds" between 0 and 3600)
);
--> statement-breakpoint
ALTER TABLE "chat_bot" ADD CONSTRAINT "chat_bot_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_bot_alert" ADD CONSTRAINT "chat_bot_alert_path_id_path_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."path"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_bot_command" ADD CONSTRAINT "chat_bot_command_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;