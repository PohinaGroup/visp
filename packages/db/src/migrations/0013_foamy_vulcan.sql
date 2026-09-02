ALTER TABLE "path_state" ADD COLUMN "direct_source_path_id" bigint;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "direct_handover_target_path_id" bigint;--> statement-breakpoint
ALTER TABLE "path_state" ADD COLUMN "direct_handover_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "path_state" ADD CONSTRAINT "path_state_direct_source_path_id_path_id_fk" FOREIGN KEY ("direct_source_path_id") REFERENCES "public"."path"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "path_state" ADD CONSTRAINT "path_state_direct_handover_target_path_id_path_id_fk" FOREIGN KEY ("direct_handover_target_path_id") REFERENCES "public"."path"("id") ON DELETE set null ON UPDATE no action;