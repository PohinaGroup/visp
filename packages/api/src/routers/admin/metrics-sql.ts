/**
 * SQL building blocks shared by the admin metrics routes (series, funnel,
 * retention, KPI tiles, daily rollup). Each one is a literal transcription of
 * a definition in docs/admin-kpis.md, so every dashboard counts the same
 * people and the same sessions; change the doc first, then these.
 *
 * Time is always UTC. Instants go to Postgres as ISO strings cast to
 * `timestamptz` so the server's session time zone never shifts a bucket.
 */
import { adminUserIds } from "@VISP/auth";
import { type SQL, sql } from "drizzle-orm";

export type MetricInterval = "day" | "week";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Same threshold as the admin `isLive` check: an event within 60 s. */
const LIVE_AFTER_SECONDS = 60;

/** Bucket width in milliseconds; ISO weeks are always exactly 7 UTC days. */
export function bucketWidthMs(interval: MetricInterval) {
	return interval === "day" ? DAY_MS : 7 * DAY_MS;
}

/**
 * `width` as a fixed number of hours. Hours, not days, because adding
 * `interval '1 day'` to a timestamptz follows the session time zone's DST
 * rules, while hours are always exact.
 */
export function hoursInterval(hours: number): SQL {
	if (!Number.isInteger(hours)) throw new Error("hours must be an integer");
	return sql.raw(`interval '${hours} hours'`);
}

/** Start (UTC) of the day or ISO week (Monday 00:00) containing `value`. */
export function floorToBucket(value: Date, interval: MetricInterval): Date {
	const day = Date.UTC(
		value.getUTCFullYear(),
		value.getUTCMonth(),
		value.getUTCDate(),
	);
	if (interval === "day") return new Date(day);
	const daysSinceMonday = (value.getUTCDay() + 6) % 7;
	return new Date(day - daysSinceMonday * DAY_MS);
}

/** A JS instant as a `timestamptz` parameter. */
export function instant(value: Date): SQL {
	return sql`${value.toISOString()}::timestamptz`;
}

/**
 * A JS instant as a UTC `timestamp` (without time zone) parameter, for
 * comparing against `user.created_at` / `account.created_at`, which hold UTC
 * without a zone. Comparing the bare column (rather than converting it) keeps
 * `user_created_at_idx` usable.
 */
export function utcTimestamp(value: Date): SQL {
	return sql`(${value.toISOString()}::timestamptz at time zone 'UTC')`;
}

/** A `timestamp` column holding UTC, read as the `timestamptz` it means. */
export function fromUtcTimestamp(column: SQL): SQL {
	return sql`(${column} at time zone 'UTC')`;
}

/**
 * UTC bucket of a `timestamptz` expression: `date_trunc('day' | 'week', ts,
 * 'UTC')`, where `'week'` is the ISO week starting Monday. The unit is inlined
 * (not a bind parameter) so the same expression can be grouped by.
 */
export function bucketOf(interval: MetricInterval, ts: SQL): SQL {
	return sql`date_trunc(${sql.raw(`'${interval}'`)}, ${ts}, 'UTC')`;
}

/**
 * Every bucket start in `[floorToBucket(from), to)` as a `bucket timestamptz`
 * row, so a left join onto it reports empty buckets as 0 instead of leaving
 * gaps. The series runs over UTC wall-clock timestamps, which have no DST.
 */
export function bucketSeriesSql(
	interval: MetricInterval,
	from: Date,
	to: Date,
): SQL {
	const step = sql.raw(
		interval === "day" ? "interval '1 day'" : "interval '7 days'",
	);
	return sql`select (series.bucket at time zone 'UTC') as bucket
		from generate_series(
			${utcTimestamp(floorToBucket(from, interval))},
			${utcTimestamp(to)},
			${step}
		) as series(bucket)
		where series.bucket < ${utcTimestamp(to)}`;
}

/**
 * `eligible_user` as a condition on a `"user"` row aliased `alias`: not an
 * admin by role (roles are a comma-separated list, as `isAdminUser` reads
 * them), not in `ADMIN_USER_IDS` (break-glass and test accounts), and not
 * banned. Bans are excluded from every week, past ones included.
 */
export function eligibleUserWhere(alias: string): SQL {
	const u = sql.identifier(alias);
	const conditions = [
		sql`not ('admin' = any(string_to_array(${u}.role, ',')))`,
		sql`${u}.banned = false`,
	];
	if (adminUserIds.length > 0) {
		conditions.push(
			sql`${u}.id not in (${sql.join(
				adminUserIds.map((id) => sql`${id}`),
				sql`, `,
			)})`,
		);
	}
	return sql`(${sql.join(conditions, sql` and `)})`;
}

/** `select id from eligible_user`, for `user_id in (...)` filters. */
export function eligibleUserIdsSql(): SQL {
	return sql`select eligible_user.id from "user" eligible_user
		where ${eligibleUserWhere("eligible_user")}`;
}

/**
 * A publisher connection shorter than this is a reconnect blip, not a stream
 * (docs/admin-kpis.md, "Stream session"). Half of all sessions are under a
 * minute because SRT reconnects open a new session each time.
 */
export const MIN_STREAM_SECONDS = 60;

export type SessionsOptions = {
	/** Only sessions with `started_at >= from` (inclusive). */
	from?: Date;
	/** Only sessions with `started_at < to` (exclusive). */
	to?: Date;
	/**
	 * The instant open, still-publishing sessions run to. Defaults to `now()`;
	 * a rollup pins it so a snapshot is reproducible.
	 */
	now?: Date;
};

/**
 * Every publisher session of an eligible user, with `effective_end`:
 * - closed: `ended_at`;
 * - open and still publishing (event within 60 s): `now`;
 * - open and stale (missed hook, relay crash): the last path event, never
 *   before `started_at`, so it does not grow forever.
 *
 * Columns: `id, path_id, user_id, relay_id, started_at, first_live_at,
 * ended_at, effective_end`. The `from`/`to` bounds are on `started_at`.
 * Most callers want `streamSessionsSql`, which drops the blips.
 */
export function sessionsSql(options: SessionsOptions = {}): SQL {
	const now = options.now ? instant(options.now) : sql`now()`;
	const bounds: SQL[] = [];
	if (options.from) {
		bounds.push(sql`and s.started_at >= ${instant(options.from)}`);
	}
	if (options.to) {
		bounds.push(sql`and s.started_at < ${instant(options.to)}`);
	}
	return sql`select s.id, s.path_id, p.user_id, p.relay_id, s.started_at,
			s.first_live_at, s.ended_at,
			coalesce(
				s.ended_at,
				case
					when ps.publishing
						and ps.last_event_at >= ${now} - ${sql.raw(`interval '${LIVE_AFTER_SECONDS} seconds'`)}
					then ${now}
					else greatest(ps.last_event_at, s.started_at)
				end
			) as effective_end
		from relay_stream_session s
		join "path" p on p.id = s.path_id
		left join path_state ps on ps.path_id = p.id
		where p.user_id in (${eligibleUserIdsSql()})
			${sql.join(bounds, sql` `)}`;
}

/** `effective_end - started_at >= MIN_STREAM_SECONDS` on a `sessionsSql` row. */
export function isStreamSql(alias: string): SQL {
	const s = sql.identifier(alias);
	return sql`${s}.effective_end - ${s}.started_at >= ${sql.raw(`interval '${MIN_STREAM_SECONDS} seconds'`)}`;
}

/**
 * `stream_session`: the `sessionsSql` rows that lasted at least
 * `MIN_STREAM_SECONDS` (docs/admin-kpis.md). Every KPI that counts streamers,
 * sessions or hours reads from this. Use it as a subquery or CTE body.
 */
export function streamSessionsSql(options: SessionsOptions = {}): SQL {
	return sql`select * from (${sessionsSql(options)}) stream_session
		where ${isStreamSql("stream_session")}`;
}

/** Hours of a `stream_session` row aliased `alias`, never negative. */
export function streamHoursOf(alias: string): SQL {
	const s = sql.identifier(alias);
	return sql`greatest(extract(epoch from ${s}.effective_end - ${s}.started_at), 0) / 3600`;
}

/**
 * `first_stream`: each eligible user's earliest stream session
 * (`user_id, first_streamed_at`), the F of the signup-to-first-stream and
 * retention KPIs. Left-join it onto `"user"`; a user without a row has not
 * streamed. ponytail: scans every session; fine at tens of thousands of rows,
 * index `started_at` or roll it up if it ever shows in a query plan.
 */
export function firstStreamSql(): SQL {
	return sql`select ss.user_id, min(ss.started_at) as first_streamed_at
		from (${streamSessionsSql()}) ss
		group by ss.user_id`;
}

/**
 * Signup provider of a `"user"` row aliased `alias`: the `provider_id` of the
 * user's earliest `account` row (later linked accounts don't count), or
 * `unknown` when there is none.
 */
export function signupProviderOf(alias: string): SQL {
	const u = sql.identifier(alias);
	return sql`coalesce((
		select signup_account.provider_id
		from account signup_account
		where signup_account.user_id = ${u}.id
		order by signup_account.created_at, signup_account.id
		limit 1
	), 'unknown')`;
}
