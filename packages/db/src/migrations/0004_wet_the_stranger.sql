ALTER TABLE "app_user" ADD COLUMN "chat_overlay_token_id" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "chat_overlay_token_hash" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_chat_overlay_token_id_unique" UNIQUE("chat_overlay_token_id");