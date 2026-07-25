ALTER TABLE "path_state" ADD COLUMN "link_bitrate_kbps" integer;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "link_target_bitrate_kbps" integer;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "link_rtt_ms" integer;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "link_packet_loss_pct" real;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "link_stats_at" timestamp with time zone;
