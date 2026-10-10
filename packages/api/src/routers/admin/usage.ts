import { db } from "@VISP/db";
import type {
	HostedUsageFeature,
	HostedUsageUnit,
} from "@VISP/db/schema/index";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../../index";
import { MAX_SERIES_RANGE_DAYS } from "./metrics";
import {
	bucketOf,
	bucketSeriesSql,
	eligibleUserWhere,
	hoursInterval,
	instant,
	liveHoursOf,
	liveSessionsSql,
	type MetricInterval,
} from "./metrics-sql";
import { METRICS_DATA_START } from "./metrics-window";

/**
 * Usage and cost dashboard: what VISP pays for (hosted TTS / audio isolation)
 * and what it spends relay encoder capacity on (Direct forwarders), plus which
 * features active streamers actually use.
 *
 * Two populations, on purpose:
 * - Spend and encoder minutes (`hostedSeries`, `encoderSeries`) count every
 *   account, admins and test accounts included, because those are real
 *   provider invoices and real relay load.
 * - Per-streamer views (`featureAdoption`, `topUsers`) use `eligible_user`
 *   (docs/admin-kpis.md) like every other streamer KPI, so staff testing a
 *   feature never tops the leaderboard or inflates an adoption share.
 *
 * Subtitles are not metered (the client streams audio straight to the
 * provider), so they never appear here.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_USERS_LIMIT = 20;

export const usageRangeInput = z
	.object({
		from: z.iso.datetime({ offset: true }),
		to: z.iso.datetime({ offset: true }),
		interval: z.enum(["day", "week"]),
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

type Range = { from: Date; to: Date; interval: MetricInterval };

function parseRange(input: z.infer<typeof usageRangeInput>): Range {
	return {
		from: new Date(input.from),
		to: new Date(input.to),
		interval: input.interval,
	};
}

const num = (value: unknown) => Number(value ?? 0);
const numOrNull = (value: unknown) => (value == null ? null : Number(value));
const iso = (value: Date | string) => new Date(value).toISOString();

/**
 * `unit_price.eur_per_unit` in effect for a `hosted_usage` row aliased `h`, as
 * a lateral subquery: the latest `valid_from <= occurred_at` for the same
 * feature and unit, preferring a row for the usage's own provider over the
 * NULL-provider catch-all (even an older provider row beats a newer
 * catch-all, because a provider-specific price is the more specific fact).
 * Usage recorded without a provider can only match the catch-all. No row in
 * effect yields NULL, i.e. "unpriced", never 0.
 */
export function priceInEffectSql(): SQL {
	return sql`left join lateral (
		select price_row.eur_per_unit
		from unit_price price_row
		where price_row.feature = h.feature
			and price_row.unit = h.unit
			and (price_row.provider = h.provider or price_row.provider is null)
			and price_row.valid_from <= h.occurred_at
		order by (price_row.provider is null), price_row.valid_from desc
		limit 1
	) price on true`;
}

/**
 * Buckets with the slice of `[from, to)` each one covers: the first and last
 * bucket are partial when the range does not start/end on a boundary, so
 * time spans are clipped to `win_start`/`win_end`, not the bucket edges.
 * Widths are exact hours (see `hoursInterval`), so DST never moves an edge.
 */
function bucketWindowsSql({ interval, from, to }: Range): SQL {
	const width = hoursInterval(interval === "day" ? 24 : 7 * 24);
	return sql`select series.bucket,
			greatest(series.bucket, ${instant(from)}) as win_start,
			least(series.bucket + ${width}, ${instant(to)}) as win_end
		from (${bucketSeriesSql(interval, from, to)}) series`;
}

/**
 * Forwarder sessions overlapping `[from, to)`, clipped to it, with their
 * destination and owner. Open sessions run until `now()`; sessions that only
 * exist after `now()` (a range in the future) clip to nothing and drop out.
 * Columns: `path_id, user_id, destination, span_start, span_end`.
 */
function clippedForwarderSessionsSql({ from, to }: Range): SQL {
	return sql`select clipped.* from (
			select f.path_id, p.user_id, f.destination,
				greatest(f.started_at, ${instant(from)}) as span_start,
				least(coalesce(f.ended_at, now()), ${instant(to)}) as span_end
			from forwarder_session f
			join "path" p on p.id = f.path_id
			where f.started_at < ${instant(to)}
				and (f.ended_at is null or f.ended_at > ${instant(from)})
		) clipped
		where clipped.span_end > clipped.span_start`;
}

/** Live-based views start at `METRICS_DATA_START`; see docs/admin-kpis.md. */
function liveFrom(from: Date) {
	return from < METRICS_DATA_START ? METRICS_DATA_START : from;
}

export type HostedBucket = {
	bucket: string;
	feature: HostedUsageFeature;
	unit: HostedUsageUnit;
	units: number;
	/** Units that had a price in effect; `units - pricedUnits` are unpriced. */
	pricedUnits: number;
	/** EUR of the priced units; 0 for an empty bucket, null if none priced. */
	costEur: number | null;
};

export type HostedFeatureTotal = Omit<HostedBucket, "bucket"> & {
	/** pricedUnits ÷ units; null when the feature has no usage. */
	pricedShare: number | null;
};

type HostedRow = {
	bucket: Date | string;
	feature: HostedUsageFeature;
	unit: HostedUsageUnit;
	units: unknown;
	priced_units: unknown;
	cost_eur: unknown;
	usage_rows: unknown;
	priced_rows: unknown;
};

export type EncoderBucket = {
	bucket: string;
	destination: string;
	minutes: number;
};

export type AdoptionFeature = {
	key: string;
	label: string;
	/**
	 * `range`: evidence of use inside the range. `current`: a setting or
	 * credential as it is now, because the schema keeps no history for it.
	 */
	basis: "range" | "current";
	users: number;
	/** users ÷ active streamers; null when nobody streamed. */
	share: number | null;
};

export type TopUser = {
	id: string;
	name: string;
	email: string;
	/** Priced hosted spend in EUR; null when none of their usage has a price. */
	costEur: number | null;
	usage: {
		feature: HostedUsageFeature;
		unit: HostedUsageUnit;
		units: number;
		costEur: number | null;
	}[];
	hoursStreamed: number;
	encoderMinutes: number;
};

export const adminUsageRouter = router({
	/**
	 * Hosted (billed-to-VISP) usage per bucket × feature/unit, by
	 * `occurred_at`, with cost = units × the price in effect at `occurred_at`
	 * (see `priceInEffectSql`). Every feature/unit seen in the range gets a row
	 * for every bucket so stacked charts have no holes.
	 *
	 * `pricedShare` is the share of usage rows (one row ≈ one user's usage of
	 * one feature over a one-minute flush) that found a price; units are not
	 * comparable across features, so rows are the common weight. It is null
	 * when there is no usage, and below 1 means the spend is understated.
	 */
	hostedSeries: adminProcedure
		.input(usageRangeInput)
		.query(async ({ input }) => {
			const range = parseRange(input);
			const { interval, from, to } = range;
			const { rows } = await db.execute<HostedRow>(sql`
				with usage as (
					select ${bucketOf(interval, sql`h.occurred_at`)} as bucket,
						h.feature, h.unit, h.units, price.eur_per_unit
					from hosted_usage h
					${priceInEffectSql()}
					where h.occurred_at >= ${instant(from)}
						and h.occurred_at < ${instant(to)}
				),
				segments as (select distinct feature, unit from usage)
				select series.bucket, segments.feature, segments.unit,
					coalesce(sum(usage.units), 0)::float8 as units,
					coalesce(sum(usage.units) filter (
						where usage.eur_per_unit is not null
					), 0)::float8 as priced_units,
					case when count(usage.units) = 0 then 0
						else sum(usage.units * usage.eur_per_unit)
					end::float8 as cost_eur,
					count(usage.units)::int as usage_rows,
					count(usage.eur_per_unit)::int as priced_rows
				from (${bucketSeriesSql(interval, from, to)}) series
				cross join segments
				left join usage on usage.bucket = series.bucket
					and usage.feature = segments.feature
					and usage.unit = segments.unit
				group by 1, 2, 3
				order by 1, 2, 3
			`);

			const buckets: HostedBucket[] = rows.map((row) => ({
				bucket: iso(row.bucket),
				feature: row.feature,
				unit: row.unit,
				units: num(row.units),
				pricedUnits: num(row.priced_units),
				costEur: numOrNull(row.cost_eur),
			}));

			const totals = new Map<string, HostedFeatureTotal>();
			let usageRows = 0;
			let pricedRows = 0;
			for (const [index, bucket] of buckets.entries()) {
				const row = rows[index];
				usageRows += num(row?.usage_rows);
				pricedRows += num(row?.priced_rows);
				const key = `${bucket.feature}:${bucket.unit}`;
				const total = totals.get(key) ?? {
					feature: bucket.feature,
					unit: bucket.unit,
					units: 0,
					pricedUnits: 0,
					costEur: null,
					pricedShare: null,
				};
				total.units += bucket.units;
				total.pricedUnits += bucket.pricedUnits;
				if (bucket.pricedUnits > 0) {
					total.costEur = (total.costEur ?? 0) + (bucket.costEur ?? 0);
				}
				totals.set(key, total);
			}
			const features = [...totals.values()].map((total) => ({
				...total,
				pricedShare: total.units > 0 ? total.pricedUnits / total.units : null,
			}));
			const priced = features.filter((feature) => feature.costEur !== null);
			return {
				interval,
				buckets,
				features,
				/** Sum of priced spend; null when there is usage but no price at all. */
				totalCostEur:
					usageRows === 0
						? 0
						: priced.length === 0
							? null
							: priced.reduce(
									(sum, feature) => sum + (feature.costEur ?? 0),
									0,
								),
				pricedShare: usageRows === 0 ? null : pricedRows / usageRows,
			};
		}),

	/**
	 * Direct forwarder (relay encoder) minutes per bucket × destination from
	 * `forwarder_session`, each session clipped to the bucket and to
	 * `[from, to)`, open sessions counted until now. `peaks` is the most
	 * forwarders running at the same instant within each bucket, across all
	 * relays and destinations: the number that has to fit under encoder caps.
	 */
	encoderSeries: adminProcedure
		.input(usageRangeInput)
		.query(async ({ input }) => {
			const range = parseRange(input);
			const sessions = clippedForwarderSessionsSql(range);
			const windows = bucketWindowsSql(range);

			const minutes = await db.execute<{
				bucket: Date | string;
				destination: string;
				minutes: unknown;
			}>(sql`
				with clipped as (${sessions}),
				windows as (${windows}),
				destinations as (select distinct destination from clipped)
				select w.bucket, d.destination,
					-- least/greatest skip NULLs, so an unmatched (null) session
					-- would otherwise span the whole window.
					coalesce(sum(extract(epoch from
						least(c.span_end, w.win_end) - greatest(c.span_start, w.win_start)
					)) filter (where c.span_start is not null), 0)::float8 / 60 as minutes
				from windows w
				cross join destinations d
				left join clipped c on c.destination = d.destination
					and c.span_start < w.win_end
					and c.span_end > w.win_start
				group by 1, 2
				order by 1, 2
			`);

			// A step function only changes at session starts/ends, so the peak in
			// a bucket is the larger of the count carried in at its start and the
			// running count after each event inside it. Ends sort before starts
			// at the same instant, so a back-to-back handover counts once.
			const peaks = await db.execute<{
				bucket: Date | string;
				peak: unknown;
			}>(sql`
				with clipped as (${sessions}),
				events as (
					select span_start as t, 1 as delta from clipped
					union all
					select span_end as t, -1 as delta from clipped
				),
				running as (
					select t, delta, sum(delta) over (order by t, delta) as active
					from events
				),
				windows as (${windows})
				select w.bucket, greatest(
					coalesce((
						select r.active from running r
						where r.t <= w.win_start
						order by r.t desc, r.delta desc
						limit 1
					), 0),
					coalesce((
						select max(r.active) from running r
						where r.t > w.win_start and r.t < w.win_end and r.delta = 1
					), 0)
				)::int as peak
				from windows w
				order by 1
			`);

			const buckets: EncoderBucket[] = minutes.rows.map((row) => ({
				bucket: iso(row.bucket),
				destination: row.destination,
				minutes: num(row.minutes),
			}));
			const peakBuckets = peaks.rows.map((row) => ({
				bucket: iso(row.bucket),
				peak: num(row.peak),
			}));
			return {
				interval: range.interval,
				buckets,
				peaks: peakBuckets,
				totalMinutes: buckets.reduce((sum, bucket) => sum + bucket.minutes, 0),
				peak: peakBuckets.reduce(
					(max, bucket) => Math.max(max, bucket.peak),
					0,
				),
			};
		}),

	/**
	 * Share of active streamers (eligible users with a `live_session` whose
	 * `first_live_at` is in the range, clamped to `METRICS_DATA_START`) who
	 * used each feature. Definitions, each limited to what the schema records:
	 * - `direct`: a `forwarder_session` on one of their paths overlapping the
	 *   range (VISP Direct actually forwarded).
	 * - `chat_bot`: `chat_bot.enabled` now. No history of toggles is kept.
	 * - `multichat_overlay`: a live overlay credential (`multichat_overlay.
	 *   token_id` set) and at least one enabled `multichat_source` now.
	 * - `obs_plugin`: `app_user.obs_last_seen_at` inside the range. Only the
	 *   last sighting is kept, so a past range undercounts users seen since.
	 * - `studio`: `app_user.direct_production_mode = 'cloud_studio'` now.
	 * - `hosted_tts`, `hosted_audio_isolation`: any `hosted_usage` row of that
	 *   feature inside the range.
	 * Subtitles are not metered and are therefore not listed.
	 */
	featureAdoption: adminProcedure
		.input(usageRangeInput)
		.query(async ({ input }) => {
			const range = parseRange(input);
			const from = liveFrom(range.from);
			const { to } = range;
			const definitions: Omit<AdoptionFeature, "users" | "share">[] = [
				{ key: "direct", label: "VISP Direct", basis: "range" },
				{ key: "chat_bot", label: "Chat bot", basis: "current" },
				{
					key: "multichat_overlay",
					label: "Multichat overlay",
					basis: "current",
				},
				{ key: "obs_plugin", label: "OBS plugin", basis: "range" },
				{ key: "studio", label: "Cloud Studio", basis: "current" },
				{ key: "hosted_tts", label: "Hosted TTS", basis: "range" },
				{
					key: "hosted_audio_isolation",
					label: "Hosted audio isolation",
					basis: "range",
				},
			];
			if (from >= to) {
				return {
					activeStreamers: 0,
					dataStart: METRICS_DATA_START.toISOString(),
					features: definitions.map((definition) => ({
						...definition,
						users: 0,
						share: null,
					})),
				};
			}
			const hostedUsed = (feature: HostedUsageFeature) => sql`exists (
				select 1 from hosted_usage h
				where h.user_id = a.user_id and h.feature = ${feature}
					and h.occurred_at >= ${instant(from)}
					and h.occurred_at < ${instant(to)}
			)`;
			const { rows } = await db.execute<Record<string, unknown>>(sql`
				with active as (
					select distinct ls.user_id
					from (${liveSessionsSql({ from, to })}) ls
				)
				select count(*)::int as active,
					count(*) filter (where exists (
						select 1 from forwarder_session f
						join "path" p on p.id = f.path_id
						where p.user_id = a.user_id
							and f.started_at < ${instant(to)}
							and (f.ended_at is null or f.ended_at > ${instant(from)})
					))::int as direct,
					count(*) filter (where exists (
						select 1 from chat_bot cb
						where cb.user_id = a.user_id and cb.enabled
					))::int as chat_bot,
					count(*) filter (where exists (
						select 1 from multichat_overlay mo
						where mo.user_id = a.user_id and mo.token_id is not null
					) and exists (
						select 1 from multichat_source ms
						where ms.user_id = a.user_id and ms.enabled
					))::int as multichat_overlay,
					count(*) filter (where au.obs_last_seen_at >= ${instant(from)}
						and au.obs_last_seen_at < ${instant(to)})::int as obs_plugin,
					count(*) filter (
						where au.direct_production_mode = 'cloud_studio'
					)::int as studio,
					count(*) filter (where ${hostedUsed("tts")})::int as hosted_tts,
					count(*) filter (
						where ${hostedUsed("audio_isolation")}
					)::int as hosted_audio_isolation
				from active a
				left join app_user au on au.id = a.user_id
			`);
			const row = rows[0] ?? {};
			const active = num(row.active);
			return {
				activeStreamers: active,
				dataStart: METRICS_DATA_START.toISOString(),
				features: definitions.map((definition) => {
					const users = num(row[definition.key]);
					return {
						...definition,
						users,
						share: active > 0 ? users / active : null,
					};
				}),
			};
		}),

	/**
	 * The 20 eligible users with the most hosted spend in the range, then (for
	 * unpriced usage) the most hosted units, then the most encoder minutes, so
	 * the table still ranks something useful before any price is entered.
	 * Users with neither hosted usage nor forwarder time are not candidates.
	 * `hoursStreamed` follows the streaming-hours KPI (live sessions by
	 * `first_live_at`, from `METRICS_DATA_START`); `encoderMinutes` is clipped
	 * to the range like `encoderSeries`. Name and email only: no tokens, IPs
	 * or stream details.
	 */
	topUsers: adminProcedure.input(usageRangeInput).query(async ({ input }) => {
		const range = parseRange(input);
		const { from, to } = range;
		const { rows } = await db.execute<{
			user_id: string;
			name: string;
			email: string;
			cost_eur: unknown;
			usage:
				| {
						feature: HostedUsageFeature;
						unit: HostedUsageUnit;
						units: unknown;
						cost_eur: unknown;
				  }[]
				| null;
			encoder_minutes: unknown;
			hours_streamed: unknown;
		}>(sql`
				with hosted as (
					select h.user_id, h.feature, h.unit,
						sum(h.units) as units,
						sum(h.units * price.eur_per_unit) as cost_eur
					from hosted_usage h
					${priceInEffectSql()}
					where h.occurred_at >= ${instant(from)}
						and h.occurred_at < ${instant(to)}
					group by 1, 2, 3
				),
				hosted_user as (
					select user_id, sum(cost_eur) as cost_eur, sum(units) as units,
						jsonb_agg(jsonb_build_object(
							'feature', feature, 'unit', unit,
							'units', units, 'cost_eur', cost_eur
						) order by feature, unit) as usage
					from hosted
					group by 1
				),
				encoder as (
					select user_id,
						sum(extract(epoch from span_end - span_start)) / 60 as minutes
					from (${clippedForwarderSessionsSql(range)}) clipped
					group by 1
				),
				ranked as (
					select u.id as user_id, u.name, u.email,
						hu.cost_eur, hu.units, hu.usage,
						coalesce(e.minutes, 0) as encoder_minutes
					from "user" u
					left join hosted_user hu on hu.user_id = u.id
					left join encoder e on e.user_id = u.id
					where (hu.user_id is not null or e.user_id is not null)
						and ${eligibleUserWhere("u")}
					order by hu.cost_eur desc nulls last, hu.units desc nulls last,
						encoder_minutes desc, u.id
					limit ${TOP_USERS_LIMIT}
				),
				live as (${liveSessionsSql({ from: liveFrom(from), to })})
				select r.user_id, r.name, r.email,
					r.cost_eur::float8 as cost_eur, r.usage,
					r.encoder_minutes::float8 as encoder_minutes,
					coalesce((
						select sum(${liveHoursOf("ls")}) from live ls
						where ls.user_id = r.user_id
					), 0)::float8 as hours_streamed
				from ranked r
				order by r.cost_eur desc nulls last, r.units desc nulls last,
					r.encoder_minutes desc, r.user_id
			`);
		const users: TopUser[] = rows.map((row) => ({
			id: row.user_id,
			name: row.name,
			email: row.email,
			costEur: numOrNull(row.cost_eur),
			usage: (row.usage ?? []).map((entry) => ({
				feature: entry.feature,
				unit: entry.unit,
				units: num(entry.units),
				costEur: numOrNull(entry.cost_eur),
			})),
			hoursStreamed: num(row.hours_streamed),
			encoderMinutes: num(row.encoder_minutes),
		}));
		return { users };
	}),
});
