import { describe, expect, test } from "bun:test";
import { stringifySearch } from "../app/search";
import {
	clampRange,
	type FunnelSegmentResult,
	foldSegments,
	formatHours,
	funnelCsvRows,
	funnelRows,
	HEATMAP_BUCKETS,
	heatmapBucket,
	heatmapFill,
	heatmapOffsets,
	isFunnelEmpty,
	OTHER_SEGMENT,
	parseSegment,
	type RetentionCohort,
	retentionCsvRows,
	retentionWeeks,
	segmentToSearch,
	segmentValueLabel,
	signupStack,
	stageConversion,
	startsBeforeData,
} from "./growth";

function segment(
	name: string,
	[signups, devices, live, returned]: [number, number, number, number],
	observed: { live?: number; returned?: number; liveBase?: number } = {},
): FunnelSegmentResult {
	const liveBase = observed.liveBase ?? signups;
	return {
		segment: name,
		stages: [
			{
				stage: "signup",
				count: signups,
				cohortCount: signups,
				observedCount: signups,
			},
			{
				stage: "device_created",
				count: devices,
				cohortCount: signups,
				observedCount: signups,
			},
			{
				stage: "first_live",
				count: live,
				cohortCount: liveBase,
				observedCount: observed.live ?? liveBase,
			},
			{
				stage: "week2_return",
				count: returned,
				cohortCount: live,
				observedCount: observed.returned ?? live,
			},
		],
		firstLiveAny: {
			stage: "first_live_any",
			count: live,
			cohortCount: liveBase,
			observedCount: liveBase,
		},
	};
}

describe("segment URL state", () => {
	test("accepts every known segment", () => {
		for (const value of [
			"none",
			"provider",
			"use_case",
			"publisher",
			"destination",
		]) {
			expect(parseSegment(value)).toBe(value as never);
		}
	});

	test("falls back to none for missing or unknown values", () => {
		expect(parseSegment(undefined)).toBe("none");
		expect(parseSegment("")).toBe("none");
		expect(parseSegment("country")).toBe("none");
		expect(parseSegment("Provider")).toBe("none");
		expect(parseSegment(["provider"])).toBe("none");
	});

	test("the default is dropped from the URL, others round-trip", () => {
		expect(segmentToSearch("none")).toBeUndefined();
		expect(stringifySearch({ segment: segmentToSearch("none") })).toBe("");
		expect(stringifySearch({ segment: segmentToSearch("use_case") })).toBe(
			"?segment=use_case",
		);
		expect(parseSegment(segmentToSearch("destination"))).toBe("destination");
	});

	test("labels known values and humanises unknown ones", () => {
		expect(segmentValueLabel("not_selected")).toBe("Not selected");
		expect(segmentValueLabel("credential")).toBe("Email");
		expect(segmentValueLabel("phone_to_obs")).toBe("Phone to OBS");
		expect(segmentValueLabel("new_provider")).toBe("New provider");
	});
});

describe("funnel conversion", () => {
	test("rate is count over observed, not over the whole cohort", () => {
		expect(
			stageConversion({ count: 3, cohortCount: 10, observedCount: 6 }),
		).toEqual({ rate: 0.5, unobserved: 4 });
	});

	test("nobody observed yet has no rate rather than 0%", () => {
		expect(
			stageConversion({ count: 0, cohortCount: 5, observedCount: 0 }),
		).toEqual({ rate: null, unobserved: 5 });
	});

	test("rows: bars against the first stage, conversion per stage", () => {
		const rows = funnelRows(
			segment("all", [100, 80, 30, 6], { live: 60, returned: 20 }),
		);
		expect(rows.map((row) => row.share)).toEqual([1, 0.8, 0.3, 0.06]);
		expect(rows.map((row) => row.conversion)).toEqual([1, 0.8, 0.5, 0.3]);
		expect(rows.map((row) => row.unobserved)).toEqual([0, 0, 40, 10]);
	});

	test("an empty funnel has zero-width bars and no rates", () => {
		const rows = funnelRows(segment("all", [0, 0, 0, 0]));
		expect(rows.every((row) => row.share === 0)).toBe(true);
		expect(rows.every((row) => row.conversion === null)).toBe(true);
		expect(isFunnelEmpty([segment("all", [0, 0, 0, 0])])).toBe(true);
		expect(isFunnelEmpty([segment("a", [1, 0, 0, 0])])).toBe(false);
	});

	test("folds the tail into Other by summing every count", () => {
		const segments = [
			segment("a", [50, 40, 20, 5]),
			segment("b", [40, 30, 10, 2]),
			segment("c", [30, 20, 9, 1]),
			segment("d", [20, 10, 5, 1]),
			segment("e", [10, 5, 2, 0]),
			segment("f", [6, 3, 1, 0], { live: 4 }),
			segment("g", [4, 2, 1, 1], { live: 2 }),
		];
		const folded = foldSegments(segments);
		expect(folded.map((s) => s.segment)).toEqual([
			"a",
			"b",
			"c",
			"d",
			"e",
			OTHER_SEGMENT,
		]);
		const other = folded[5] as FunnelSegmentResult;
		expect(other.stages.map((s) => s.count)).toEqual([10, 5, 2, 1]);
		expect(other.stages[2]).toMatchObject({
			cohortCount: 10,
			observedCount: 6,
		});
		expect(other.firstLiveAny.count).toBe(2);
		// The input is untouched.
		expect(segments[5]?.stages[0]?.count).toBe(6);
	});

	test("does not fold a single leftover segment", () => {
		const segments = ["a", "b", "c", "d", "e", "f"].map((name) =>
			segment(name, [1, 1, 0, 0]),
		);
		expect(foldSegments(segments).map((s) => s.segment)).toEqual([
			"a",
			"b",
			"c",
			"d",
			"e",
			"f",
		]);
	});

	test("CSV rows include every stage plus first live (any time)", () => {
		const rows = funnelCsvRows([segment("google", [10, 8, 4, 1])]);
		expect(rows).toHaveLength(5);
		expect(rows[0]).toMatchObject({ segment: "Google", stage: "Signed up" });
		expect(rows[2]?.conversion).toBe(0.4);
	});
});

describe("signup stack", () => {
	const bucket = (day: string, segment: string, value: number) => ({
		bucket: `2026-10-${day}T00:00:00.000Z`,
		segment,
		value,
	});

	test("one row per bucket with a column per provider, largest first", () => {
		const { rows, series } = signupStack([
			bucket("02", "google", 1),
			bucket("01", "google", 2),
			bucket("01", "twitch", 5),
			bucket("02", "twitch", 0),
		]);
		expect(series.map((s) => s.label)).toEqual(["Twitch", "Google"]);
		expect(rows).toEqual([
			{ bucket: "2026-10-01T00:00:00.000Z", p_twitch: 5, p_google: 2 },
			{ bucket: "2026-10-02T00:00:00.000Z", p_twitch: 0, p_google: 1 },
		]);
	});

	test("folds providers past the fifth into a muted Other", () => {
		const names = ["a", "b", "c", "d", "e", "f", "g"];
		const { rows, series } = signupStack(
			names.map((name, index) => bucket("01", name, 10 - index)),
		);
		expect(series).toHaveLength(6);
		expect(series[5]).toMatchObject({
			key: OTHER_SEGMENT,
			label: "Other",
			color: "var(--muted-foreground)",
		});
		expect(rows[0]?.[OTHER_SEGMENT]).toBe(5 + 4);
	});

	test("no buckets, no rows", () => {
		expect(signupStack([])).toEqual({ rows: [], series: [] });
	});
});

describe("heatmap shading", () => {
	test("buckets are inclusive at their lower bound", () => {
		expect(heatmapBucket(0)).toBe(0);
		expect(heatmapBucket(0.001)).toBe(1);
		expect(heatmapBucket(0.05)).toBe(2);
		expect(heatmapBucket(0.0999)).toBe(2);
		expect(heatmapBucket(0.1)).toBe(3);
		expect(heatmapBucket(0.2)).toBe(4);
		expect(heatmapBucket(0.4)).toBe(5);
		expect(heatmapBucket(0.6)).toBe(6);
		expect(heatmapBucket(1)).toBe(6);
	});

	test("null and non-finite values are blank", () => {
		expect(heatmapBucket(null)).toBeNull();
		expect(heatmapBucket(Number.NaN)).toBeNull();
		expect(heatmapFill(null)).toBeUndefined();
	});

	test("opacity rises monotonically and stays at or below 75%", () => {
		const opacities = HEATMAP_BUCKETS.map((b) => b.opacity);
		for (let i = 1; i < opacities.length; i++) {
			expect(opacities[i] as number).toBeGreaterThan(
				opacities[i - 1] as number,
			);
		}
		expect(Math.max(...opacities)).toBeLessThanOrEqual(0.75);
	});

	test("fills use the theme chart hue; 0% has no fill", () => {
		expect(heatmapFill(0)).toBeUndefined();
		expect(heatmapFill(0.25)).toBe(
			"color-mix(in oklab, var(--chart-1) 42%, transparent)",
		);
	});

	const cohort = (
		start: string,
		size: number,
		counts: (number | null)[],
	): RetentionCohort => ({
		cohort: `${start}T00:00:00.000Z`,
		size,
		cells: counts.map((count, offset) => ({
			offset,
			count,
			value: count === null || size === 0 ? null : count / size,
		})),
	});

	test("columns stop at the last observed offset", () => {
		const cohorts = [
			cohort("2026-09-07", 10, [10, 4, 3, null, null]),
			cohort("2026-09-14", 5, [5, 2, null, null, null]),
			cohort("2026-09-21", 0, [null, null, null, null, null]),
		];
		expect(heatmapOffsets(cohorts)).toEqual([0, 1, 2]);
		expect(heatmapOffsets([cohort("2026-09-21", 3, [null, null])])).toEqual([
			0,
		]);
	});

	test("CSV rows carry size and one share per visible week", () => {
		const { offsets, rows } = retentionCsvRows([
			cohort("2026-09-07", 10, [10, 4, null]),
		]);
		expect(offsets).toEqual([0, 1]);
		expect(rows).toEqual([
			{ cohort: "2026-09-07", size: 10, week0: 1, week1: 0.4 },
		]);
	});
});

describe("ranges", () => {
	test("clamps a long range to its newest 400 days", () => {
		const to = "2026-10-11T00:00:00.000Z";
		expect(clampRange({ from: "2025-01-01T00:00:00.000Z", to })).toEqual({
			from: "2025-09-06T00:00:00.000Z",
			to,
			clamped: true,
		});
		expect(clampRange({ from: "2026-09-13T00:00:00.000Z", to })).toEqual({
			from: "2026-09-13T00:00:00.000Z",
			to,
			clamped: false,
		});
	});

	test("retention weeks follow the range within 8–26", () => {
		expect(retentionWeeks(7)).toBe(8);
		expect(retentionWeeks(90)).toBe(13);
		expect(retentionWeeks(182)).toBe(26);
		expect(retentionWeeks(732)).toBe(26);
	});

	test("data-start note only when the range reaches before it", () => {
		const start = "2026-09-07T00:00:00.000Z";
		expect(startsBeforeData("2026-09-01T00:00:00.000Z", start)).toBe(true);
		expect(startsBeforeData(start, start)).toBe(false);
		expect(startsBeforeData("2026-09-01T00:00:00.000Z", undefined)).toBe(false);
	});

	test("hours read as minutes, hours or days", () => {
		expect(formatHours(0.5)).toBe("30 min");
		expect(formatHours(5.25)).toBe("5.3 h");
		expect(formatHours(72)).toBe("3 d");
	});
});
