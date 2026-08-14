CREATE TABLE "affiliate_application" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"applicant_name" text NOT NULL,
	"email" text NOT NULL,
	"youtube_channel_url" text NOT NULL,
	"relevant_video_url" text NOT NULL,
	"audience_and_setup" text NOT NULL,
	"disclosure_accepted" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_application_name_length" CHECK (char_length(trim("affiliate_application"."applicant_name")) between 1 and 120),
	CONSTRAINT "affiliate_application_email_length" CHECK (char_length("affiliate_application"."email") between 3 and 320),
	CONSTRAINT "affiliate_application_channel_url_length" CHECK (char_length("affiliate_application"."youtube_channel_url") between 1 and 2048),
	CONSTRAINT "affiliate_application_video_url_length" CHECK (char_length("affiliate_application"."relevant_video_url") between 1 and 2048),
	CONSTRAINT "affiliate_application_audience_length" CHECK (char_length(trim("affiliate_application"."audience_and_setup")) between 1 and 4000),
	CONSTRAINT "affiliate_application_disclosure_accepted" CHECK ("affiliate_application"."disclosure_accepted")
);
