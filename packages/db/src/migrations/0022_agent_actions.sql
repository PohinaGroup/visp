CREATE TABLE "agent_action" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"capability" text NOT NULL,
	"input" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_action_user_status_idx" ON "agent_action" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "agent_action_agent_idx" ON "agent_action" USING btree ("agent_id");
CREATE UNIQUE INDEX "agent_action_pending_unique" ON "agent_action" USING btree ("agent_id","capability","input") WHERE "status" = 'pending';
