CREATE TYPE "typography_language" AS ENUM ('en', 'fi');--> statement-breakpoint
CREATE TYPE "typography_project_state" AS ENUM ('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "typography_project" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "app_user"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"language" "typography_language" NOT NULL,
	"state" "typography_project_state" DEFAULT 'uploading' NOT NULL,
	"source_key" text NOT NULL,
	"export_key" text,
	"document" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "typography_project_owner_idx" ON "typography_project" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "typography_project_expiry_idx" ON "typography_project" USING btree ("expires_at");
