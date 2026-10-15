/**
 * Admin growth routes: the activation funnel (KPIs 5 and 7), time to first
 * stream (KPI 6) and the first-stream retention grid (KPI 8). Every count
 * follows docs/admin-kpis.md: eligible users only, UTC ISO weeks, and F (a
 * user's first stream) is `first_stream.first_streamed_at`, the start of
 * their earliest session of at least `MIN_STREAM_SECONDS`. Stream-based
 * cohorts only contain users who signed up on or after `METRICS_DATA_START`.
 * The API keeps its `first_live` / `firstLive` names so clients need no change.
 */
import { db } from "@VISP/db";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../../index";
import { MAX_SERIES_RANGE_DAYS } from "./metrics";
import {
	bucketOf,
	bucketSeriesSql,
	eligibleUserWhere,
	firstStreamSql,
	floorToBucket,
	fromUtcTimestamp,
	hoursInterval,
	instant,
	signupProviderOf,
	streamSessionsSql,
	utcTimestamp,
} from "./metrics-sql";
import { METRICS_DATA_START } from "./metrics-window";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** KPI 5: first live counts only within 7 days of signup. */
const FIRST_LIVE_WINDOW = hoursInterval(7 * 24);
/** KPI 7: a return is a live in `[F + 7 days, F + 14 days)`. */
const RETURN_FROM = hoursInterval(7 * 24);
const RETURN_TO = hoursInterval(14 * 24);

/** Shown for onboarding answers a user skipped (null on `app_user`). */
export const NOT_SELECTED = "not_selected";

export const FUNNEL_SEGMENTS = [
	"none",
	"provider",
	"use_case",
	"publisher",
	"destination",
] as const;
export type FunnelSegment = (typeof FUNNEL_SEGMENTS)[number];

export const FUNNEL_STAGES = [
	"signup",
	"device_created",
	"first_live",
	"week2_return",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number] | "first_live_any";

/**
 * One funnel stage. A stage tests a base population (`cohortCount`); a user
 * whose window for the stage has not closed yet can still reach it, so only
 * users with a closed window (`observedCount`) are judged, and `count` is how
 * many of those reached the stage. The conversion rate is
 * `count / observedCount`, never inflated by half-observed users; the UI shows
 * `cohortCount - observedCount` as "maturing".
 */
export type FunnelStageCount = {
	stage: FunnelStage;
	count: number;
	cohortCount: number;
	observedCount: number;
};

export type FunnelSegmentResult = {
	/** Segment value; `all` when not segmented. */
	segment: string;
	/** Chained: each stage's `cohortCount` is the previous stage's `count`, except `first_live` (see the route). */
	stages: FunnelStageCount[];
	/** Went live at any time so far, no 7-day window (outside the chain). */
	firstLiveAny: FunnelStageCount;
};

const rangeInput = z
	.object({
		from: z.iso.datetime({ offset: true }),
		to: z.iso.datetime({ offset: true }),
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

export const funnelInput = z.intersection(
	rangeInput,
	z.object({ segment: z.enum(FUNNEL_SEGMENTS).default("none") }),
);

export const retentionInput = z.object({
	weeks: z.number().int().min(1).max(26).default(12),
	to: z.iso.datetime({ offset: true }).optional(),
});

/**
 * Segment of a cohort row (`u` = user, `a` = app_user, left-joined). Signup
 * provider keeps the `unknown` label `admin.metrics.series` uses for users
 * with no `account` row; skipped onboarding answers are `not_selected`.
 */
function segmentOf(segment: FunnelSegment): SQL {
	const answer = (column: string) =>
		sql`coalesce(a.${sql.identifier(column)}::text, ${NOT_SELECTED})`;
	switch (segment) {
		case "none":
			return sql`'all'`;
		case "provider":
			return signupProviderOf("u");
		case "use_case":
			return answer("setup_use_case");
		case "publisher":
			return answer("streaming_software");
		case "destination":
			return answer("stream_destination");
	}
}

type FunnelRow = {
	segment: string;
	signups: unknown;
	devices: unknown;
	live_cohort: unknown;
	first_live_observed: unknown;
	first_live: unknown;
	first_live_any: unknown;
	return_observed: unknown;
	returned: unknown;
};

function funnelSql(from: Date, to: Date, segment: FunnelSegment, now: Date) {
	const sessions = streamSessionsSql({ from: METRICS_DATA_START, now });
	const nowTs = instant(now);
	return sql`with cohort as (
			select ${segmentOf(segment)} as segment,
				${fromUtcTimestamp(sql`u.created_at`)} as signed_up_at,
				fs.first_streamed_at as f,
				exists (select 1 from "path" p where p.user_id = u.id) as has_device,
				u.id
			from "user" u
			left join app_user a on a.id = u.id
			left join (${firstStreamSql()}) fs on fs.user_id = u.id
			where ${eligibleUserWhere("u")}
				and u.created_at >= ${utcTimestamp(from)}
				and u.created_at < ${utcTimestamp(to)}
		),
		staged as (
			select c.segment, c.has_device,
				c.signed_up_at >= ${instant(METRICS_DATA_START)} as live_cohort,
				c.f is not null as live_any,
				c.signed_up_at + ${FIRST_LIVE_WINDOW} <= ${nowTs} as first_live_observed,
				c.f is not null
					and c.f < c.signed_up_at + ${FIRST_LIVE_WINDOW} as live_in_window,
				c.f + ${RETURN_TO} <= ${nowTs} as return_observed,
				exists (
					select 1 from (${sessions}) ls
					where ls.user_id = c.id
						and ls.started_at >= c.f + ${RETURN_FROM}
						and ls.started_at < c.f + ${RETURN_TO}
				) as returned
			from cohort c
		),
		chained as (
			select *, live_cohort and first_live_observed and live_in_window
				as first_live
			from staged
		)
		select segment,
			count(*) as signups,
			count(*) filter (where has_device) as devices,
			count(*) filter (where live_cohort) as live_cohort,
			count(*) filter (where live_cohort and first_live_observed)
				as first_live_observed,
			count(*) filter (where first_live) as first_live,
			count(*) filter (where live_cohort and live_any) as first_live_any,
			count(*) filter (where first_live and return_observed) as return_observed,
			count(*) filter (where first_live and return_observed and returned)
				as returned
		from chained
		group by segment
		order by count(*) desc, segment`;
}

function toSegmentResult(row: FunnelRow): FunnelSegmentResult {
	const n = (value: unknown) => Number(value ?? 0);
	const signups = n(row.signups);
	const liveCohort = n(row.live_cohort);
	const firstLive = n(row.first_live);
	return {
		segment: row.segment,
		stages: [
			{
				stage: "signup",
				count: signups,
				cohortCount: signups,
				observedCount: signups,
			},
			{
				stage: "device_created",
				count: n(row.devices),
				cohortCount: signups,
				observedCount: signups,
			},
			{
				stage: "first_live",
				count: firstLive,
				cohortCount: liveCohort,
				observedCount: n(row.first_live_observed),
			},
			{
				stage: "week2_return",
				count: n(row.returned),
				cohortCount: firstLive,
				observedCount: n(row.return_observed),
			},
		],
		firstLiveAny: {
			stage: "first_live_any",
			count: n(row.first_live_any),
			cohortCount: liveCohort,
			observedCount: liveCohort,
		},
	};
}

const EMPTY_ROW: FunnelRow = {
	segment: "all",
	signups: 0,
	devices: 0,
	live_cohort: 0,
	first_live_observed: 0,
	first_live: 0,
	first_live_any: 0,
	return_observed: 0,
	returned: 0,
};

type TimeToFirstLiveRow = {
	bucket: Date | string;
	signups: unknown;
	live: unknown;
	median_hours: unknown;
	p75_hours: unknown;
};

function timeToFirstLiveSql(from: Date, to: Date) {
	const series = bucketSeriesSql("week", from, to);
	const hours = sql`extract(epoch from fs.first_streamed_at - ${fromUtcTimestamp(sql`u.created_at`)}) / 3600`;
	return sql`select series.bucket,
			coalesce(agg.signups, 0) as signups,
			coalesce(agg.live, 0) as live,
			agg.median_hours, agg.p75_hours
		from (${series}) series
		left join (
			select ${bucketOf("week", fromUtcTimestamp(sql`u.created_at`))} as bucket,
				count(*) as signups,
				count(fs.first_streamed_at) as live,
				percentile_cont(0.5) within group (order by ${hours}) as median_hours,
				percentile_cont(0.75) within group (order by ${hours}) as p75_hours
			from "user" u
			left join (${firstStreamSql()}) fs on fs.user_id = u.id
			where ${eligibleUserWhere("u")}
				and u.created_at >= ${utcTimestamp(floorToBucket(from, "week"))}
				and u.created_at < ${utcTimestamp(to)}
			group by 1
		) agg on agg.bucket = series.bucket
		order by series.bucket`;
}

type CohortSizeRow = { cohort: Date | string; size: unknown };
type ActivityRow = {
	cohort: Date | string;
	week: Date | string;
	users: unknown;
};

/**
 * First-stream cohort members: eligible users who signed up from the data
 * start and whose first stream (F) started in `[firstCohort, asOf)`.
 */
function cohortMembersSql(firstCohort: Date, asOf: Date) {
	return sql`select u.id, fs.first_streamed_at as f,
			${bucketOf("week", sql`fs.first_streamed_at`)} as cohort
		from "user" u
		join (${firstStreamSql()}) fs on fs.user_id = u.id
		where ${eligibleUserWhere("u")}
			and u.created_at >= ${utcTimestamp(METRICS_DATA_START)}
			and fs.first_streamed_at >= ${instant(firstCohort)}
			and fs.first_streamed_at < ${instant(asOf)}`;
}

/**
 * Distinct members live per (cohort, ISO week). F itself counts as live in
 * the cohort week, so week 0 is always the whole cohort even when F was
 * reported without an open session (see KPI 7).
 */
function retentionActivitySql(firstCohort: Date, asOf: Date) {
	const sessions = streamSessionsSql({ from: firstCohort, to: asOf });
	return sql`with members as (${cohortMembersSql(firstCohort, asOf)}),
		activity as (
			select m.id, m.cohort, m.cohort as week from members m
			union
			select m.id, m.cohort, ${bucketOf("week", sql`ls.started_at`)} as week
			from members m
			join (${sessions}) ls on ls.user_id = m.id
			where ls.started_at >= m.cohort
		)
		select cohort, week, count(distinct id) as users
		from activity
		group by 1, 2`;
}

export type RetentionCell = {
	/** Weeks after the cohort week (0 = the cohort week itself). */
	offset: number;
	/** Members live that week; null until the week has ended. */
	count: number | null;
	/** `count / size`; null for future weeks and empty cohorts. */
	value: number | null;
};

export type RetentionCohort = {
	/** Monday 00:00 UTC of the first-live week. */
	cohort: string;
	size: number;
	cells: RetentionCell[];
};

export const adminGrowthRouter = router({
	/**
	 * Activation funnel for users who signed up in `[from, to)` (UTC):
	 * - `signup`: eligible signups. All history.
	 * - `device_created`: of those, users with any `path` (revoked or not).
	 * - `first_live`: base = signups from `METRICS_DATA_START` (KPI 5 legacy
	 *   rule, so `cohortCount` is smaller than `signup` when `from` is earlier);
	 *   reached = `app_user.first_live_at < signup + 7 days`; observed once the
	 *   user's signup is 7 days old.
	 * - `week2_return`: base = users who reached `first_live`; reached = a
	 *   `live_session` with `first_live_at` in `[F + 7 days, F + 14 days)`
	 *   (KPI 7); observed once `F + 14 days <= now`.
	 * - `firstLiveAny`: same base as `first_live`, live at any time so far.
	 *
	 * Observation is per user rather than per signup week (the doc's tile rule)
	 * because the range need not be week-aligned. `segment` splits by signup
	 * provider or an onboarding answer (`not_selected` when skipped); segments
	 * are ordered by signups, largest first.
	 */
	funnel: adminProcedure.input(funnelInput).query(async ({ input }) => {
		const from = new Date(input.from);
		const to = new Date(input.to);
		const now = new Date();
		const { rows } = await db.execute<FunnelRow>(
			funnelSql(from, to, input.segment, now),
		);
		const liveFrom = from < METRICS_DATA_START ? METRICS_DATA_START : from;
		const segmentRows =
			rows.length === 0 && input.segment === "none" ? [EMPTY_ROW] : rows;
		return {
			from: from.toISOString(),
			to: to.toISOString(),
			segment: input.segment,
			dataStart: METRICS_DATA_START.toISOString(),
			/** Signups from here on form the live stages' base; null if none can. */
			liveFrom: liveFrom < to ? liveFrom.toISOString() : null,
			segments: segmentRows.map(toSegmentResult),
		};
	}),

	/**
	 * Hours from signup to first live (KPI 6) per ISO signup week in
	 * `[from, to)`, starting at the week containing `from` and clamped to
	 * `METRICS_DATA_START`. `count` is how many of the week's `signups` have
	 * gone live; median and p75 (`percentile_cont`) are over those users only,
	 * so they are right-censored (null when nobody has gone live) and should be
	 * read next to the funnel's 7-day rate.
	 */
	timeToFirstLive: adminProcedure.input(rangeInput).query(async ({ input }) => {
		const to = new Date(input.to);
		let from = new Date(input.from);
		if (from < METRICS_DATA_START) from = METRICS_DATA_START;
		const result = { dataStart: METRICS_DATA_START.toISOString() };
		if (from >= to) return { ...result, cohorts: [] };
		const { rows } = await db.execute<TimeToFirstLiveRow>(
			timeToFirstLiveSql(from, to),
		);
		const hours = (value: unknown) => (value == null ? null : Number(value));
		return {
			...result,
			cohorts: rows.map((row) => ({
				cohort: new Date(row.bucket).toISOString(),
				signups: Number(row.signups),
				count: Number(row.live),
				medianHours: hours(row.median_hours),
				p75Hours: hours(row.p75_hours),
			})),
		};
	}),

	/**
	 * First-live retention grid (KPI 8): the last `weeks` ISO weeks up to the
	 * week containing `to` (default and maximum: now), never before
	 * `METRICS_DATA_START`. A cohort is the users whose `app_user.first_live_at`
	 * falls in that week, limited to signups from the data start. Cell `k` is
	 * the share of the cohort with a `live_session` in cohort week + k. Cells
	 * whose week has not ended by `to` are null, so the grid is a triangle and
	 * the newest cohort may have no cells yet. Offsets run `0..weeks-1`.
	 */
	retention: adminProcedure.input(retentionInput).query(async ({ input }) => {
		const now = new Date();
		const requested = input.to ? new Date(input.to) : now;
		const asOf = requested < now ? requested : now;
		const result = {
			weeks: input.weeks,
			asOf: asOf.toISOString(),
			dataStart: METRICS_DATA_START.toISOString(),
		};
		// `to` is exclusive: a Monday 00:00 ends the previous week.
		const lastCohort = floorToBucket(new Date(asOf.getTime() - 1), "week");
		const firstCohort = new Date(
			Math.max(
				lastCohort.getTime() - (input.weeks - 1) * WEEK_MS,
				METRICS_DATA_START.getTime(),
			),
		);
		if (lastCohort < firstCohort) {
			return { ...result, cohorts: [] as RetentionCohort[] };
		}

		const [sizes, activity] = await Promise.all([
			db.execute<CohortSizeRow>(
				sql`select members.cohort, count(*) as size
					from (${cohortMembersSql(firstCohort, asOf)}) members
					group by 1`,
			),
			db.execute<ActivityRow>(retentionActivitySql(firstCohort, asOf)),
		]);
		const sizeOf = new Map(
			sizes.rows.map((row) => [
				new Date(row.cohort).getTime(),
				Number(row.size),
			]),
		);
		const activeOf = new Map(
			activity.rows.map((row) => [
				`${new Date(row.cohort).getTime()}:${new Date(row.week).getTime()}`,
				Number(row.users),
			]),
		);

		const cohorts: RetentionCohort[] = [];
		for (
			let start = firstCohort.getTime();
			start <= lastCohort.getTime();
			start += WEEK_MS
		) {
			const size = sizeOf.get(start) ?? 0;
			const cells: RetentionCell[] = [];
			for (let offset = 0; offset < input.weeks; offset++) {
				const week = start + offset * WEEK_MS;
				if (week + WEEK_MS > asOf.getTime()) {
					cells.push({ offset, count: null, value: null });
					continue;
				}
				const count = activeOf.get(`${start}:${week}`) ?? 0;
				cells.push({ offset, count, value: size > 0 ? count / size : null });
			}
			cohorts.push({ cohort: new Date(start).toISOString(), size, cells });
		}
		return { ...result, cohorts };
	}),
});
