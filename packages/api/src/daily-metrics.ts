/**
 * Nightly `daily_metrics` rollup: one row per (UTC day, metric, segment), so
 * dashboards can read finished days without rescanning sessions and a day
 * keeps its numbers after the users behind it are deleted.
 *
 * Every value reuses the `routers/admin/metrics-sql.ts` building blocks, so a
 * rolled-up day counts the same people and sessions as the live
 * `admin.metrics.series` query (see docs/admin-kpis.md).
 */
import { db } from "@VISP/db";
import { type SQL, sql } from "drizzle-orm";
import { tryAdvisoryLock } from "./advisory-lock";
import {
	eligibleUserIdsSql,
	eligibleUserWhere,
	floorToBucket,
	instant,
	liveHoursOf,
	liveSessionsSql,
	signupProviderOf,
	utcTimestamp,
} from "./routers/admin/metrics-sql";
import { METRICS_DATA_START } from "./routers/admin/metrics-window";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The job runs at this UTC hour, after most late-night sessions closed. */
export const DAILY_METRICS_HOUR_UTC = 3;
/**
 * Days before yesterday the job rolls up again: a session that goes live
 * before midnight and closes later is measured at day end at first, and
 * gets its real `ended_at` on a re-roll.
 */
export const DAILY_METRICS_REROLL_DAYS = 2;

export const DAILY_METRICS = [
	/** Eligible users by `created_at`; also one row per signup provider. */
	"signups",
	/** Distinct streamers with a `live_session` whose `first_live_at` is that day. */
	"live_streamers",
	/** Live hours of sessions that went live that day (never split at midnight). */
	"streaming_hours",
	/** `live_session` rows that went live that day. */
	"live_sessions",
	/** Publisher connections (`started_at`) that day, live or not. */
	"sessions_started",
	/** Distinct streamers live in the 7 days ending that day (WAS, daily). */
	"wau_trailing_7d",
] as const;
export type DailyMetric = (typeof DAILY_METRICS)[number];

/** Metrics that need `first_live_at`, so they have no rows before the data start. */
export const LIVE_DAILY_METRICS: readonly DailyMetric[] = [
	"live_streamers",
	"streaming_hours",
	"live_sessions",
	"sessions_started",
	"wau_trailing_7d",
];

export type DailyMetricRow = {
	metric: DailyMetric;
	segment: string;
	value: number;
};

/** `YYYY-MM-DD` of the UTC day containing `value`. */
export function utcDay(value: Date): string {
	return floorToBucket(value, "day").toISOString().slice(0, 10);
}

function metricRow(metric: DailyMetric, segment: SQL, value: SQL): SQL {
	return sql`select ${metric}::text as metric, ${segment}::text as segment,
		(${value})::float8 as value`;
}

/**
 * Computes every daily metric for the UTC day containing `day` and upserts
 * them, returning the rows written. Re-running a day overwrites its rows, and
 * a segment that no longer occurs (a provider whose only signup was deleted)
 * is removed, so a re-run always leaves exactly what one run would.
 *
 * Open sessions are measured at the end of the day (`liveSessionsSql`'s
 * `now`), so a snapshot doesn't depend on when the job happened to run.
 * Days before `METRICS_DATA_START` get signups only: the live-based metrics
 * have no data there, and a zero would read as "nobody streamed". The
 * trailing 7-day window is clamped to the data start like the live series.
 */
export async function rollupDailyMetrics({
	day,
}: {
	day: Date | string;
}): Promise<DailyMetricRow[]> {
	const dayStart = floorToBucket(new Date(day), "day");
	if (Number.isNaN(dayStart.getTime())) throw new Error("invalid day");
	const dayEnd = new Date(dayStart.getTime() + DAY_MS);
	const dayValue = sql`${utcDay(dayStart)}::date`;

	const signups = sql`select ${signupProviderOf("u")} as provider
		from "user" u
		where ${eligibleUserWhere("u")}
			and u.created_at >= ${utcTimestamp(dayStart)}
			and u.created_at < ${utcTimestamp(dayEnd)}`;
	const ctes: SQL[] = [sql`signup as (${signups})`];
	const rows: SQL[] = [
		metricRow("signups", sql`'all'`, sql`(select count(*) from signup)`),
		sql`select 'signups'::text, provider::text, count(*)::float8
			from signup group by provider`,
	];

	if (dayStart >= METRICS_DATA_START) {
		const wauFrom = new Date(
			Math.max(dayStart.getTime() - 6 * DAY_MS, METRICS_DATA_START.getTime()),
		);
		ctes.push(
			sql`ls as (${liveSessionsSql({ from: dayStart, to: dayEnd, now: dayEnd })})`,
			sql`wau_ls as (${liveSessionsSql({ from: wauFrom, to: dayEnd, now: dayEnd })})`,
		);
		rows.push(
			metricRow(
				"live_streamers",
				sql`'all'`,
				sql`(select count(distinct ls.user_id) from ls)`,
			),
			metricRow(
				"streaming_hours",
				sql`'all'`,
				sql`(select coalesce(sum(${liveHoursOf("ls")}), 0) from ls)`,
			),
			metricRow("live_sessions", sql`'all'`, sql`(select count(*) from ls)`),
			metricRow(
				"sessions_started",
				sql`'all'`,
				sql`(select count(*)
					from relay_stream_session s
					join "path" p on p.id = s.path_id
					where s.started_at >= ${instant(dayStart)}
						and s.started_at < ${instant(dayEnd)}
						and p.user_id in (${eligibleUserIdsSql()}))`,
			),
			metricRow(
				"wau_trailing_7d",
				sql`'all'`,
				sql`(select count(distinct wau_ls.user_id) from wau_ls)`,
			),
		);
	}

	const known = sql.join(
		DAILY_METRICS.map((metric) => sql`${metric}`),
		sql`, `,
	);
	// One statement, so a crash can't leave a day half-rewritten. The delete
	// and the upsert touch disjoint rows (stale vs computed), which is what
	// makes combining them in one snapshot safe.
	const { rows: written } = await db.execute<{
		metric: DailyMetric;
		segment: string;
		value: number | string;
	}>(sql`
		with ${sql.join(ctes, sql`, `)},
		computed (metric, segment, value) as (
			${sql.join(rows, sql` union all `)}
		), removed as (
			delete from daily_metrics d
			where d.day = ${dayValue}
				and d.metric in (${known})
				and not exists (
					select 1 from computed c
					where c.metric = d.metric and c.segment = d.segment
				)
		), upserted as (
			insert into daily_metrics (day, metric, segment, value, computed_at)
			select ${dayValue}, metric, segment, value, now()
			from computed
			on conflict (day, metric, segment) do update set
				value = excluded.value,
				computed_at = excluded.computed_at
			returning metric, segment, value
		)
		select metric, segment, value from upserted order by metric, segment
	`);
	return written.map((row) => ({
		metric: row.metric,
		segment: row.segment,
		value: Number(row.value),
	}));
}

export type DailyMetricsJobResult = {
	/** First and last day rolled up (`YYYY-MM-DD`), or null when none were. */
	from: string | null;
	to: string | null;
	days: number;
	/** True when the table was empty and history was backfilled. */
	backfill: boolean;
};

/**
 * First day a backfill covers: the earliest eligible signup (signups have
 * full history), or the data start when that is earlier or there are none.
 */
async function backfillStart(): Promise<Date> {
	const { rows } = await db.execute<{ first: Date | string | null }>(sql`
		select (min(u.created_at) at time zone 'UTC') as first
		from "user" u
		where ${eligibleUserWhere("u")}
	`);
	const first = rows[0]?.first;
	if (first == null) return METRICS_DATA_START;
	const firstDay = floorToBucket(new Date(first), "day");
	return firstDay < METRICS_DATA_START ? firstDay : METRICS_DATA_START;
}

/**
 * The nightly job: rolls up yesterday and re-rolls the
 * `DAILY_METRICS_REROLL_DAYS` before it (sessions that closed after
 * midnight). It also fills any gap since the last stored day, so a server
 * that was down for a few nights catches up, and on the first run (empty
 * table) it backfills from the first signup.
 *
 * Returns null when another server instance holds the lock: every app host
 * runs the same timer, and one roller per night is enough.
 */
export async function runDailyMetricsJob(
	now: Date = new Date(),
): Promise<DailyMetricsJobResult | null> {
	const lock = await tryAdvisoryLock("daily-metrics");
	if (!lock) return null;
	try {
		const yesterday = new Date(floorToBucket(now, "day").getTime() - DAY_MS);
		const { rows } = await db.execute<{ last_day: string | null }>(
			sql`select max(day)::text as last_day from daily_metrics`,
		);
		const lastDay = rows[0]?.last_day ?? null;
		let from: Date;
		if (lastDay == null) {
			from = await backfillStart();
		} else {
			const reroll = yesterday.getTime() - DAILY_METRICS_REROLL_DAYS * DAY_MS;
			const gap = new Date(`${lastDay}T00:00:00Z`).getTime() + DAY_MS;
			from = new Date(Math.min(reroll, gap));
		}
		let days = 0;
		for (let day = from; day <= yesterday; ) {
			await rollupDailyMetrics({ day });
			days += 1;
			day = new Date(day.getTime() + DAY_MS);
		}
		return {
			from: days > 0 ? utcDay(from) : null,
			to: days > 0 ? utcDay(yesterday) : null,
			days,
			backfill: lastDay == null,
		};
	} finally {
		await lock.release();
	}
}

/** Whether yesterday's rollup is missing, so a restarted server catches up. */
export async function isDailyMetricsDue(now: Date = new Date()) {
	const yesterday = utcDay(
		new Date(floorToBucket(now, "day").getTime() - DAY_MS),
	);
	const { rows } = await db.execute<{ present: boolean }>(sql`
		select exists (
			select 1 from daily_metrics where day = ${yesterday}::date
		) as present
	`);
	return !rows[0]?.present;
}
