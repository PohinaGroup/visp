import { db } from "@VISP/db";
import { relay, relayHealth } from "@VISP/db/schema/index";
import { eq, sql } from "drizzle-orm";
import { adminProcedure, router } from "../../index";
import { usedPct } from "../../relay-health";
import {
	type AdminAlert,
	forecastAlerts,
	RELAY_CAPACITY_PEAK_WINDOW_MS,
	relayAlerts,
	SESSION_SUCCESS_WINDOW_MS,
	sessionSuccessAlert,
	sortAlerts,
	spendAlert,
} from "./alerts-rules";
import { instant } from "./metrics-sql";
import { METRICS_DATA_START } from "./metrics-window";
import { adminRelayForecastRouter } from "./relay-forecast";
import { judgedSessionsSql } from "./reliability";
import { adminSpendRouter } from "./spend";

export type { AdminAlert } from "./alerts-rules";

/** Enabled relays with what rules 1 and 2 need, in one query. */
async function loadRelays(now: Date) {
	const peakFrom = new Date(now.getTime() - RELAY_CAPACITY_PEAK_WINDOW_MS);
	// Correlated subqueries read the (relay_id, reported_at) primary key of
	// relay_health_sample, so the peak is ~120 index rows per relay.
	return db
		.select({
			relayId: relay.id,
			name: relay.name,
			capacityPaths: relay.capacityPaths,
			maxForwarders: relay.maxForwarders,
			reportedAt: relayHealth.reportedAt,
			diskTotalKb: relayHealth.diskTotalKb,
			diskAvailableKb: relayHealth.diskAvailableKb,
			assignedPaths: sql<number>`(
				select count(*)::int from "path" alert_path
				where alert_path.relay_id = ${relay.id}
					and alert_path.revoked_at is null
			)`,
			peakLivePaths: sql<number | null>`(
				select max(alert_sample.live_paths) from relay_health_sample alert_sample
				where alert_sample.relay_id = ${relay.id}
					and alert_sample.reported_at >= ${instant(peakFrom)}
			)`,
			peakForwarders: sql<number | null>`(
				select max(alert_sample.active_forwarders) from relay_health_sample alert_sample
				where alert_sample.relay_id = ${relay.id}
					and alert_sample.reported_at >= ${instant(peakFrom)}
			)`,
		})
		.from(relay)
		.leftJoin(relayHealth, eq(relayHealth.relayId, relay.id))
		.where(eq(relay.enabled, true));
}

/**
 * Sessions started in the trailing window and how many were stable, with the
 * Reliability page's definition (`judgedSessionsSql`: eligible users,
 * still-connecting sessions left out), clamped to `METRICS_DATA_START` like
 * every session-based KPI.
 */
async function loadSessionSuccess(now: Date) {
	let from = new Date(now.getTime() - SESSION_SUCCESS_WINDOW_MS);
	if (from < METRICS_DATA_START) from = METRICS_DATA_START;
	if (from >= now) return { started: 0, stable: 0 };
	const { rows } = await db.execute<{ started: unknown; stable: unknown }>(sql`
		select count(*)::int as started,
			count(*) filter (where js.stable)::int as stable
		from (${judgedSessionsSql(from, now)}) js`);
	return {
		started: Number(rows[0]?.started ?? 0),
		stable: Number(rows[0]?.stable ?? 0),
	};
}

const nullableNumber = (value: unknown) =>
	value === null || value === undefined ? null : Number(value);

export const adminAlertsRouter = router({
	/**
	 * Everything that needs an admin's attention now, computed on read from
	 * existing tables (nothing is stored, so an alert clears itself when its
	 * condition does). Rules and thresholds live in `alerts-rules.ts`:
	 *
	 * 1. Relay path / forwarder capacity (enabled relays): ≥ 80 % warning,
	 *    ≥ 95 % critical, paths as max(assigned, peak live last hour).
	 * 2. Relay disk (latest report) ≥ 80 % warning, ≥ 90 % critical; a report
	 *    older than 2 minutes, or none at all, on an enabled relay is
	 *    critical. The relay control API is not probed: it is slow and the
	 *    Relays page already does it.
	 * 3. Capacity forecast (`admin.relayForecast.forecast`) reaching 80 % in
	 *    under 4 weeks: warning.
	 * 4. Direct-session success rate over the last 24 h, with at least 10
	 *    sessions: below `SUCCESS_RATE_TARGET` warning, more than 10 pp below
	 *    critical.
	 * 5. This ISO week's spend per budget (`admin.spend.budgets.status`):
	 *    ≥ 80 % warning, ≥ 100 % critical.
	 *
	 * Sorted critical first, then by rule, then by id. The forecast and the
	 * budget status are read through their own procedures so the numbers are
	 * exactly the ones their pages show; all rules run in parallel.
	 */
	list: adminProcedure.query(async ({ ctx }): Promise<AdminAlert[]> => {
		const now = new Date();
		const [relays, sessions, forecast, budgets] = await Promise.all([
			loadRelays(now),
			loadSessionSuccess(now),
			adminRelayForecastRouter.createCaller(ctx).forecast(),
			adminSpendRouter.createCaller(ctx).budgets.status(),
		]);

		const alerts: AdminAlert[] = [];
		const enabled = new Set<number>();
		for (const row of relays) {
			enabled.add(row.relayId);
			alerts.push(
				...relayAlerts(
					{
						relayId: row.relayId,
						name: row.name,
						capacityPaths: row.capacityPaths,
						maxForwarders: row.maxForwarders,
						assignedPaths: Number(row.assignedPaths),
						peakLivePaths: nullableNumber(row.peakLivePaths),
						peakForwarders: nullableNumber(row.peakForwarders),
						reportedAt: row.reportedAt,
						diskUsedPct:
							row.diskTotalKb === null || row.diskAvailableKb === null
								? null
								: usedPct(row.diskTotalKb, row.diskAvailableKb),
					},
					now,
				),
			);
		}
		for (const row of forecast.relays) {
			if (enabled.has(row.relayId)) alerts.push(...forecastAlerts(row));
		}

		const session = sessionSuccessAlert(sessions);
		if (session) alerts.push(session);

		// `status` lists oldest week first; the latest is the current ISO week.
		const currentWeek = budgets.reduce(
			(latest, row) => (row.week > latest ? row.week : latest),
			"",
		);
		for (const row of budgets) {
			if (row.week !== currentWeek) continue;
			const alert = spendAlert(row);
			if (alert) alerts.push(alert);
		}
		return sortAlerts(alerts);
	}),
});
