import { db } from "@VISP/db";
import { sql } from "drizzle-orm";
import { tryAdvisoryLock } from "./advisory-lock";

/** Raw samples stay this long; older ones only survive as hourly rollups. */
export const RELAY_HEALTH_RAW_RETENTION_DAYS = 30;
/** Hourly rollups cover a year plus a month, so year-over-year compares work. */
export const RELAY_HEALTH_HOURLY_RETENTION_MONTHS = 13;

export type RelayHealthRetentionResult = {
	rolledSamples: number;
	hourlyRows: number;
	prunedHourly: number;
};

/**
 * Folds raw `relay_health_sample` rows older than the raw window into
 * `relay_health_hourly`, deletes them, then drops hourly rows past their own
 * window. Returns null when another server instance holds the lock — every
 * app host runs the same timer, and one roller per hour is enough.
 *
 * The cutoff is aligned to the hour so an hour is normally rolled in one go;
 * the upsert still merges (weighted mean, greatest peaks, summed counts) so a
 * straggler sample in an already-rolled hour adds to it instead of replacing
 * it. Move and rollup happen in one statement, so a crash can neither lose
 * samples nor count them twice, and a re-run finds nothing left to roll.
 */
export async function rollupAndPruneRelayHealth(
	now: Date = new Date(),
): Promise<RelayHealthRetentionResult | null> {
	const lock = await tryAdvisoryLock("relay-health-retention");
	if (!lock) return null;
	try {
		const rawCutoff = sql`date_trunc('hour', (${now.toISOString()}::timestamptz - make_interval(days => ${RELAY_HEALTH_RAW_RETENTION_DAYS})) at time zone 'UTC') at time zone 'UTC'`;
		const rolled = await db.execute<{
			rolled_samples: number;
			hourly_rows: number;
		}>(sql`
			with moved as (
				delete from relay_health_sample
				where reported_at < ${rawCutoff}
				returning *
			), upserted as (
				insert into relay_health_hourly (
					relay_id, hour, avg_load1, max_load1, max_mem_used_pct,
					max_disk_used_pct, max_live_paths, max_active_forwarders, samples
				)
				select
					relay_id,
					date_trunc('hour', reported_at at time zone 'UTC') at time zone 'UTC',
					avg(load1),
					max(load1),
					max(mem_used_pct),
					max(disk_used_pct),
					max(live_paths),
					max(active_forwarders),
					count(*)::int
				from moved
				group by 1, 2
				on conflict (relay_id, hour) do update set
					avg_load1 = (
						relay_health_hourly.avg_load1 * relay_health_hourly.samples
						+ excluded.avg_load1 * excluded.samples
					) / (relay_health_hourly.samples + excluded.samples),
					max_load1 = greatest(relay_health_hourly.max_load1, excluded.max_load1),
					max_mem_used_pct = greatest(relay_health_hourly.max_mem_used_pct, excluded.max_mem_used_pct),
					max_disk_used_pct = greatest(relay_health_hourly.max_disk_used_pct, excluded.max_disk_used_pct),
					max_live_paths = greatest(relay_health_hourly.max_live_paths, excluded.max_live_paths),
					max_active_forwarders = greatest(relay_health_hourly.max_active_forwarders, excluded.max_active_forwarders),
					samples = relay_health_hourly.samples + excluded.samples
				returning 1
			)
			select
				(select count(*) from moved)::int as rolled_samples,
				(select count(*) from upserted)::int as hourly_rows
		`);
		const pruned = await db.execute(sql`
			delete from relay_health_hourly
			where hour < ${now.toISOString()}::timestamptz - make_interval(months => ${RELAY_HEALTH_HOURLY_RETENTION_MONTHS})
		`);
		return {
			rolledSamples: Number(rolled.rows[0]?.rolled_samples ?? 0),
			hourlyRows: Number(rolled.rows[0]?.hourly_rows ?? 0),
			prunedHourly: pruned.rowCount ?? 0,
		};
	} finally {
		await lock.release();
	}
}
