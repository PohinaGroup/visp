CREATE TABLE "relay_health" (
	"relay_id" integer PRIMARY KEY NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cpu_count" integer NOT NULL,
	"load1" real NOT NULL,
	"load5" real NOT NULL,
	"load15" real NOT NULL,
	"mem_total_kb" bigint NOT NULL,
	"mem_available_kb" bigint NOT NULL,
	"disk_total_kb" bigint NOT NULL,
	"disk_available_kb" bigint NOT NULL,
	"uptime_seconds" integer NOT NULL
);--> statement-breakpoint
ALTER TABLE "relay_health" ADD CONSTRAINT "relay_health_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE cascade ON UPDATE no action;
