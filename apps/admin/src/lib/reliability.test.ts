import { expect, test } from "bun:test";
import type { RelayHistoryResult } from "./relay-history";
import {
	canCompare,
	type RttResult,
	relayPeaks,
	relayPeakWindow,
	rttByRelay,
} from "./reliability";

test("comparisons need a window wholly after the data start", () => {
	const start = "2026-09-07T00:00:00.000Z";
	expect(canCompare(undefined, start)).toBe(false);
	expect(canCompare("2026-09-01T00:00:00.000Z", start)).toBe(false);
	expect(canCompare(start, start)).toBe(true);
	expect(canCompare("2026-09-14T00:00:00.000Z", undefined)).toBe(false);
});

test("relay peak window keeps the range up to 400 days", () => {
	expect(
		relayPeakWindow("2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"),
	).toEqual({
		from: "2026-09-01T00:00:00.000Z",
		to: "2026-10-01T00:00:00.000Z",
		clamped: false,
	});
	const long = relayPeakWindow(
		"2024-10-01T00:00:00.000Z",
		"2026-10-01T00:00:00.000Z",
	);
	expect(long.clamped).toBe(true);
	expect(long.from).toBe("2025-08-27T00:00:00.000Z");
});

test("RTT buckets group per relay with summed samples", () => {
	const bucket = (relayId: number, day: string, samples: number) => ({
		bucket: `2026-09-${day}T00:00:00.000Z`,
		relayId,
		relayName: `relay-${relayId}`,
		p50Ms: samples ? 20 : null,
		p95Ms: samples ? 40 : null,
		samples,
		users: samples ? 1 : 0,
	});
	const result = {
		interval: "day",
		method: null,
		buckets: [bucket(1, "14", 3), bucket(1, "15", 0), bucket(2, "14", 2)],
	} as RttResult;
	const grouped = rttByRelay(result);
	expect(grouped.map((relay) => [relay.relayName, relay.samples])).toEqual([
		["relay-1", 3],
		["relay-2", 2],
	]);
	expect(grouped[0]?.rows).toEqual([
		{ bucket: "2026-09-14T00:00:00.000Z", p50Ms: 20, p95Ms: 40 },
		{ bucket: "2026-09-15T00:00:00.000Z", p50Ms: null, p95Ms: null },
	]);
});

test("relay peaks take the maximum over the range and skip silent relays", () => {
	const point = (load1Max: number, mem: number, disk: number) => ({
		t: "2026-09-14T00:00:00.000Z",
		load1Avg: 0,
		load1Max,
		cpuCount: 4,
		memUsedPctMax: mem,
		diskUsedPctMax: disk,
		livePathsMax: null,
		activeForwardersMax: null,
	});
	const result = {
		from: "",
		to: "",
		bucket: "day",
		relays: [
			{
				relayId: 1,
				name: "eu-1",
				capacityPaths: 10,
				maxForwarders: 2,
				series: [point(2, 40, 70), point(3, 55, 60)],
			},
			{
				relayId: 2,
				name: "eu-2",
				capacityPaths: 10,
				maxForwarders: 2,
				series: [],
			},
		],
	} as RelayHistoryResult;
	expect(relayPeaks(result)).toEqual([
		{ relay: "eu-1", cpuPct: 75, memPct: 55, diskPct: 70 },
	]);
});
