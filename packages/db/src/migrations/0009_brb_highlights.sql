CREATE TABLE "brb_highlight" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"label" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"codec" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"checksum" text NOT NULL,
	"position" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brb_highlight_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "brb_highlight_duration" CHECK ("brb_highlight"."duration_ms" between 1 and 30000),
	CONSTRAINT "brb_highlight_size" CHECK ("brb_highlight"."byte_size" between 1 and 26214400),
	CONSTRAINT "brb_highlight_dimensions" CHECK ("brb_highlight"."width" > 0 and "brb_highlight"."height" > 0)
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "brb_highlights" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "brb_highlights_deleting" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "brb_highlights_muted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "brb_highlights_overlay" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "brb_highlights_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "brb_highlights_played" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "brb_highlights_result_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brb_highlight" ADD CONSTRAINT "brb_highlight_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brb_highlight_user_position_unique" ON "brb_highlight" USING btree ("user_id","position") WHERE "brb_highlight"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "brb_highlight_user_position_idx" ON "brb_highlight" USING btree ("user_id","position");