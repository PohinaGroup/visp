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
INSERT INTO "relay" ("name", "host", "api_url", "ping_url", "region", "capacity_paths", "max_forwarders", "public_ip")
VALUES ('default', 'pending', 'http://pending', 'http://pending', 'default', 1000, 0, 'pending');--> statement-breakpoint
ALTER TABLE "path" ADD COLUMN "relay_id" integer;--> statement-breakpoint
UPDATE "path" SET "relay_id" = (SELECT "id" FROM "relay" WHERE "name" = 'default');--> statement-breakpoint
ALTER TABLE "path" ALTER COLUMN "relay_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rtt_sample" ADD COLUMN "relay_id" integer;--> statement-breakpoint
ALTER TABLE "path" ADD CONSTRAINT "path_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rtt_sample" ADD CONSTRAINT "rtt_sample_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE no action ON UPDATE no action;
