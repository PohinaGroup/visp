CREATE TYPE "public"."chat_provider" AS ENUM('twitch', 'kick');--> statement-breakpoint
CREATE TYPE "public"."obs_tile_action" AS ENUM('scene', 'stream', 'recording', 'virtualcam', 'replaybuffer', 'recordpause');--> statement-breakpoint
CREATE TYPE "public"."publish_origin" AS ENUM('native', 'web');--> statement-breakpoint
CREATE TYPE "public"."setup_use_case" AS ENUM('phone_to_obs', 'remote_guest', 'multi_cam', 'other');--> statement-breakpoint
CREATE TYPE "public"."stream_destination" AS ENUM('twitch', 'kick', 'other');--> statement-breakpoint
CREATE TYPE "public"."streaming_software" AS ENUM('obs', 'visp', 'larix', 'moblin', 'other');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp NOT NULL,
	"status" text NOT NULL,
	"last_polled_at" timestamp,
	"polling_interval" integer,
	"client_id" text,
	"scope" text,
	CONSTRAINT "device_code_device_code_unique" UNIQUE("device_code"),
	CONSTRAINT "device_code_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"impersonated_by" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_connection" (
	"user_id" text NOT NULL,
	"provider" "chat_provider" NOT NULL,
	"kick_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_connection_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"publish_secret_hash" text,
	"read_secret_hash" text,
	"read_secret_encrypted" text,
	"secrets_rotated_at" timestamp with time zone,
	"device_count" integer,
	"streaming_software" "streaming_software",
	"setup_use_case" "setup_use_case",
	"stream_destination" "stream_destination",
	"advanced_mode" boolean DEFAULT false NOT NULL,
	"obs_control_token_id" text,
	"obs_control_token_hash" text,
	"obs_desired_streaming" boolean DEFAULT false NOT NULL,
	"obs_streaming" boolean DEFAULT false NOT NULL,
	"obs_scenes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"obs_current_scene" text,
	"obs_desired_scene" text,
	"obs_command_version" integer DEFAULT 0 NOT NULL,
	"obs_applied_version" integer DEFAULT 0 NOT NULL,
	"obs_desired_recording" boolean DEFAULT false NOT NULL,
	"obs_recording" boolean DEFAULT false NOT NULL,
	"obs_desired_virtual_cam" boolean DEFAULT false NOT NULL,
	"obs_virtual_cam" boolean DEFAULT false NOT NULL,
	"obs_desired_replay_buffer" boolean DEFAULT false NOT NULL,
	"obs_replay_buffer" boolean DEFAULT false NOT NULL,
	"obs_desired_record_paused" boolean DEFAULT false NOT NULL,
	"obs_record_paused" boolean DEFAULT false NOT NULL,
	"obs_last_seen_at" timestamp with time zone,
	"direct_beta" boolean DEFAULT false NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_handle_unique" UNIQUE("handle"),
	CONSTRAINT "app_user_obs_control_token_id_unique" UNIQUE("obs_control_token_id")
);
--> statement-breakpoint
CREATE TABLE "obs_tile" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"color" text,
	"action" "obs_tile_action" NOT NULL,
	"scene_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obs_tile_label_length" CHECK (char_length(trim("obs_tile"."label")) between 1 and 64),
	CONSTRAINT "obs_tile_scene_requires_name" CHECK ("obs_tile"."action" <> 'scene' or "obs_tile"."scene_name" is not null)
);
--> statement-breakpoint
CREATE TABLE "path_state" (
	"path_id" bigint PRIMARY KEY NOT NULL,
	"publishing" boolean DEFAULT false NOT NULL,
	"reader_count" integer DEFAULT 0 NOT NULL,
	"source_type" text,
	"last_event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"link_bitrate_kbps" integer,
	"link_target_bitrate_kbps" integer,
	"link_rtt_ms" integer,
	"link_packet_loss_pct" real,
	"link_count" integer,
	"link_degraded" boolean,
	"link_stats_at" timestamp with time zone,
	"direct_twitch_state" text,
	"direct_twitch_error" text,
	"direct_kick_state" text,
	"direct_kick_error" text,
	CONSTRAINT "path_state_reader_count_nonnegative" CHECK ("path_state"."reader_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "relay" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"api_url" text NOT NULL,
	"ping_url" text NOT NULL,
	"region" text NOT NULL,
	"capacity_paths" integer NOT NULL,
	"max_forwarders" integer NOT NULL,
	"public_ip" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"drained_at" timestamp with time zone,
	CONSTRAINT "relay_name_unique" UNIQUE("name"),
	CONSTRAINT "relay_capacity_paths_positive" CHECK ("relay"."capacity_paths" > 0),
	CONSTRAINT "relay_max_forwarders_nonnegative" CHECK ("relay"."max_forwarders" >= 0)
);
--> statement-breakpoint
CREATE TABLE "path" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"relay_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"seq" integer NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"publish_secret_hash" text,
	"publish_secret_encrypted" text,
	"publish_origin" "publish_origin",
	"native_installation_id" text,
	"publish_last_connected_at" timestamp with time zone,
	"direct_twitch" boolean DEFAULT false NOT NULL,
	"direct_kick" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "path_slug_unique" UNIQUE("slug"),
	CONSTRAINT "path_user_seq_unique" UNIQUE("user_id","seq"),
	CONSTRAINT "path_user_native_installation_unique" UNIQUE("user_id","native_installation_id"),
	CONSTRAINT "path_seq_positive" CHECK ("path"."seq" > 0),
	CONSTRAINT "path_label_length" CHECK (char_length(trim("path"."label")) between 1 and 64)
);
--> statement-breakpoint
CREATE TABLE "relay_stream_session" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"path_id" bigint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"source_type" text,
	CONSTRAINT "relay_stream_session_valid_range" CHECK ("relay_stream_session"."ended_at" is null or "relay_stream_session"."ended_at" >= "relay_stream_session"."started_at")
);
--> statement-breakpoint
CREATE TABLE "rtt_sample" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"relay_id" integer,
	"user_id" text NOT NULL,
	"rtt_ms" integer NOT NULL,
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rtt_sample_range" CHECK ("rtt_sample"."rtt_ms" between 1 and 10000),
	CONSTRAINT "rtt_sample_method" CHECK ("rtt_sample"."method" in ('browser-probe', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_code" ADD CONSTRAINT "device_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_connection" ADD CONSTRAINT "chat_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obs_tile" ADD CONSTRAINT "obs_tile_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "path_state" ADD CONSTRAINT "path_state_path_id_path_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."path"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "path" ADD CONSTRAINT "path_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "path" ADD CONSTRAINT "path_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_stream_session" ADD CONSTRAINT "relay_stream_session_path_id_path_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."path"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtt_sample" ADD CONSTRAINT "rtt_sample_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtt_sample" ADD CONSTRAINT "rtt_sample_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_code_user_id_idx" ON "device_code" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_code_expires_at_idx" ON "device_code" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "obs_tile_user_position_idx" ON "obs_tile" USING btree ("user_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "path_direct_twitch_owner" ON "path" USING btree ("user_id") WHERE "path"."direct_twitch";--> statement-breakpoint
CREATE UNIQUE INDEX "path_direct_kick_owner" ON "path" USING btree ("user_id") WHERE "path"."direct_kick";--> statement-breakpoint
CREATE INDEX "relay_stream_session_path_started_idx" ON "relay_stream_session" USING btree ("path_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "relay_stream_session_one_open_per_path" ON "relay_stream_session" USING btree ("path_id") WHERE "relay_stream_session"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "rtt_sample_user_created_idx" ON "rtt_sample" USING btree ("user_id","created_at");