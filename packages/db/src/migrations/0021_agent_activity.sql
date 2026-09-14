CREATE TABLE "auth_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL
);--> statement-breakpoint
CREATE INDEX "auth_cache_expires_at_idx" ON "auth_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE TABLE "agent_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"capability" text NOT NULL,
	"target" text NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_activity_user_created_at_idx" ON "agent_activity" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_activity_agent_created_at_idx" ON "agent_activity" USING btree ("agent_id","created_at");
