CREATE TABLE "relay_stream_session" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"path_id" bigint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"source_type" text,
	CONSTRAINT "relay_stream_session_valid_range" CHECK ("relay_stream_session"."ended_at" is null or "relay_stream_session"."ended_at" >= "relay_stream_session"."started_at")
);
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_expires" timestamp;--> statement-breakpoint
ALTER TABLE "relay_stream_session" ADD CONSTRAINT "relay_stream_session_path_id_path_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."path"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relay_stream_session_path_started_idx" ON "relay_stream_session" USING btree ("path_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "relay_stream_session_one_open_per_path" ON "relay_stream_session" USING btree ("path_id") WHERE "relay_stream_session"."ended_at" is null;