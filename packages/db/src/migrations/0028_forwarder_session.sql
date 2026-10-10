CREATE TABLE "forwarder_session" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"path_id" bigint NOT NULL,
	"relay_id" integer,
	"destination" text NOT NULL,
	"destination_ref" text,
	"role" "direct_role" DEFAULT 'landscape' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "forwarder_session_valid_range" CHECK ("forwarder_session"."ended_at" is null or "forwarder_session"."ended_at" >= "forwarder_session"."started_at"),
	CONSTRAINT "forwarder_session_destination_known" CHECK ("forwarder_session"."destination" in ('twitch', 'kick', 'youtube', 'custom'))
);--> statement-breakpoint
ALTER TABLE "forwarder_session" ADD CONSTRAINT "forwarder_session_path_id_path_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."path"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forwarder_session" ADD CONSTRAINT "forwarder_session_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "forwarder_session_one_open" ON "forwarder_session" USING btree ("path_id","destination",coalesce("destination_ref", ''),"role") WHERE "forwarder_session"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "forwarder_session_relay_started_idx" ON "forwarder_session" USING btree ("relay_id","started_at");
