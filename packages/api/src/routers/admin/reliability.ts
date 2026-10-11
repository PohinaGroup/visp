import { db } from "@VISP/db";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../../index";
import { MAX_SERIES_RANGE_DAYS } from "./metrics";
import {
	bucketOf,
	bucketSeriesSql,
	eligibleUserIdsSql,
	eligibleUserWhere,
	floorToBucket,
	instant,
	type MetricInterval,
} from "./metrics-sql";
import { METRICS_DATA_START } from "./metrics-window";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Open sessions younger than this that have not gone live yet are still
 * connecting, not failures (docs/admin-kpis.md, KPI 9).
 */
export const STILL_CONNECTING_MINUTES = 10;

const RTT_METHODS = ["browser-probe", "manual"] as const;

/** Half-open `[from, to)` UTC range, as `toApiRange` sends it. */
const rangeObject = z.object({
	from: z.iso.datetime({ offset: true }),
	to: z.iso.datetime({ offset: true }),
	interval: z.enum(["day", "week"]),
});

/**
 * `from < to` and at most `MAX_SERIES_RANGE_DAYS` long, the same bound as
 * `admin.metrics.series`, which keeps the bucket series and scans small.
 */
function boundedRange<T extends typeof rangeObject>(schema: T) {
	return schema
		.refine(
			(input: z.infer<typeof rangeObject>) =>
				Date.parse(input.from) < Date.parse(input.to),
			{ message: "from must be before to", path: ["from"] },
		)
		.refine(
			(input: z.infer<typeof rangeObject>) =>
				Date.parse(input.to) - Date.parse(input.from) <=
				MAX_SERIES_RANGE_DAYS * DAY_MS,
			{
				message: `Range must be at most ${MAX_SERIES_RANGE_DAYS} days`,
				path: ["to"],
			},
		);
}

export const sessionSuccessInput = boundedRange(rangeObject);

export const rttInput = boundedRange(
	rangeObject.extend({
		/** Only probes of this kind; all kinds when omitted. */
		method: z.enum(RTT_METHODS).optional(),
	}),
);

/**
 * "Direct session" condition on a `path` row aliased `alias`: the path has a
 * Direct output configured right now, through a legacy provider flag
 * (`path.direct_*`), a `direct_destination` (portrait) or a
 * `custom_direct_output`. `first_live_at` is only ever set by Direct outputs,
 * so on any other path every session would look like a failure; see
 * docs/admin-kpis.md, KPI 9 and "Legacy sessions". It is the path's current
 * configuration, not what it had during the session, because Direct config
 * has no history.
 */
export function directPathWhere(alias: string): SQL {
	const p = sql.identifier(alias);
	return sql`(${p}.direct_twitch or ${p}.direct_kick or ${p}.direct_youtube
		or exists (select 1 from direct_destination dd where dd.path_id = ${p}.id)
		or exists (select 1 from custom_direct_output cdo where cdo.path_id = ${p}.id))`;
}

/**
 * Direct sessions of eligible users started in `[from, to)`, minus the ones
 * still connecting. Columns: `started_at`, `first_live_at`, `start_to_live`
 * (seconds, null when the session never went live).
 */
export function directSessionsSql(from: Date, to: Date): SQL {
	// `greatest` skips nulls, so it alone would turn "never live" into 0 s.
	return sql`select s.started_at, s.first_live_at,
			case when s.first_live_at is not null then
				greatest(extract(epoch from s.first_live_at - s.started_at), 0)::float8
			end as start_to_live
		from relay_stream_session s
		join "path" p on p.id = s.path_id
		where s.started_at >= ${instant(from)}
			and s.started_at < ${instant(to)}
			and p.user_id in (${eligibleUserIdsSql()})
			and ${directPathWhere("p")}
			and not (
				s.first_live_at is null
				and s.ended_at is null
				and s.started_at > now() - ${sql.raw(`interval '${STILL_CONNECTING_MINUTES} minutes'`)}
			)`;
}

const SUCCESS_AGGREGATES = sql`count(*)::int as started,
	count(ds.first_live_at)::int as live,
	percentile_cont(0.5) within group (order by ds.start_to_live) as p50,
	percentile_cont(0.95) within group (order by ds.start_to_live) as p95`;

type SuccessRow = {
	started: number | string | null;
	live: number | string | null;
	p50: number | string | null;
	p95: number | string | null;
};

export type SessionSuccessStats = {
	/** Direct sessions started (still-connecting ones left out). */
	started: number;
	/** Of those, sessions that reached live. */
	live: number;
	/** `live / started`, 0–1; null with no sessions. */
	successRate: number | null;
	/** Start-to-live seconds over sessions that went live; null with none. */
	startToLiveP50Sec: number | null;
	startToLiveP95Sec: number | null;
};

const nullableNumber = (value: number | string | null | undefined) =>
	value === null || value === undefined ? null : Number(value);

/**
 * A percentile rounded to 1/1000 of its unit. `percentile_cont` interpolates
 * in float8, so 85.5 can come back as 85.49999999999999; milliseconds of a
 * second (or microseconds of RTT) are far below what the charts show.
 */
const percentileValue = (value: number | string | null | undefined) => {
	const number = nullableNumber(value);
	return number === null ? null : Math.round(number * 1000) / 1000;
};

function toStats(row: SuccessRow | undefined): SessionSuccessStats {
	const started = Number(row?.started ?? 0);
	const live = Number(row?.live ?? 0);
	return {
		started,
		live,
		successRate: started > 0 ? live / started : null,
		startToLiveP50Sec: percentileValue(row?.p50),
		startToLiveP95Sec: percentileValue(row?.p95),
	};
}

export type RttBucket = {
	bucket: string;
	relayId: number;
	relayName: string;
	/** Percentiles across per-user medians; null when nobody probed. */
	p50Ms: number | null;
	p95Ms: number | null;
	samples: number;
	users: number;
};

type RttRow = {
	bucket: Date | string;
	relay_id: number | string;
	relay_name: string;
	p50: number | string | null;
	p95: number | string | null;
	samples: number | string;
	users: number | string;
};

export const adminReliabilityRouter = router({
	/**
	 * Session success rate and start-to-live latency (docs/admin-kpis.md,
	 * KPIs 9 and 10) per UTC day or ISO week of `started_at`.
	 *
	 * Only **Direct sessions** count: sessions on paths that currently have a
	 * Direct output (see `directPathWhere`), because `first_live_at` is only
	 * set by Direct outputs and OBS-only sessions would all read as failures.
	 * Open sessions that started under 10 minutes ago without going live are
	 * still connecting and left out. Start-to-live is `first_live_at -
	 * started_at` in seconds, p50/p95 by `percentile_cont` over the sessions
	 * that went live.
	 *
	 * `from` is clamped to `METRICS_DATA_START` (older sessions have no
	 * `first_live_at` and would all count as failures); a range wholly before
	 * it returns no buckets. Buckets are gap-free from the bucket containing
	 * `from` (as `admin.metrics.series`), so a mid-week `from` shows the whole
	 * first week. `totals` covers exactly `[from, to)` after clamping, so a
	 * KPI tile and its comparison period count equal-length windows; it
	 * cannot be derived from the buckets because percentiles do not add up.
	 */
	sessionSuccess: adminProcedure
		.input(sessionSuccessInput)
		.query(async ({ input }) => {
			const interval: MetricInterval = input.interval;
			const to = new Date(input.to);
			let from = new Date(input.from);
			if (from < METRICS_DATA_START) from = METRICS_DATA_START;
			const result = { interval, dataStart: METRICS_DATA_START.toISOString() };
			if (from >= to) {
				return {
					...result,
					from: to.toISOString(),
					to: to.toISOString(),
					totals: toStats(undefined),
					buckets: [] as ({ bucket: string } & SessionSuccessStats)[],
				};
			}
			const scanFrom = floorToBucket(from, interval);
			const [series, totals] = await Promise.all([
				db.execute<SuccessRow & { bucket: Date | string }>(sql`
					select series.bucket, agg.started, agg.live, agg.p50, agg.p95
					from (${bucketSeriesSql(interval, from, to)}) series
					left join (
						select ${bucketOf(interval, sql`ds.started_at`)} as bucket,
							${SUCCESS_AGGREGATES}
						from (${directSessionsSql(scanFrom, to)}) ds
						group by 1
					) agg on agg.bucket = series.bucket
					order by series.bucket`),
				db.execute<SuccessRow>(sql`
					select ${SUCCESS_AGGREGATES}
					from (${directSessionsSql(from, to)}) ds`),
			]);
			return {
				...result,
				from: from.toISOString(),
				to: to.toISOString(),
				totals: toStats(totals.rows[0]),
				buckets: series.rows.map((row) => ({
					bucket: new Date(row.bucket).toISOString(),
					...toStats(row),
				})),
			};
		}),

	/**
	 * Streamer→relay RTT p50/p95 per relay and UTC day or ISO week of
	 * `rtt_sample.created_at` (docs/admin-kpis.md, KPI 11). These are setup
	 * probes (`browser-probe`, `manual`; filter with `method`), not in-stream
	 * link RTT. Eligible users only; samples without a relay are dropped.
	 *
	 * To keep one heavy prober from dominating, each user's samples in a
	 * bucket collapse to their median first, and the percentiles are taken
	 * across those per-user medians. `samples` is the raw sample count and
	 * `users` the number of medians behind the percentiles.
	 *
	 * Not clamped to `METRICS_DATA_START` (`rtt_sample` is unaffected).
	 * Every relay with a sample in the range gets every bucket from the one
	 * containing `from`; buckets without probes have null percentiles and 0
	 * samples, so a chart shows a gap rather than a fake 0 ms.
	 */
	rtt: adminProcedure.input(rttInput).query(async ({ input }) => {
		const interval: MetricInterval = input.interval;
		const from = new Date(input.from);
		const to = new Date(input.to);
		const method = input.method ? sql`and r.method = ${input.method}` : sql``;
		const { rows } = await db.execute<RttRow>(sql`
			with per_user as (
				select ${bucketOf(interval, sql`r.created_at`)} as bucket,
					r.relay_id,
					r.user_id,
					percentile_cont(0.5) within group (order by r.rtt_ms) as median_ms,
					count(*) as samples
				from rtt_sample r
				join "user" u on u.id = r.user_id
				where r.relay_id is not null
					and r.created_at >= ${instant(floorToBucket(from, interval))}
					and r.created_at < ${instant(to)}
					and ${eligibleUserWhere("u")}
					${method}
				group by 1, 2, 3
			), agg as (
				select bucket, relay_id,
					percentile_cont(0.5) within group (order by median_ms) as p50,
					percentile_cont(0.95) within group (order by median_ms) as p95,
					sum(samples) as samples,
					count(*) as users
				from per_user
				group by 1, 2
			)
			select series.bucket, rl.id as relay_id, rl.name as relay_name,
				agg.p50, agg.p95,
				coalesce(agg.samples, 0) as samples,
				coalesce(agg.users, 0) as users
			from (${bucketSeriesSql(interval, from, to)}) series
			cross join (select distinct relay_id from agg) relays
			join relay rl on rl.id = relays.relay_id
			left join agg
				on agg.bucket = series.bucket and agg.relay_id = relays.relay_id
			order by rl.name, rl.id, series.bucket`);
		return {
			interval,
			method: input.method ?? null,
			buckets: rows.map(
				(row): RttBucket => ({
					bucket: new Date(row.bucket).toISOString(),
					relayId: Number(row.relay_id),
					relayName: row.relay_name,
					p50Ms: percentileValue(row.p50),
					p95Ms: percentileValue(row.p95),
					samples: Number(row.samples),
					users: Number(row.users),
				}),
			),
		};
	}),
});
