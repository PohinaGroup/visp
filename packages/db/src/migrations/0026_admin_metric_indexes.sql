CREATE INDEX IF NOT EXISTS "relay_stream_session_first_live_idx" ON "relay_stream_session" USING btree ("first_live_at") WHERE "relay_stream_session"."first_live_at" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_created_at_idx" ON "user" USING btree ("created_at");
