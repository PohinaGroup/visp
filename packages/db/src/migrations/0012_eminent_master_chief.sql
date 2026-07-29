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
ALTER TABLE "path_state" ADD COLUMN "link_count" integer;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "link_degraded" boolean;--> statement-breakpoint
ALTER TABLE "path" ADD COLUMN "relay_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "rtt_sample" ADD COLUMN "relay_id" integer;--> statement-breakpoint
ALTER TABLE "path" ADD CONSTRAINT "path_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtt_sample" ADD CONSTRAINT "rtt_sample_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE no action ON UPDATE no action;