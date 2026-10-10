import {
	index,
	integer,
	pgTable,
	primaryKey,
	real,
	timestamp,
} from "drizzle-orm/pg-core";

import { relay } from "./relay";

/**
 * Every host-metrics sample a relay pushes (~every 30 s, see
 * deploy/systemd/visp-relay-health.timer), kept raw for 30 days so admin can
 * chart recent load and answer "was it the relay?" after an incident.
 * `relay_health` stays the cheap "now" read; this is the history behind it.
 *
 * Percentages are stored instead of the raw kb pairs: history is read as
 * "how full was it", and a resized disk must not make old rows lie.
 * `live_paths`/`active_forwarders` are nullable because they come from the
 * control plane's view (path_state), not the relay, and older rows predate
 * them.
 */
export const relayHealthSample = pgTable(
	"relay_health_sample",
	{
		relayId: integer("relay_id")
			.notNull()
			.references(() => relay.id, { onDelete: "cascade" }),
		reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
		load1: real("load1").notNull(),
		cpuCount: integer("cpu_count").notNull(),
		memUsedPct: real("mem_used_pct").notNull(),
		diskUsedPct: real("disk_used_pct").notNull(),
		livePaths: integer("live_paths"),
		activeForwarders: integer("active_forwarders"),
	},
	(table) => [
		primaryKey({ columns: [table.relayId, table.reportedAt] }),
		// Retention prunes by age across all relays; the PK leads with relay_id.
		index("relay_health_sample_reported_at_idx").on(table.reportedAt),
	],
);

/**
 * Hourly rollup of `relay_health_sample` for samples past the 30-day raw
 * window, kept 13 months so year-over-year capacity questions still have an
 * answer. Peaks are kept alongside the mean because capacity planning cares
 * about the worst minute, not the average one. `samples` lets a later rollup
 * of the same hour merge its mean correctly.
 */
export const relayHealthHourly = pgTable(
	"relay_health_hourly",
	{
		relayId: integer("relay_id")
			.notNull()
			.references(() => relay.id, { onDelete: "cascade" }),
		hour: timestamp("hour", { withTimezone: true }).notNull(),
		avgLoad1: real("avg_load1").notNull(),
		maxLoad1: real("max_load1").notNull(),
		maxMemUsedPct: real("max_mem_used_pct").notNull(),
		maxDiskUsedPct: real("max_disk_used_pct").notNull(),
		maxLivePaths: integer("max_live_paths"),
		maxActiveForwarders: integer("max_active_forwarders"),
		samples: integer("samples").notNull(),
	},
	(table) => [primaryKey({ columns: [table.relayId, table.hour] })],
);
