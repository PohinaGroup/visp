import { db } from "@VISP/db";
import { relay, relayHealth } from "@VISP/db/schema/index";
import { TRPCError } from "@trpc/server";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../../index";

export type RelayHistoryBucket = "raw" | "hour" | "day";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Widest range each bucket may cover. Raw samples arrive every ~30 s, so two
 * days of them is already ~5,800 points per relay; past these limits the
 * response stops being a chart and becomes a dump. 400 days covers the
 * 13-month hourly retention with room to spare.
 */
export const RELAY_HISTORY_MAX_RANGE_MS: Record<RelayHistoryBucket, number> = {
	raw: 2 * DAY_MS,
	hour: 92 * DAY_MS,
	day: 400 * DAY_MS,
};

/**
 * Default resolution for a range: raw up to 6 h (the "what happened during
 * that incident" view), hourly up to 14 d (the 7-day sparklines), daily
 * beyond (capacity trends). Keeps every default response at a few hundred
 * points per relay.
 */
export function pickRelayHistoryBucket(
	from: Date,
	to: Date,
): RelayHistoryBucket {
	const range = to.getTime() - from.getTime();
	if (range <= 6 * HOUR_MS) return "raw";
	if (range <= 14 * DAY_MS) return "hour";
	return "day";
}

export const relayHistoryInput = z
	.object({
		relayId: z.number().int().positive().optional(),
		from: z.iso.datetime({ offset: true }),
		to: z.iso.datetime({ offset: true }),
		bucket: z.enum(["raw", "hour", "day"]).optional(),
	})
	.refine(
		({ from, to }) => new Date(from).getTime() < new Date(to).getTime(),
		"`from` must be before `to`",
	);

/** One bucket of one relay. `t` is the bucket start (ISO, UTC). */
export type RelayHistoryPoint = {
	t: string;
	load1Avg: number;
	load1Max: number;
	/**
	 * Cores at the time where known. Hourly rollups do not keep it, so buckets
	 * built only from rollups fall back to the relay's latest reported count.
	 */
	cpuCount: number | null;
	memUsedPctMax: number;
	diskUsedPctMax: number;
	livePathsMax: number | null;
	activeForwardersMax: number | null;
};

type HistoryRow = {
	relay_id: number;
	t: Date | string;
	load1_avg: number | string;
	load1_max: number | string;
	cpu_count: number | null;
	mem_used_pct_max: number | string;
	disk_used_pct_max: number | string;
	live_paths_max: number | null;
	active_forwarders_max: number | null;
};

const nullableInt = (value: number | string | null) =>
	value === null ? null : Number(value);

/**
 * Health history for the admin Relays page: one series per relay, built from
 * raw `relay_health_sample` rows and `relay_health_hourly` rollups.
 *
 * The two tables never hold the same sample — the hourly job *moves* rows
 * past the 30-day raw window into rollups — so both are read over the whole
 * range and merged per bucket with no cutoff to keep in sync with retention.
 * Means are weighted by sample count so a bucket mixing a rollup with a late
 * straggler sample averages the same way the rollup itself would. In `raw`
 * mode, ranges older than the raw window come back at hourly resolution
 * because that is all that is kept.
 *
 * Two queries for any number of relays (history + relay capacities), so the
 * fleet table does not fan out per row.
 */
export const adminRelayHistoryRouter = router({
	history: adminProcedure.input(relayHistoryInput).query(async ({ input }) => {
		const from = new Date(input.from);
		const to = new Date(input.to);
		const bucket = input.bucket ?? pickRelayHistoryBucket(from, to);
		if (to.getTime() - from.getTime() > RELAY_HISTORY_MAX_RANGE_MS[bucket]) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Range too wide for ${bucket} buckets`,
			});
		}
		const fromIso = from.toISOString();
		const toIso = to.toISOString();
		const sampleRelay =
			input.relayId === undefined
				? sql``
				: sql`and relay_id = ${input.relayId}`;
		// `t` for raw is the sample time itself; UTC-aligned truncation
		// otherwise, so day buckets do not move with the server's zone.
		const bucketStart =
			bucket === "raw"
				? sql`t`
				: sql`date_trunc(${bucket}, t at time zone 'UTC') at time zone 'UTC'`;

		const [history, relays] = await Promise.all([
			db.execute<HistoryRow>(sql`
					with src as (
						select
							relay_id,
							reported_at as t,
							load1::float8 as load1_sum,
							load1::float8 as load1_max,
							cpu_count,
							mem_used_pct::float8 as mem_used_pct,
							disk_used_pct::float8 as disk_used_pct,
							live_paths,
							active_forwarders,
							1 as samples
						from relay_health_sample
						where reported_at >= ${fromIso}::timestamptz
							and reported_at < ${toIso}::timestamptz
							${sampleRelay}
						union all
						select
							relay_id,
							hour,
							avg_load1::float8 * samples,
							max_load1::float8,
							null::int,
							max_mem_used_pct::float8,
							max_disk_used_pct::float8,
							max_live_paths,
							max_active_forwarders,
							samples
						from relay_health_hourly
						where hour >= ${fromIso}::timestamptz
							and hour < ${toIso}::timestamptz
							${sampleRelay}
					)
					select
						relay_id,
						${bucketStart} as t,
						sum(load1_sum) / nullif(sum(samples), 0) as load1_avg,
						max(load1_max) as load1_max,
						max(cpu_count) as cpu_count,
						max(mem_used_pct) as mem_used_pct_max,
						max(disk_used_pct) as disk_used_pct_max,
						max(live_paths) as live_paths_max,
						max(active_forwarders) as active_forwarders_max
					from src
					group by relay_id, 2
					order by relay_id, 2
				`),
			db
				.select({
					relayId: relay.id,
					name: relay.name,
					capacityPaths: relay.capacityPaths,
					maxForwarders: relay.maxForwarders,
					currentCpuCount: relayHealth.cpuCount,
				})
				.from(relay)
				.leftJoin(relayHealth, eq(relayHealth.relayId, relay.id))
				.where(
					input.relayId === undefined ? undefined : eq(relay.id, input.relayId),
				)
				.orderBy(asc(relay.name)),
		]);

		const seriesByRelay = new Map<number, RelayHistoryPoint[]>();
		const cpuByRelay = new Map(
			relays.map((row) => [row.relayId, row.currentCpuCount]),
		);
		for (const row of history.rows) {
			const relayId = Number(row.relay_id);
			let series = seriesByRelay.get(relayId);
			if (!series) {
				series = [];
				seriesByRelay.set(relayId, series);
			}
			series.push({
				t: new Date(row.t).toISOString(),
				load1Avg: Number(row.load1_avg),
				load1Max: Number(row.load1_max),
				cpuCount: nullableInt(row.cpu_count) ?? cpuByRelay.get(relayId) ?? null,
				memUsedPctMax: Number(row.mem_used_pct_max),
				diskUsedPctMax: Number(row.disk_used_pct_max),
				livePathsMax: nullableInt(row.live_paths_max),
				activeForwardersMax: nullableInt(row.active_forwarders_max),
			});
		}

		return {
			from: fromIso,
			to: toIso,
			bucket,
			relays: relays.map(({ currentCpuCount: _cpu, ...row }) => ({
				...row,
				series: seriesByRelay.get(row.relayId) ?? [],
			})),
		};
	}),
});
