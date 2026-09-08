CREATE TYPE "typography_job_kind" AS ENUM ('transcription', 'export');--> statement-breakpoint
CREATE TYPE "typography_job_state" AS ENUM ('queued', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "typography_job" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "typography_project"("id") ON DELETE cascade,
	"kind" "typography_job_kind" NOT NULL,
	"state" "typography_job_state" DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "typography_job_project_kind_unique" ON "typography_job" USING btree ("project_id", "kind");--> statement-breakpoint
CREATE INDEX "typography_job_queue_idx" ON "typography_job" USING btree ("state", "created_at");
