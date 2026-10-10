CREATE TABLE "obs_backup" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"file_count" integer DEFAULT 0 NOT NULL,
	"total_bytes" bigint DEFAULT 0 NOT NULL,
	"label" text,
	"os" text,
	"obs_version" text
);
--> statement-breakpoint
ALTER TABLE "obs_backup" ADD CONSTRAINT "obs_backup_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "obs_backup_user_completed_idx" ON "obs_backup" USING btree ("user_id","completed_at");
