import type { trpc } from "../lib";
import {
	peakOf,
	type RelayHistoryResult,
	toUtilisation,
} from "./relay-history";

/**
 * Shapes the reliability API responses into chart rows. Kept free of React so
 * the maths behind the page can be unit-tested.
 */

/** The share of Direct sessions that should reach live; the chart's target line. */
export const SUCCESS_RATE_TARGET = 0.95;

/** `admin.relayHistory.history` with `day` buckets covers at most 400 days. */
export const RELAY_PEAK_MAX_DAYS = 400;

const DAY_MS = 86_400_000;

export type SessionSuccessResult = Awaited<
	ReturnType<typeof trpc.admin.reliability.sessionSuccess.query>
>;
export type RttResult = Awaited<
	ReturnType<typeof trpc.admin.reliability.rtt.query>
>;

/** One bucket of the success and start-to-live charts; null is a gap. */
export type SuccessRow = {
	bucket: string;
	/** Percent (0–100) so axis ticks read "90", not "0.9". */
	successPct: number | null;
	p50Sec: number | null;
	p95Sec: number | null;
};

export function successRows(result: SessionSuccessResult | undefined) {
	return (result?.buckets ?? []).map(
		(bucket): SuccessRow => ({
			bucket: bucket.bucket,
			successPct: bucket.successRate === null ? null : bucket.successRate * 100,
			p50Sec: bucket.startToLiveP50Sec,
			p95Sec: bucket.startToLiveP95Sec,
		}),
	);
}

export type RttRelaySeries = {
	relayId: number;
	relayName: string;
	samples: number;
	rows: { bucket: string; p50Ms: number | null; p95Ms: number | null }[];
};

/** RTT buckets grouped per relay (API order: by relay name, then bucket). */
export function rttByRelay(result: RttResult | undefined): RttRelaySeries[] {
	const byRelay = new Map<number, RttRelaySeries>();
	for (const bucket of result?.buckets ?? []) {
		let relay = byRelay.get(bucket.relayId);
		if (!relay) {
			relay = {
				relayId: bucket.relayId,
				relayName: bucket.relayName,
				samples: 0,
				rows: [],
			};
			byRelay.set(bucket.relayId, relay);
		}
		relay.samples += bucket.samples;
		relay.rows.push({
			bucket: bucket.bucket,
			p50Ms: bucket.p50Ms,
			p95Ms: bucket.p95Ms,
		});
	}
	return [...byRelay.values()];
}

/** Highest CPU (1-minute load ÷ cores), RAM and disk use of one relay, in %. */
export type RelayPeakRow = {
	relay: string;
	cpuPct: number | null;
	memPct: number | null;
	diskPct: number | null;
};

/** Per-relay maxima over the whole range; relays without samples are left out. */
export function relayPeaks(result: RelayHistoryResult | undefined) {
	const rows: RelayPeakRow[] = [];
	for (const relay of result?.relays ?? []) {
		if (relay.series.length === 0) continue;
		const points = relay.series.map((point) => toUtilisation(point, relay));
		rows.push({
			relay: relay.name,
			cpuPct: peakOf(points, "cpuPeakPct"),
			memPct: peakOf(points, "memPct"),
			diskPct: peakOf(points, "diskPct"),
		});
	}
	return rows;
}

/**
 * The relay history window for `[from, to)`: the same range, shortened to
 * the last `RELAY_PEAK_MAX_DAYS` when longer, since daily buckets cap there.
 */
export function relayPeakWindow(from: string, to: string) {
	const end = new Date(to).getTime();
	const start = Math.max(
		new Date(from).getTime(),
		end - RELAY_PEAK_MAX_DAYS * DAY_MS,
	);
	return {
		from: new Date(start).toISOString(),
		to: new Date(end).toISOString(),
		clamped: start > new Date(from).getTime(),
	};
}

/**
 * Whether a comparison period can show a delta: only when it lies entirely
 * after the data start, since a partly-tracked period would undercount
 * (docs/admin-kpis.md, "Legacy sessions").
 */
export function canCompare(
	compareFrom: string | undefined,
	dataStart: string | undefined,
): compareFrom is string {
	if (!compareFrom || !dataStart) return false;
	return new Date(compareFrom).getTime() >= new Date(dataStart).getTime();
}
