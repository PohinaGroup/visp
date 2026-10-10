CREATE TABLE "relay_health_sample" (
	"relay_id" integer NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"load1" real NOT NULL,
	"cpu_count" integer NOT NULL,
	"mem_used_pct" real NOT NULL,
	"disk_used_pct" real NOT NULL,
	"live_paths" integer,
	"active_forwarders" integer,
	CONSTRAINT "relay_health_sample_relay_id_reported_at_pk" PRIMARY KEY("relay_id","reported_at")
);--> statement-breakpoint
CREATE TABLE "relay_health_hourly" (
	"relay_id" integer NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"avg_load1" real NOT NULL,
	"max_load1" real NOT NULL,
	"max_mem_used_pct" real NOT NULL,
	"max_disk_used_pct" real NOT NULL,
	"max_live_paths" integer,
	"max_active_forwarders" integer,
	"samples" integer NOT NULL,
	CONSTRAINT "relay_health_hourly_relay_id_hour_pk" PRIMARY KEY("relay_id","hour")
);--> statement-breakpoint
ALTER TABLE "relay_health_sample" ADD CONSTRAINT "relay_health_sample_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_health_hourly" ADD CONSTRAINT "relay_health_hourly_relay_id_relay_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relay"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relay_health_sample_reported_at_idx" ON "relay_health_sample" USING btree ("reported_at");
