CREATE TYPE "public"."studio_layer_type" AS ENUM('text', 'png', 'browser', 'alert');--> statement-breakpoint
CREATE TYPE "public"."studio_transition" AS ENUM('cut', 'fade');--> statement-breakpoint
CREATE TABLE "studio" (
	"user_id" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"compositor_healthy" boolean DEFAULT false NOT NULL,
	"program_url" text,
	"compositor_checked_at" timestamp with time zone,
	"last_alert" text,
	"last_alert_event" text,
	"last_alert_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"checksum" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_asset_owner_key_unique" UNIQUE("user_id","key"),
	CONSTRAINT "studio_asset_png_only" CHECK ("studio_asset"."content_type" = 'image/png')
);
--> statement-breakpoint
CREATE TABLE "studio_layer" (
	"id" text PRIMARY KEY NOT NULL,
	"scene_id" text NOT NULL,
	"type" "studio_layer_type" NOT NULL,
	"name" text NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"disabled_by_runtime" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"text" text,
	"asset_id" text,
	"browser_url" text,
	"alert_event" text,
	CONSTRAINT "studio_layer_position_unique" UNIQUE("scene_id","position"),
	CONSTRAINT "studio_layer_position_nonnegative" CHECK ("studio_layer"."position" >= 0),
	CONSTRAINT "studio_layer_dimensions_positive" CHECK ("studio_layer"."width" > 0 and "studio_layer"."height" > 0),
	CONSTRAINT "studio_layer_config_matches_type" CHECK (("studio_layer"."type" = 'text' and "studio_layer"."text" is not null) or ("studio_layer"."type" = 'png' and "studio_layer"."asset_id" is not null) or ("studio_layer"."type" = 'browser' and "studio_layer"."browser_url" is not null) or ("studio_layer"."type" = 'alert' and "studio_layer"."alert_event" is not null))
);
--> statement-breakpoint
CREATE TABLE "studio_scene" (
	"id" text PRIMARY KEY NOT NULL,
	"studio_user_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"transition" "studio_transition" NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	CONSTRAINT "studio_scene_position_unique" UNIQUE("studio_user_id","position"),
	CONSTRAINT "studio_scene_position_nonnegative" CHECK ("studio_scene"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "direct_production_mode" text DEFAULT 'obs' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "studio_empty_warning_dismissed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "studio" ADD CONSTRAINT "studio_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_asset" ADD CONSTRAINT "studio_asset_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_layer" ADD CONSTRAINT "studio_layer_scene_id_studio_scene_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."studio_scene"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_layer" ADD CONSTRAINT "studio_layer_asset_id_studio_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."studio_asset"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_scene" ADD CONSTRAINT "studio_scene_studio_user_id_studio_user_id_fk" FOREIGN KEY ("studio_user_id") REFERENCES "public"."studio"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "studio_asset_owner_idx" ON "studio_asset" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "studio_layer_scene_idx" ON "studio_layer" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "studio_scene_owner_idx" ON "studio_scene" USING btree ("studio_user_id");--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_direct_production_mode_known" CHECK ("app_user"."direct_production_mode" in ('cloud_studio', 'obs'));