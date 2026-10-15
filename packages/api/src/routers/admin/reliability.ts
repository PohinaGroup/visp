import { db } from "@VISP/db";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../../index";
import { MAX_SERIES_RANGE_DAYS } from "./metrics";
import {
	bucketOf,
	bucketSeriesSql,
	eligibleUserWhere,
	floorToBucket,
	instant,
	isStreamSql,
	type MetricInterval,
	MIN_STREAM_SECONDS,
	sessionsSql,
} from "./metrics-sql";
import { METRICS_DATA_START } from "./metrics-window";

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * Publisher sessions of eligible users started in `[from, to)` that can be
 * judged: an open session younger than `MIN_STREAM_SECONDS` is still
 * connecting and left out. Columns: `started_at`, `stable` (it lasted at
 * least `MIN_STREAM_SECONDS`; docs/admin-kpis.md, KPI 9).
 */
export function judgedSessionsSql(from: Date, to: Date): SQL {
	return sql`select js.started_at, ${isStreamSql("js")} as stable
		from (${sessionsSql({ from, to })}) js
		where not (
			js.ended_at is null
			and js.started_at > now() - ${sql.raw(`interval '${MIN_STREAM_SECONDS} seconds'`)}
		)`;
}

const STABILITY_AGGREGATES = sql`count(*)::int as started,
	count(*) filter (where js.stable)::int as stable`;

type StabilityRow = {
	started: number | string | null;
	stable: number | string | null;
};

export type SessionStabilityStats = {
	/** Sessions started (still-connecting ones left out). */
	started: number;
	/** Of those, sessions that lasted at least `MIN_STREAM_SECONDS`. */
	stable: number;
	/** `stable / started`, 0–1; null with no sessions. */
	stableRate: number | null;
};

const nullableNumber = (value: number | string | null | undefined) =>
	value === null || value === undefined ? null : Number(value);

/**
 * A percentile rounded to 1/1000 of its unit. `percentile_cont` interpolates
 * in float8, so 85.5 can come back as 85.49999999999999; microseconds of RTT
 * are far below what the charts show.
 */
const percentileValue = (value: number | string | null | undefined) => {
	const number = nullableNumber(value);
	return number === null ? null : Math.round(number * 1000) / 1000;
};

function toStats(row: StabilityRow | undefined): SessionStabilityStats {
	const started = Number(row?.started ?? 0);
	const stable = Number(row?.stable ?? 0);
	return {
		started,
		stable,
		stableRate: started > 0 ? stable / started : null,
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
	 * Stable-session rate (docs/admin-kpis.md, KPI 9) per UTC day or ISO
	 * week of `started_at`: of the publisher sessions started, the share that
	 * lasted at least `MIN_STREAM_SECONDS`. Open sessions younger than that
	 * are still connecting and left out. The name is historical: it used to
	 * be the Direct "reached live" rate.
	 *
	 * `from` is clamped to `METRICS_DATA_START`; a range wholly before it
	 * returns no buckets. Buckets are gap-free from the bucket containing
	 * `from` (as `admin.metrics.series`), so a mid-week `from` shows the whole
	 * first week. `totals` covers exactly `[from, to)` after clamping, so a
	 * KPI tile and its comparison period count equal-length windows.
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
					buckets: [] as ({ bucket: string } & SessionStabilityStats)[],
				};
			}
			const scanFrom = floorToBucket(from, interval);
			const [series, totals] = await Promise.all([
				db.execute<StabilityRow & { bucket: Date | string }>(sql`
					select series.bucket, agg.started, agg.stable
					from (${bucketSeriesSql(interval, from, to)}) series
					left join (
						select ${bucketOf(interval, sql`js.started_at`)} as bucket,
							${STABILITY_AGGREGATES}
						from (${judgedSessionsSql(scanFrom, to)}) js
						group by 1
					) agg on agg.bucket = series.bucket
					order by series.bucket`),
				db.execute<StabilityRow>(sql`
					select ${STABILITY_AGGREGATES}
					from (${judgedSessionsSql(from, to)}) js`),
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
