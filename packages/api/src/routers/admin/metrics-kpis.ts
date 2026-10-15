/**
 * `admin.metrics.kpis`: the headline tiles (value, previous period, delta and
 * a sparkline per KPI) in two queries, however many tiles there are: one for
 * every scalar of both windows, one for every sparkline. Definitions are the
 * ones in docs/admin-kpis.md, built from the shared `metrics-sql` blocks; the
 * sparklines reuse the `admin.metrics.series` SQL builders, which `metrics.ts`
 * passes in (see `kpisProcedure`) so this file never imports it back.
 */
import { db } from "@VISP/db";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure } from "../../index";
import {
	bucketOf,
	bucketSeriesSql,
	eligibleUserWhere,
	firstStreamSql,
	fromUtcTimestamp,
	hoursInterval,
	instant,
	type MetricInterval,
	streamHoursOf,
	streamSessionsSql,
	utcTimestamp,
} from "./metrics-sql";
import { METRICS_DATA_START } from "./metrics-window";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Longest window, current or comparison. Matches the admin's custom-range cap
 * (`MAX_RANGE_DAYS` in apps/admin `date-range.ts`), so every range the header
 * control can produce is accepted; sparklines of long ranges are weekly.
 */
export const MAX_KPI_RANGE_DAYS = 732;

/** Ranges up to this many days get daily sparklines, longer ones weekly. */
export const MAX_DAILY_SPARKLINE_DAYS = 31;

/** Signups count towards the first-live rate once they are this old. */
const ACTIVATION_WINDOW_HOURS = 7 * 24;

export const KPI_KEYS = [
	"weekly_active_streamers",
	"streaming_hours",
	"signups",
	"signup_to_first_live_rate",
	"sessions_per_streamer",
] as const;
export type KpiKey = (typeof KPI_KEYS)[number];

/**
 * What a value means, for picking a formatter. `percent` values are already
 * in percent units (42.5 = 42.5%), like `deltaPct`.
 */
export type KpiUnit = "count" | "hours" | "ratio" | "percent";

export type Kpi = {
	key: KpiKey;
	label: string;
	unit: KpiUnit;
	/** Null when the range has no data for this KPI (see `kpisProcedure`). */
	value: number | null;
	/** Same KPI over the comparison window; null without one or without data. */
	previous: number | null;
	/** Relative change in percent units (12.5 = +12.5%), null when undefined. */
	deltaPct: number | null;
	/** Series values over the range, oldest first (day ≤ 31 days, else week). */
	sparkline: number[];
};

const META: Record<KpiKey, { label: string; unit: KpiUnit }> = {
	weekly_active_streamers: { label: "Active streamers", unit: "count" },
	streaming_hours: { label: "Streaming hours", unit: "hours" },
	signups: { label: "Signups", unit: "count" },
	signup_to_first_live_rate: {
		label: "Signup → first stream (7 days)",
		unit: "percent",
	},
	sessions_per_streamer: { label: "Sessions per streamer", unit: "ratio" },
};

/**
 * KPIs built from stream sessions, which exist from `METRICS_DATA_START`:
 * their windows are clamped to it, and a comparison window starting before
 * it gets no delta (docs/admin-kpis.md, "Data start"). Signups are older.
 */
const LIVE_KPIS = new Set<KpiKey>([
	"weekly_active_streamers",
	"streaming_hours",
	"signup_to_first_live_rate",
	"sessions_per_streamer",
]);

/**
 * The `admin.metrics.series` SQL builders the sparklines reuse. Injected by
 * `metrics.ts` rather than imported, because `metrics.ts` imports this file
 * to register the procedure and a runtime import cycle would leave one side
 * undefined depending on which module loads first.
 */
export type SeriesSqlBuilders = {
	activeStreamersSql: (interval: MetricInterval, from: Date, to: Date) => SQL;
	liveAggregateSql: (
		interval: MetricInterval,
		from: Date,
		to: Date,
		aggregate: SQL,
	) => SQL;
	signupsSql: (
		interval: MetricInterval,
		from: Date,
		to: Date,
		byProvider: boolean,
	) => SQL;
};

const rangeLength = (from: string, to: string) =>
	Date.parse(to) - Date.parse(from);

export const kpisInput = z
	.object({
		from: z.iso.datetime({ offset: true }),
		to: z.iso.datetime({ offset: true }),
		compareFrom: z.iso.datetime({ offset: true }).optional(),
		compareTo: z.iso.datetime({ offset: true }).optional(),
	})
	.refine((input) => rangeLength(input.from, input.to) > 0, {
		message: "from must be before to",
		path: ["from"],
	})
	.refine(
		(input) => rangeLength(input.from, input.to) <= MAX_KPI_RANGE_DAYS * DAY_MS,
		{
			message: `Range must be at most ${MAX_KPI_RANGE_DAYS} days`,
			path: ["to"],
		},
	)
	.refine(
		(input) => (input.compareFrom == null) === (input.compareTo == null),
		{
			message: "compareFrom and compareTo go together",
			path: ["compareFrom"],
		},
	)
	.refine(
		(input) =>
			input.compareFrom == null ||
			input.compareTo == null ||
			(rangeLength(input.compareFrom, input.compareTo) > 0 &&
				rangeLength(input.compareFrom, input.compareTo) <=
					MAX_KPI_RANGE_DAYS * DAY_MS),
		{
			message: `Comparison must be a non-empty range of at most ${MAX_KPI_RANGE_DAYS} days`,
			path: ["compareFrom"],
		},
	);

/** A half-open `[from, to)` window; null stands for "no window". */
type Window = { from: Date; to: Date } | null;

function window(from: Date, to: Date): Window {
	return from < to ? { from, to } : null;
}

function latest(a: Date, b: Date) {
	return a > b ? a : b;
}

function earliest(a: Date, b: Date) {
	return a < b ? a : b;
}

/** `column` in `w`, or `false` without a window, for `filter (where ...)`. */
function within(column: SQL, w: Window, bound: (value: Date) => SQL): SQL {
	if (!w) return sql`false`;
	return sql`(${column} >= ${bound(w.from)} and ${column} < ${bound(w.to)})`;
}

/** The live part of a window: never before `METRICS_DATA_START`. */
function liveWindow(w: Window): Window {
	return w && window(latest(w.from, METRICS_DATA_START), w.to);
}

/**
 * KPI 5's signup cohort for a window: eligible signups from
 * `METRICS_DATA_START` (older ones may have gone live before tracking) that
 * have had their full 7 days by `now`, i.e. it drops the last 7 days of the
 * window (or of the time up to `now` when the window reaches into the future).
 */
function cohortWindow(w: Window, now: Date): Window {
	if (!w) return null;
	const end =
		earliest(w.to, now).getTime() - ACTIVATION_WINDOW_HOURS * 3600_000;
	return window(latest(w.from, METRICS_DATA_START), new Date(end));
}

/**
 * Rows of KPI 5's cohort in `w` (created_at, converted): `converted` when the
 * user's first stream session started within 7 days of signup; a user with no
 * stream session is not converted.
 */
function cohortSql(w: Window): SQL {
	return sql`select u.created_at,
			coalesce(
				fs.first_streamed_at < ${fromUtcTimestamp(sql`u.created_at`)} + ${hoursInterval(ACTIVATION_WINDOW_HOURS)},
				false
			) as converted
		from "user" u
		left join (${firstStreamSql()}) fs on fs.user_id = u.id
		where ${eligibleUserWhere("u")}
			and ${within(sql`u.created_at`, w, utcTimestamp)}`;
}

/**
 * KPI 5 per bucket of signup time, in percent, 0 for a bucket without
 * signups. The series covers the cohort window only, so maturing buckets at
 * the end and buckets before `METRICS_DATA_START` are left out, not zero.
 */
function cohortRateSeriesSql(
	interval: MetricInterval,
	cohort: NonNullable<Window>,
) {
	const series = bucketSeriesSql(interval, cohort.from, cohort.to);
	return sql`select series.bucket, coalesce(agg.value, 0)::float8 as value
		from (${series}) series
		left join (
			select ${bucketOf(interval, fromUtcTimestamp(sql`cohort.created_at`))} as bucket,
				100.0 * count(*) filter (where cohort.converted) / count(*) as value
			from (${cohortSql(cohort)}) cohort
			group by 1
		) agg on agg.bucket = series.bucket
		order by series.bucket`;
}

type ScalarRow = Record<
	| "cur_streamers"
	| "cur_sessions"
	| "cur_hours"
	| "prev_streamers"
	| "prev_sessions"
	| "prev_hours"
	| "cur_signups"
	| "prev_signups"
	| "cur_cohort"
	| "cur_converted"
	| "prev_cohort"
	| "prev_converted",
	unknown
>;

type Windows = {
	current: NonNullable<Window>;
	previous: Window;
	liveCurrent: Window;
	livePrevious: Window;
	cohortCurrent: Window;
	cohortPrevious: Window;
};

/**
 * Every scalar of both windows in one statement: one `live_session` scan over
 * the span of the live windows (split with `filter`), one pass over eligible
 * signups, one over the two cohorts.
 */
function scalarsSql(w: Windows): SQL {
	const liveWindows = [w.liveCurrent, w.livePrevious].filter(
		(entry): entry is NonNullable<Window> => entry != null,
	);
	// No live window at all: an empty scan (from = to) keeps the shape.
	const scan =
		liveWindows.length === 0
			? { from: METRICS_DATA_START, to: METRICS_DATA_START }
			: {
					from: liveWindows.map((entry) => entry.from).reduce(earliest),
					to: liveWindows.map((entry) => entry.to).reduce(latest),
				};
	const cur = within(sql`ls.started_at`, w.liveCurrent, instant);
	const prev = within(sql`ls.started_at`, w.livePrevious, instant);
	const curSignup = within(sql`u.created_at`, w.current, utcTimestamp);
	const prevSignup = within(sql`u.created_at`, w.previous, utcTimestamp);
	const curCohort = within(sql`c.created_at`, w.cohortCurrent, utcTimestamp);
	const prevCohort = within(sql`c.created_at`, w.cohortPrevious, utcTimestamp);
	const cohortSpan: Window =
		w.cohortCurrent && w.cohortPrevious
			? {
					from: earliest(w.cohortCurrent.from, w.cohortPrevious.from),
					to: latest(w.cohortCurrent.to, w.cohortPrevious.to),
				}
			: (w.cohortCurrent ?? w.cohortPrevious);
	return sql`select live.*, signups.*, cohorts.*
		from (
			select
				count(distinct ls.user_id) filter (where ${cur}) as cur_streamers,
				count(*) filter (where ${cur}) as cur_sessions,
				coalesce(sum(${streamHoursOf("ls")}) filter (where ${cur}), 0) as cur_hours,
				count(distinct ls.user_id) filter (where ${prev}) as prev_streamers,
				count(*) filter (where ${prev}) as prev_sessions,
				coalesce(sum(${streamHoursOf("ls")}) filter (where ${prev}), 0) as prev_hours
			from (${streamSessionsSql(scan)}) ls
		) live
		cross join (
			select
				count(*) filter (where ${curSignup}) as cur_signups,
				count(*) filter (where ${prevSignup}) as prev_signups
			from "user" u
			where ${eligibleUserWhere("u")} and (${curSignup} or ${prevSignup})
		) signups
		cross join (
			select
				count(*) filter (where ${curCohort}) as cur_cohort,
				count(*) filter (where ${curCohort} and c.converted) as cur_converted,
				count(*) filter (where ${prevCohort}) as prev_cohort,
				count(*) filter (where ${prevCohort} and c.converted) as prev_converted
			from (${cohortSql(cohortSpan)}) c
		) cohorts`;
}

/** Every sparkline in one `union all`, rows tagged with their KPI key. */
function sparklinesSql(
	series: SeriesSqlBuilders,
	w: Windows,
	interval: MetricInterval,
): SQL {
	const { from, to } = w.current;
	const parts: [KpiKey, SQL][] = [
		["signups", series.signupsSql(interval, from, to, false)],
	];
	if (w.liveCurrent) {
		const live = w.liveCurrent;
		parts.push(
			[
				"weekly_active_streamers",
				series.activeStreamersSql(interval, live.from, live.to),
			],
			[
				"streaming_hours",
				series.liveAggregateSql(
					interval,
					live.from,
					live.to,
					sql`sum(${streamHoursOf("ls")})`,
				),
			],
			[
				"sessions_per_streamer",
				series.liveAggregateSql(
					interval,
					live.from,
					live.to,
					sql`count(*)::float8 / nullif(count(distinct ls.user_id), 0)`,
				),
			],
		);
	}
	if (w.cohortCurrent) {
		parts.push([
			"signup_to_first_live_rate",
			cohortRateSeriesSql(interval, w.cohortCurrent),
		]);
	}
	const selects = parts.map(
		([key, query]) =>
			sql`select ${key}::text as key, part.bucket, part.value from (${query}) part`,
	);
	return sql`select key, bucket, value
		from (${sql.join(selects, sql` union all `)}) sparklines
		order by key, bucket`;
}

const num = (value: unknown) => Number(value ?? 0);

/**
 * Relative change in percent, or null when it would mislead: no previous
 * value, a previous of 0 (division by zero), no current value, or a
 * comparison window that is not `comparable` (starts before the data start).
 */
export function deltaPct(
	value: number | null,
	previous: number | null,
	comparable: boolean,
): number | null {
	if (!comparable || value == null || previous == null || previous === 0) {
		return null;
	}
	return ((value - previous) / previous) * 100;
}

/**
 * Builds `admin.metrics.kpis` around the series SQL builders of `metrics.ts`.
 *
 * Input: `from`/`to` and optional `compareFrom`/`compareTo`, half-open ISO
 * instants (`toApiRange` in the admin; its `interval` is ignored). Output:
 * one tile per `KPI_KEYS` entry, in that order, plus `dataStart`.
 *
 * - `weekly_active_streamers` ("Active streamers"): distinct streamers live
 *   anywhere in the range. That is WAS for a 7-day range; for any other
 *   length it is "active in range" (a 28-day range counts monthly actives),
 *   so the UI should label it by the range, not as "weekly".
 * - `streaming_hours`, `sessions_per_streamer` (0 when nobody streamed):
 *   as in `admin.metrics.series`, over the whole range.
 * - `signups`: eligible users created in the range, full history.
 * - `signup_to_first_live_rate`: percent of the range's signup cohort live
 *   within 7 days of signing up. Only fully observed signups count: the
 *   last 7 days before `to` (or before now, if `to` is later) are left out,
 *   and so is anything before `METRICS_DATA_START`. `value` is null when no
 *   signup qualifies, e.g. for any range ending within 7 days of now.
 *
 * Live-based KPIs (all but signups) clamp both windows to
 * `METRICS_DATA_START`; `value`/`previous` are null when the clamped window
 * is empty (no data, not zero). `deltaPct` is null without a comparison, when
 * `previous` is 0 or null, and for live-based KPIs whenever the comparison
 * starts before `METRICS_DATA_START` (docs/admin-kpis.md: "A KPI tile whose
 * comparison period is before the cutoff shows no delta"). `sparkline` holds
 * the `admin.metrics.series` values of the range (daily up to 31 days,
 * otherwise weekly); for the rate, per signup bucket of the cohort window.
 */
export function kpisProcedure(series: SeriesSqlBuilders) {
	return adminProcedure.input(kpisInput).query(async ({ input }) => {
		const now = new Date();
		const current = { from: new Date(input.from), to: new Date(input.to) };
		const previous: Window =
			input.compareFrom && input.compareTo
				? { from: new Date(input.compareFrom), to: new Date(input.compareTo) }
				: null;
		const windows: Windows = {
			current,
			previous,
			liveCurrent: liveWindow(current),
			livePrevious: liveWindow(previous),
			cohortCurrent: cohortWindow(current, now),
			cohortPrevious: cohortWindow(previous, now),
		};
		const interval: MetricInterval =
			current.to.getTime() - current.from.getTime() <=
			MAX_DAILY_SPARKLINE_DAYS * DAY_MS
				? "day"
				: "week";

		const [scalars, sparklines] = await Promise.all([
			db.execute<ScalarRow>(scalarsSql(windows)),
			db.execute<{ key: KpiKey; bucket: unknown; value: unknown }>(
				sparklinesSql(series, windows, interval),
			),
		]);
		const row = scalars.rows[0];
		if (!row) throw new Error("KPI query returned no row");

		const live = (w: Window, value: unknown) => (w ? num(value) : null);
		const perStreamer = (w: Window, sessions: unknown, streamers: unknown) =>
			w ? (num(streamers) === 0 ? 0 : num(sessions) / num(streamers)) : null;
		const rate = (cohort: unknown, converted: unknown) =>
			num(cohort) === 0 ? null : (100 * num(converted)) / num(cohort);
		const { liveCurrent, livePrevious } = windows;
		const values: Record<KpiKey, [number | null, number | null]> = {
			weekly_active_streamers: [
				live(liveCurrent, row.cur_streamers),
				live(livePrevious, row.prev_streamers),
			],
			streaming_hours: [
				live(liveCurrent, row.cur_hours),
				live(livePrevious, row.prev_hours),
			],
			signups: [num(row.cur_signups), previous ? num(row.prev_signups) : null],
			signup_to_first_live_rate: [
				rate(row.cur_cohort, row.cur_converted),
				rate(row.prev_cohort, row.prev_converted),
			],
			sessions_per_streamer: [
				perStreamer(liveCurrent, row.cur_sessions, row.cur_streamers),
				perStreamer(livePrevious, row.prev_sessions, row.prev_streamers),
			],
		};

		const lines = new Map<KpiKey, number[]>();
		for (const entry of sparklines.rows) {
			const line = lines.get(entry.key) ?? [];
			line.push(num(entry.value));
			lines.set(entry.key, line);
		}

		const comparableLive =
			previous != null && previous.from >= METRICS_DATA_START;
		const kpis: Kpi[] = KPI_KEYS.map((key) => {
			const [value, prior] = values[key];
			return {
				key,
				...META[key],
				value,
				previous: prior,
				deltaPct: deltaPct(
					value,
					prior,
					LIVE_KPIS.has(key) ? comparableLive : previous != null,
				),
				sparkline: lines.get(key) ?? [],
			};
		});
		return { kpis, dataStart: METRICS_DATA_START.toISOString() };
	});
}
