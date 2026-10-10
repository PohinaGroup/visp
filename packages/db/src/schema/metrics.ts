import { sql } from "drizzle-orm";
import {
	bigint,
	bigserial,
	check,
	index,
	numeric,
	pgTable,
	serial,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/** The hosted features VISP pays a provider for, per unit consumed. */
export const HOSTED_USAGE_FEATURES = [
	"tts",
	"subtitles",
	"audio_isolation",
] as const;
export type HostedUsageFeature = (typeof HOSTED_USAGE_FEATURES)[number];

/** How providers bill: TTS per character, transcription/isolation per second. */
export const HOSTED_USAGE_UNITS = ["characters", "seconds"] as const;
export type HostedUsageUnit = (typeof HOSTED_USAGE_UNITS)[number];

/**
 * Metered consumption of hosted (billed-to-VISP) features. Rows are written in
 * batches by `@VISP/api/hosted-usage`, already summed per (user, feature, unit,
 * provider) over the flush window, so one row is "this much in about a minute"
 * rather than one row per utterance. `occurred_at` is the flush time, which is
 * at most one flush interval late; that is fine for daily cost rollups.
 */
export const hostedUsage = pgTable(
	"hosted_usage",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		feature: text("feature", { enum: HOSTED_USAGE_FEATURES }).notNull(),
		units: bigint("units", { mode: "number" }).notNull(),
		unit: text("unit", { enum: HOSTED_USAGE_UNITS }).notNull(),
		provider: text("provider"),
		occurredAt: timestamp("occurred_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		check(
			"hosted_usage_feature_known",
			sql`${table.feature} in ('tts', 'subtitles', 'audio_isolation')`,
		),
		check("hosted_usage_units_positive", sql`${table.units} > 0`),
		check(
			"hosted_usage_unit_known",
			sql`${table.unit} in ('characters', 'seconds')`,
		),
		index("hosted_usage_user_occurred_at_idx").on(
			table.userId,
			table.occurredAt,
		),
		index("hosted_usage_feature_occurred_at_idx").on(
			table.feature,
			table.occurredAt,
		),
	],
);

/**
 * What one unit of a hosted feature costs VISP, effective from `valid_from`
 * until the next row for the same (feature, unit, provider). Prices are
 * business data and are inserted by hand, never seeded by a migration. A null
 * provider is a catch-all price for usage recorded without one; the unique key
 * treats nulls as equal so that catch-all cannot be duplicated.
 */
export const unitPrice = pgTable(
	"unit_price",
	{
		id: serial("id").primaryKey(),
		feature: text("feature", { enum: HOSTED_USAGE_FEATURES }).notNull(),
		unit: text("unit", { enum: HOSTED_USAGE_UNITS }).notNull(),
		provider: text("provider"),
		eurPerUnit: numeric("eur_per_unit", { precision: 12, scale: 8 }).notNull(),
		validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
	},
	(table) => [
		check(
			"unit_price_feature_known",
			sql`${table.feature} in ('tts', 'subtitles', 'audio_isolation')`,
		),
		check(
			"unit_price_unit_known",
			sql`${table.unit} in ('characters', 'seconds')`,
		),
		check("unit_price_nonnegative", sql`${table.eurPerUnit} >= 0`),
		unique("unit_price_feature_unit_provider_valid_from_key")
			.on(table.feature, table.unit, table.provider, table.validFrom)
			.nullsNotDistinct(),
	],
);
