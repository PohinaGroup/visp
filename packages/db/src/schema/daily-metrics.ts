import {
	date,
	doublePrecision,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

/**
 * One value per (UTC day, metric, segment), written by the nightly rollup in
 * `@VISP/api/daily-metrics`. Dashboards can read finished days from here
 * instead of rescanning sessions on every load, and a day keeps its numbers
 * after the users behind it are deleted (live queries would lose them).
 *
 * Long rather than wide (`metric` as a column, not one column per KPI) so a
 * new rollup metric needs no migration. `segment` is `'all'` for the total;
 * other values split the same metric (e.g. signups per provider), so the
 * total is never the sum the reader has to compute. `value` is a double
 * because some metrics are hours. `computed_at` says how fresh a day is: the
 * job re-rolls recent days, so late-closing sessions land a day or two later.
 */
export const dailyMetrics = pgTable(
	"daily_metrics",
	{
		day: date("day", { mode: "string" }).notNull(),
		metric: text("metric").notNull(),
		segment: text("segment").notNull().default("all"),
		value: doublePrecision("value").notNull(),
		computedAt: timestamp("computed_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		primaryKey({ columns: [table.day, table.metric, table.segment] }),
	],
);
