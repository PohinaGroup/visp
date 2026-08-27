ALTER TABLE "chat_bot" ADD COLUMN "sender_mode" text DEFAULT 'visp' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "chat_bot_account_selection" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_bot" ADD CONSTRAINT "chat_bot_sender_mode" CHECK ("chat_bot"."sender_mode" in ('visp', 'self'));