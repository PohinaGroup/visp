import { describe, expect, test } from "bun:test";
import {
	computeDeltaPct,
	deltaDirection,
	deltaTone,
	describeDelta,
	formatAxisTick,
	formatChartNumber,
	formatDeltaPct,
	MISSING_VALUE,
	sparklinePoints,
} from "./chart-format";

describe("computeDeltaPct", () => {
	test("returns percent units", () => {
		expect(computeDeltaPct(110, 100)).toBeCloseTo(10);
		expect(computeDeltaPct(50, 100)).toBeCloseTo(-50);
	});

	test("uses |previous| so a shrinking loss reads as improvement", () => {
		expect(computeDeltaPct(-50, -100)).toBeCloseTo(50);
	});

	test("has no baseline for missing or zero previous", () => {
		expect(computeDeltaPct(10, 0)).toBeNull();
		expect(computeDeltaPct(10, null)).toBeNull();
		expect(computeDeltaPct(null, 10)).toBeNull();
		expect(computeDeltaPct(Number.NaN, 10)).toBeNull();
	});
});

describe("deltaDirection / deltaTone", () => {
	test("tiny changes are flat and neutral", () => {
		expect(deltaDirection(0.01)).toBe("flat");
		expect(deltaTone(0.01)).toBe("neutral");
		expect(deltaTone(null)).toBe("neutral");
	});

	test("up is good by default", () => {
		expect(deltaDirection(5)).toBe("up");
		expect(deltaTone(5)).toBe("good");
		expect(deltaTone(-5)).toBe("bad");
	});

	test("invert flips meaning for cost/latency", () => {
		expect(deltaTone(5, true)).toBe("bad");
		expect(deltaTone(-5, true)).toBe("good");
		expect(deltaTone(0, true)).toBe("neutral");
	});
});

describe("formatDeltaPct", () => {
	test("signs non-zero changes", () => {
		expect(formatDeltaPct(12.34, "en-US")).toBe("+12.3%");
		expect(formatDeltaPct(-3, "en-US")).toBe("-3%");
	});

	test("flat changes render as 0% without a sign", () => {
		expect(formatDeltaPct(0, "en-US")).toBe("0%");
		expect(formatDeltaPct(-0.01, "en-US")).toBe("0%");
	});

	test("drops decimals on large swings", () => {
		expect(formatDeltaPct(250.4, "en-US")).toBe("+250%");
	});

	test("missing delta is an em dash", () => {
		expect(formatDeltaPct(null)).toBe(MISSING_VALUE);
	});
});

describe("describeDelta", () => {
	test("spells out direction and tone", () => {
		expect(
			describeDelta(12.5, { comparisonLabel: "vs last week", locale: "en-US" }),
		).toBe("up 12.5% vs last week, good");
		expect(describeDelta(12.5, { invert: true, locale: "en-US" })).toBe(
			"up 12.5%, bad",
		);
		expect(describeDelta(0)).toBe("unchanged");
		expect(describeDelta(undefined)).toBe("no comparison available");
	});
});

describe("formatChartNumber", () => {
	test("keeps small counts exact and compacts large ones", () => {
		expect(formatChartNumber(1284, { locale: "en-US" })).toBe("1,284");
		expect(formatChartNumber(12_900, { locale: "en-US" })).toBe("12.9K");
		expect(formatChartNumber(4_200_000, { locale: "en-US" })).toBe("4.2M");
	});

	test("respects explicit compact and Intl options", () => {
		expect(formatChartNumber(12_900, { locale: "en-US", compact: false })).toBe(
			"12,900",
		);
		expect(
			formatChartNumber(12.5, {
				locale: "en-US",
				intl: { style: "currency", currency: "EUR" },
			}),
		).toBe("€12.50");
	});

	test("missing values are not zero", () => {
		expect(formatChartNumber(null)).toBe(MISSING_VALUE);
		expect(formatChartNumber(Number.POSITIVE_INFINITY)).toBe(MISSING_VALUE);
	});

	test("uses the locale's separators", () => {
		expect(
			formatChartNumber(1284.5, { locale: "de-DE", maximumFractionDigits: 1 }),
		).toBe("1.284,5");
	});
});

describe("formatAxisTick", () => {
	test("compacts from 1,000 and passes strings through", () => {
		expect(formatAxisTick(2000, "en-US")).toBe("2K");
		expect(formatAxisTick(250, "en-US")).toBe("250");
		expect(formatAxisTick("Mon")).toBe("Mon");
		expect(formatAxisTick(undefined)).toBe("");
	});
});

describe("sparklinePoints", () => {
	test("scales into the box with min at the bottom", () => {
		const { points, last } = sparklinePoints([0, 10], 100, 20, 0);
		expect(points).toBe("0,20 100,0");
		expect(last).toEqual({ x: 100, y: 0 });
	});

	test("constant series draws a centred flat line", () => {
		const { points } = sparklinePoints([5, 5, 5], 100, 20, 0);
		expect(points).toBe("0,10 50,10 100,10");
	});

	test("single sample still produces a visible segment", () => {
		const { points, last } = sparklinePoints([7], 100, 20, 2);
		expect(points).toBe("2,10 98,10");
		expect(last).toEqual({ x: 50, y: 10 });
	});

	test("skips non-finite samples and handles empty input", () => {
		expect(sparklinePoints([Number.NaN], 100, 20).points).toBe("");
		expect(sparklinePoints([], 100, 20).last).toBeNull();
		expect(sparklinePoints([1, Number.NaN, 3], 100, 20, 0).points).toBe(
			"0,20 100,0",
		);
	});
});
