import { sql } from "drizzle-orm";
import { check, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * What a weekly budget can be set for: every hosted feature, relay encoder
 * time, and `all` (the whole hosted bill). Encoder time has no unit price yet,
 * so its budget is stored but its spend is reported as unknown.
 */
export const SPEND_BUDGET_FEATURES = [
	"all",
	"tts",
	"subtitles",
	"audio_isolation",
	"encoder",
] as const;
export type SpendBudgetFeature = (typeof SPEND_BUDGET_FEATURES)[number];

/**
 * The weekly EUR budget per feature, one row each, set from the admin Usage
 * page. Only the current value is kept: the admin audit log holds every
 * change (`target_type = 'setting'`), so past weeks are compared against
 * today's budget, not the one in force back then.
 *
 * `updated_by` has no foreign key for the same reason as the audit log: a
 * setting must outlive the admin who set it.
 */
export const spendBudget = pgTable(
	"spend_budget",
	{
		feature: text("feature", { enum: SPEND_BUDGET_FEATURES }).primaryKey(),
		weeklyEur: numeric("weekly_eur", { precision: 12, scale: 2 }).notNull(),
		updatedBy: text("updated_by").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		check(
			"spend_budget_feature_known",
			sql`${table.feature} in ('all', 'tts', 'subtitles', 'audio_isolation', 'encoder')`,
		),
		check("spend_budget_weekly_eur_nonnegative", sql`${table.weeklyEur} >= 0`),
	],
);
