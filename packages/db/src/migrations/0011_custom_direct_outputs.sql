CREATE TABLE "custom_direct_output" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"destination_id" text NOT NULL,
	"path_id" bigint NOT NULL,
	"role" "direct_role" DEFAULT 'landscape' NOT NULL,
	"crop" jsonb,
	"state" text,
	"error" text,
	"reserved_relay_id" integer,
	"reserved_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_direct_output_user_destination_role_unique" UNIQUE("user_id","destination_id","role"),
	CONSTRAINT "custom_direct_output_crop_role" CHECK (("custom_direct_output"."role" = 'landscape' and "custom_direct_output"."crop" is null) or ("custom_direct_output"."role" = 'portrait' and "custom_direct_output"."crop" is not null))
);
--> statement-breakpoint
ALTER TABLE "custom_direct_output" ADD CONSTRAINT "custom_direct_output_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_direct_output" ADD CONSTRAINT "custom_direct_output_destination_id_custom_direct_destination_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."custom_direct_destination"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_direct_output" ADD CONSTRAINT "custom_direct_output_path_id_path_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."path"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_direct_output" ADD CONSTRAINT "custom_direct_output_reserved_relay_id_relay_id_fk" FOREIGN KEY ("reserved_relay_id") REFERENCES "public"."relay"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_direct_output_path_idx" ON "custom_direct_output" USING btree ("path_id");--> statement-breakpoint
CREATE INDEX "custom_direct_output_reservation_idx" ON "custom_direct_output" USING btree ("reserved_relay_id","reserved_until");