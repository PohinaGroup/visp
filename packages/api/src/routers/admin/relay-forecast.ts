import { db } from "@VISP/db";
import { relay } from "@VISP/db/schema/index";
import { asc, sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../../index";
import {
	type DailyPeak,
	forecastRelayCapacity,
	RELAY_FORECAST_DEFAULT_DAYS,
	RELAY_FORECAST_METHOD,
	utcDayStart,
} from "../../relay-forecast";

const DAY_MS = 24 * 60 * 60 * 1000;

export const relayForecastInput = z
	.object({
		/**
		 * Days of daily peaks to fit. Whole weeks keep each weekday equally
		 * weighted (see relay-forecast.ts); 92 stays inside hourly retention.
		 */
		days: z.number().int().min(7).max(92).optional(),
	})
	.optional();

type DailyPeakRow = {
	relay_id: number;
	day: Date | string;
	live_paths_max: number | string | null;
	active_forwarders_max: number | string | null;
};

const nullableNumber = (value: number | string | null) =>
	value === null ? null : Number(value);

/**
 * Capacity forecast for every relay: how many weeks until live paths and
 * forwarders reach 80 % / 100 % of the relay's configured capacity at the
 * current daily-peak trend.
 *
 * Daily peaks come from raw `relay_health_sample` rows and
 * `relay_health_hourly` rollups merged per UTC day, the same way
 * `admin.relayHistory.history` builds its `day` buckets (the two tables never
 * hold the same sample, so a plain union is exact). The window ends at the
 * start of today (UTC): today's peak may still be ahead, and counting a
 * partial day would bias every slope down. Only the two capacity columns are
 * read, so the 28 days of 30-second samples cost one aggregate per relay-day.
 */
export const adminRelayForecastRouter = router({
	forecast: adminProcedure
		.input(relayForecastInput)
		.query(async ({ input }) => {
			const days = input?.days ?? RELAY_FORECAST_DEFAULT_DAYS;
			const to = new Date(utcDayStart(Date.now()));
			const from = new Date(to.getTime() - days * DAY_MS);
			const fromIso = from.toISOString();
			const toIso = to.toISOString();

			const [peaks, relays] = await Promise.all([
				db.execute<DailyPeakRow>(sql`
				with src as (
					select relay_id, reported_at as t, live_paths, active_forwarders
					from relay_health_sample
					where reported_at >= ${fromIso}::timestamptz
						and reported_at < ${toIso}::timestamptz
					union all
					select relay_id, hour, max_live_paths, max_active_forwarders
					from relay_health_hourly
					where hour >= ${fromIso}::timestamptz
						and hour < ${toIso}::timestamptz
				)
				select
					relay_id,
					date_trunc('day', t at time zone 'UTC') at time zone 'UTC' as day,
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
					})
					.from(relay)
					.orderBy(asc(relay.name)),
			]);

			const byRelay = new Map<
				number,
				{ paths: DailyPeak[]; forwarders: DailyPeak[] }
			>();
			for (const row of peaks.rows) {
				const relayId = Number(row.relay_id);
				let entry = byRelay.get(relayId);
				if (!entry) {
					entry = { paths: [], forwarders: [] };
					byRelay.set(relayId, entry);
				}
				const day = new Date(row.day);
				entry.paths.push({ day, peak: nullableNumber(row.live_paths_max) });
				entry.forwarders.push({
					day,
					peak: nullableNumber(row.active_forwarders_max),
				});
			}

			return {
				from: fromIso,
				to: toIso,
				days,
				method: RELAY_FORECAST_METHOD,
				relays: relays.map((row) => {
					const entry = byRelay.get(row.relayId);
					return {
						...row,
						paths: forecastRelayCapacity({
							peaks: entry?.paths ?? [],
							capacity: row.capacityPaths,
							days,
							asOf: to,
						}),
						forwarders: forecastRelayCapacity({
							peaks: entry?.forwarders ?? [],
							capacity: row.maxForwarders,
							days,
							asOf: to,
						}),
					};
				}),
			};
		}),
});
