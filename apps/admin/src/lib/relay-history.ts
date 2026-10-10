import type { trpc } from "../lib";

/**
 * Turns `admin.relayHistory.history` series into utilisation percentages on a
 * fixed hourly grid. Kept free of React so the maths behind the sparklines
 * and the detail charts is the same and can be unit-tested.
 */

export type RelayHistoryResult = Awaited<
	ReturnType<typeof trpc.admin.relayHistory.history.query>
>;
export type RelayHistory = RelayHistoryResult["relays"][number];
type RelayHistoryPoint = RelayHistory["series"][number];

/** Days of history on the Relays page. */
export const RELAY_HISTORY_DAYS = 7;
/** Where utilisation turns into "plan capacity now". */
export const UTILISATION_WARN_PCT = 80;

const HOUR_MS = 60 * 60 * 1000;

/** One hour of one relay; null means no sample that hour (relay dark). */
export type UtilisationPoint = {
	t: string;
	/** Mean 1-minute load as a share of cores. Can pass 100 when overloaded. */
	cpuPct: number | null;
	cpuPeakPct: number | null;
	memPct: number | null;
	diskPct: number | null;
	/** Peak live paths against the relay's configured path capacity. */
	pathsPct: number | null;
	forwardersPct: number | null;
};

export type UtilisationMetric = Exclude<keyof UtilisationPoint, "t">;

function ratioPct(value: number | null, total: number | null) {
	if (value === null || total === null || total <= 0) return null;
	return (value / total) * 100;
}

export function toUtilisation(
	point: RelayHistoryPoint,
	relay: Pick<RelayHistory, "capacityPaths" | "maxForwarders">,
): UtilisationPoint {
	return {
		t: point.t,
		cpuPct: ratioPct(point.load1Avg, point.cpuCount),
		cpuPeakPct: ratioPct(point.load1Max, point.cpuCount),
		memPct: point.memUsedPctMax,
		diskPct: point.diskUsedPctMax,
		pathsPct: ratioPct(point.livePathsMax, relay.capacityPaths),
		forwardersPct: ratioPct(point.activeForwardersMax, relay.maxForwarders),
	};
}

/**
 * Every hour from `from` (inclusive, floored to the hour) to `to`
 * (exclusive), with missing hours as nulls. A relay that went dark must show
 * a gap, not a line drawn straight across the outage.
 */
export function hourlyUtilisation(
	relay: RelayHistory,
	from: string,
	to: string,
): UtilisationPoint[] {
	const byHour = new Map(
		relay.series.map((point) => [
			new Date(point.t).getTime(),
			toUtilisation(point, relay),
		]),
	);
	const start = Math.floor(new Date(from).getTime() / HOUR_MS) * HOUR_MS;
	const end = new Date(to).getTime();
	const grid: UtilisationPoint[] = [];
	for (let hour = start; hour < end; hour += HOUR_MS) {
		grid.push(
			byHour.get(hour) ?? {
				t: new Date(hour).toISOString(),
				cpuPct: null,
				cpuPeakPct: null,
				memPct: null,
				diskPct: null,
				pathsPct: null,
				forwardersPct: null,
			},
		);
	}
	return grid;
}

/** Highest value of a metric over the window, or null with no data. */
export function peakOf(
	points: readonly UtilisationPoint[],
	key: UtilisationMetric,
) {
	let peak: number | null = null;
	for (const point of points) {
		const value = point[key];
		if (value !== null && (peak === null || value > peak)) peak = value;
	}
	return peak;
}

/**
 * The 7-day window the page asks for, ending at the next whole hour so the
 * current partial hour is included and the query key only changes hourly.
 */
export function relayHistoryWindow(now: number = Date.now()) {
	const to = Math.ceil((now + 1) / HOUR_MS) * HOUR_MS;
	return {
		from: new Date(to - RELAY_HISTORY_DAYS * 24 * HOUR_MS).toISOString(),
		to: new Date(to).toISOString(),
	};
}
