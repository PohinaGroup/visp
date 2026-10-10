CREATE TABLE "daily_metrics" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"segment" text DEFAULT 'all' NOT NULL,
	"value" double precision NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_metrics_day_metric_segment_pk" PRIMARY KEY("day","metric","segment")
);
