CREATE TABLE "custom_direct_destination" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"protocol" text NOT NULL,
	"encrypted_url" text NOT NULL,
	"endpoint_summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_direct_destination_user_name_unique" UNIQUE("user_id","name"),
	CONSTRAINT "custom_direct_destination_name_length" CHECK (char_length(trim("custom_direct_destination"."name")) between 1 and 64),
	CONSTRAINT "custom_direct_destination_protocol_known" CHECK ("custom_direct_destination"."protocol" in ('rtmp', 'rtmps', 'srt'))
);
--> statement-breakpoint
ALTER TABLE "custom_direct_destination" ADD CONSTRAINT "custom_direct_destination_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
