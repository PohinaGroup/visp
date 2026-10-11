import { db } from "@VISP/db";
import { TRPCError } from "@trpc/server";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../../index";
import { kpisProcedure } from "./metrics-kpis";
import {
	bucketOf,
	bucketSeriesSql,
	eligibleUserWhere,
	floorToBucket,
	fromUtcTimestamp,
	hoursInterval,
	liveHoursOf,
	liveSessionsSql,
	type MetricInterval,
	signupProviderOf,
	utcTimestamp,
} from "./metrics-sql";
import { METRICS_DATA_START } from "./metrics-window";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Bounds the generated series (≤ 400 daily buckets) and the session scan. */
export const MAX_SERIES_RANGE_DAYS = 400;

export const SERIES_METRICS = [
	"weekly_active_streamers",
	"streaming_hours",
	"signups",
	"sessions_per_streamer",
] as const;
export type SeriesMetric = (typeof SERIES_METRICS)[number];

/** What a value means, so the UI can pick a formatter without a metric map. */
export type SeriesUnit = "count" | "hours" | "ratio";

const UNITS: Record<SeriesMetric, SeriesUnit> = {
	weekly_active_streamers: "count",
	streaming_hours: "hours",
	signups: "count",
	sessions_per_streamer: "ratio",
};

/** Metrics built from `live_session`, which has no data before the window. */
const LIVE_METRICS = new Set<SeriesMetric>([
	"weekly_active_streamers",
	"streaming_hours",
	"sessions_per_streamer",
]);

export const seriesInput = z
	.object({
		metric: z.enum(SERIES_METRICS),
		interval: z.enum(["day", "week"]),
		from: z.iso.datetime({ offset: true }),
		to: z.iso.datetime({ offset: true }),
		segment: z.enum(["none", "provider"]).default("none"),
	})
	.refine((input) => Date.parse(input.from) < Date.parse(input.to), {
		message: "from must be before to",
		path: ["from"],
	})
	.refine(
		(input) =>
			Date.parse(input.to) - Date.parse(input.from) <=
			MAX_SERIES_RANGE_DAYS * DAY_MS,
		{
			message: `Range must be at most ${MAX_SERIES_RANGE_DAYS} days`,
			path: ["to"],
		},
	);

export type SeriesBucket = { bucket: string; segment?: string; value: number };

type Row = { bucket: Date | string; segment?: string | null; value: unknown };

function toBuckets(rows: Row[]): SeriesBucket[] {
	return rows.map((row) => ({
		bucket: new Date(row.bucket).toISOString(),
		...(row.segment == null ? {} : { segment: row.segment }),
		value: Number(row.value ?? 0),
	}));
}

/**
 * Distinct live streamers per bucket. Daily points are a trailing 7-day
 * window (the 7 days ending with that day), so the daily line reads in the
 * same units as the weekly headline instead of as a much smaller daily-active
 * count; weekly points are the ISO week itself. Windows never reach before
 * `METRICS_DATA_START`, so the first six daily points undercount.
 */
function activeStreamersSql(interval: MetricInterval, from: Date, to: Date) {
	const series = bucketSeriesSql(interval, from, to);
	if (interval === "week") {
		const sessions = liveSessionsSql({ from: floorToBucket(from, "week"), to });
		return sql`select series.bucket, coalesce(agg.value, 0)::float8 as value
			from (${series}) series
			left join (
				select ${bucketOf("week", sql`ls.first_live_at`)} as bucket,
					count(distinct ls.user_id) as value
				from (${sessions}) ls
				group by 1
			) agg on agg.bucket = series.bucket
			order by series.bucket`;
	}
	const scanFrom = new Date(
		Math.max(
			floorToBucket(from, "day").getTime() - 6 * DAY_MS,
			METRICS_DATA_START.getTime(),
		),
	);
	const sessions = liveSessionsSql({ from: scanFrom, to });
	return sql`with ls as (${sessions})
		select series.bucket, (
			select count(distinct ls.user_id)
			from ls
			where ls.first_live_at >= series.bucket - ${hoursInterval(6 * 24)}
				and ls.first_live_at < series.bucket + ${hoursInterval(24)}
		)::float8 as value
		from (${series}) series
		order by series.bucket`;
}

/**
 * Per-bucket aggregate over `live_session` rows (aliased `ls`), bucketed by
 * `first_live_at`, left-joined onto the series so empty buckets are 0.
 */
function liveAggregateSql(
	interval: MetricInterval,
	from: Date,
	to: Date,
	aggregate: SQL,
) {
	const series = bucketSeriesSql(interval, from, to);
	const sessions = liveSessionsSql({ from: floorToBucket(from, interval), to });
	return sql`select series.bucket, coalesce(agg.value, 0)::float8 as value
		from (${series}) series
		left join (
			select ${bucketOf(interval, sql`ls.first_live_at`)} as bucket,
				${aggregate} as value
			from (${sessions}) ls
			group by 1
		) agg on agg.bucket = series.bucket
		order by series.bucket`;
}

/**
 * Eligible signups per bucket of `created_at` (UTC). Split by provider, every
 * provider seen in the range gets a row for every bucket (0 when empty) so a
 * stacked chart has no holes; a range with no signups has no rows at all.
 */
function signupsSql(
	interval: MetricInterval,
	from: Date,
	to: Date,
	byProvider: boolean,
) {
	const series = bucketSeriesSql(interval, from, to);
	const signups = sql`select
			${bucketOf(interval, fromUtcTimestamp(sql`u.created_at`))} as bucket,
			${byProvider ? signupProviderOf("u") : sql`null::text`} as segment
		from "user" u
		where ${eligibleUserWhere("u")}
			and u.created_at >= ${utcTimestamp(floorToBucket(from, interval))}
			and u.created_at < ${utcTimestamp(to)}`;
	if (!byProvider) {
		return sql`select series.bucket, coalesce(agg.value, 0)::float8 as value
			from (${series}) series
			left join (
				select signups.bucket, count(*) as value
				from (${signups}) signups
				group by 1
			) agg on agg.bucket = series.bucket
			order by series.bucket`;
	}
	return sql`with signups as (${signups})
		select series.bucket, segments.segment,
			coalesce(agg.value, 0)::float8 as value
		from (${series}) series
		cross join (select distinct segment from signups) segments
		left join (
			select bucket, segment, count(*) as value
			from signups
			group by 1, 2
		) agg on agg.bucket = series.bucket and agg.segment = segments.segment
		order by series.bucket, segments.segment`;
}

export const adminMetricsRouter = router({
	/**
	 * One KPI as a gap-free UTC time series (see docs/admin-kpis.md):
	 * - `weekly_active_streamers`: distinct streamers live in the bucket's
	 *   window. `week`: the ISO week. `day`: the trailing 7 days ending that
	 *   day, so it stays comparable with the weekly headline.
	 * - `streaming_hours`: live hours (`effective_end - first_live_at`), each
	 *   session wholly in the bucket of its `first_live_at`, never split.
	 * - `signups`: eligible users by `created_at`; `segment: "provider"` splits
	 *   by the provider of the earliest `account` row (`unknown` if none).
	 * - `sessions_per_streamer`: live sessions ÷ distinct streamers within the
	 *   same bucket (a calendar day for `day`), 0 when nobody streamed.
	 *
	 * Buckets cover `[from, to)`, the first being the day or ISO week that
	 * contains `from`. Live-based metrics clamp `from` to `METRICS_DATA_START`
	 * (no `first_live_at` before it), returning no buckets when the whole range
	 * is earlier; signups have full history. `segment: "provider"` applies to
	 * signups only. The last bucket is partial when `to` falls inside it.
	 */
	series: adminProcedure.input(seriesInput).query(async ({ input }) => {
		const { metric, interval, segment } = input;
		if (segment === "provider" && metric !== "signups") {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Only signups can be segmented by provider",
			});
		}
		const to = new Date(input.to);
		let from = new Date(input.from);
		const live = LIVE_METRICS.has(metric);
		if (live && from < METRICS_DATA_START) from = METRICS_DATA_START;
		const result = {
			metric,
			interval,
			unit: UNITS[metric],
			dataStart: METRICS_DATA_START.toISOString(),
		};
		if (from >= to) return { ...result, buckets: [] as SeriesBucket[] };

		let query: SQL;
		switch (metric) {
			case "weekly_active_streamers":
				query = activeStreamersSql(interval, from, to);
				break;
			case "streaming_hours":
				query = liveAggregateSql(
					interval,
					from,
					to,
					sql`sum(${liveHoursOf("ls")})`,
				);
				break;
			case "sessions_per_streamer":
				query = liveAggregateSql(
					interval,
					from,
					to,
					sql`count(*)::float8 / nullif(count(distinct ls.user_id), 0)`,
				);
				break;
			case "signups":
				query = signupsSql(interval, from, to, segment === "provider");
				break;
		}
		const { rows } = await db.execute<Row>(query);
		return { ...result, buckets: toBuckets(rows) };
	}),
	kpis: kpisProcedure({ activeStreamersSql, liveAggregateSql, signupsSql }),
});
