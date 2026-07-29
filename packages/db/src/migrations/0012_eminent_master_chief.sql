CREATE TABLE IF NOT EXISTS "relay" (
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
SELECT 'default', 'pending', 'http://pending', 'http://pending', 'default', 1000, 0, 'pending'
WHERE NOT EXISTS (SELECT 1 FROM "relay" WHERE "name" = 'default');--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN IF NOT EXISTS "link_count" integer;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN IF NOT EXISTS "link_degraded" boolean;--> statement-breakpoint
ALTER TABLE "path" ADD COLUMN IF NOT EXISTS "relay_id" integer;--> statement-breakpoint
UPDATE "path" SET "relay_id" = (SELECT "id" FROM "relay" WHERE "name" = 'default' LIMIT 1) WHERE "relay_id" IS NULL;--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (SELECT 1 FROM "path" WHERE "relay_id" IS NULL) THEN
		RAISE EXCEPTION 'migration 0012: path.relay_id backfill failed; ensure relay named default exists';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "path" ALTER COLUMN "relay_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rtt_sample" ADD COLUMN IF NOT EXISTS "relay_id" integer;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "path" ADD CONSTRAINT "path_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "rtt_sample" ADD CONSTRAINT "rtt_sample_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
