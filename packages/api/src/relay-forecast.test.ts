import { describe, expect, test } from "bun:test";
import {
	type DailyPeak,
	forecastRelayCapacity,
	RELAY_FORECAST_METHOD,
} from "./relay-forecast";

const DAY = 24 * 60 * 60 * 1000;
const asOf = new Date("2026-10-10T00:00:00Z");
/** Peaks for the `values.length` days ending the day before `asOf`. */
function daily(values: readonly (number | null)[]): DailyPeak[] {
	return values.map((peak, index) => ({
		day: new Date(asOf.getTime() - (values.length - index) * DAY),
		peak,
	}));
}

describe("forecastRelayCapacity", () => {
	test("exact slope and weeks for a perfect line", () => {
		// 1 path per day = 7 per week, 21 days, last 7 days peak at 30.
		const values = Array.from({ length: 21 }, (_, index) => 10 + index);
		const forecast = forecastRelayCapacity({
			peaks: daily(values),
			capacity: 100,
			asOf,
		});
		expect(forecast.slopePerWeek).toBeCloseTo(7, 10);
		expect(forecast.currentPeak).toBe(30);
		expect(forecast.weeksTo80Pct).toBeCloseTo(50 / 7, 10);
		expect(forecast.weeksTo100Pct).toBeCloseTo(70 / 7, 10);
		expect(forecast.rSquared).toBeCloseTo(1, 10);
		expect(forecast.points).toBe(21);
		expect(forecast.confidence).toBe("ok");
		expect(forecast.method).toBe(RELAY_FORECAST_METHOD);
	});

	test("matches a hand-computed OLS fit on noisy points", () => {
		// x = 0..6 days, y = 2,4,3,6,5,8,7 (mean 5):
		// Sxy = 25, Sxx = 28, Syy = 28 -> 25/28 per day, R² = 625 / 784.
		const forecast = forecastRelayCapacity({
			peaks: daily([2, 4, 3, 6, 5, 8, 7]),
			capacity: 20,
			asOf,
		});
		expect(forecast.slopePerWeek).toBeCloseTo((25 / 28) * 7, 10);
		expect(forecast.rSquared).toBeCloseTo(625 / 784, 10);
		expect(forecast.currentPeak).toBe(8);
		expect(forecast.weeksTo80Pct).toBeCloseTo((16 - 8) / 6.25, 10);
		// 7 points is enough to forecast but not to trust.
		expect(forecast.confidence).toBe("low");
	});

	test("days without samples are skipped, not treated as zero", () => {
		// Same line as the first test with every third day missing.
		const values = Array.from({ length: 21 }, (_, index) =>
			index % 3 === 1 ? null : 10 + index,
		);
		const peaks = daily(values).filter((_, index) => index % 3 !== 2);
		const forecast = forecastRelayCapacity({ peaks, capacity: 100, asOf });
		expect(forecast.points).toBe(7);
		expect(forecast.slopePerWeek).toBeCloseTo(7, 10);
	});

	test("fewer than 7 points gives no forecast but still a current peak", () => {
		const forecast = forecastRelayCapacity({
			peaks: daily([1, 2, 3, 4, 5, 6]),
			capacity: 10,
			asOf,
		});
		expect(forecast).toMatchObject({
			slopePerWeek: null,
			currentPeak: 6,
			weeksTo80Pct: null,
			weeksTo100Pct: null,
			confidence: "low",
			rSquared: null,
			points: 6,
		});
		expect(
			forecastRelayCapacity({ peaks: [], capacity: 10, asOf }),
		).toMatchObject({ currentPeak: null, points: 0, slopePerWeek: null });
	});

	test("flat or falling trends never reach a threshold", () => {
		const flat = forecastRelayCapacity({
			peaks: daily(Array(14).fill(5)),
			capacity: 10,
			asOf,
		});
		expect(flat.slopePerWeek).toBe(0);
		expect(flat.weeksTo80Pct).toBeNull();
		expect(flat.weeksTo100Pct).toBeNull();
		// A flat line explains a flat series perfectly.
		expect(flat.rSquared).toBe(1);
		expect(flat.confidence).toBe("ok");

		const falling = forecastRelayCapacity({
			peaks: daily(Array.from({ length: 14 }, (_, index) => 20 - index)),
			capacity: 10,
			asOf,
		});
		expect(falling.slopePerWeek).toBeCloseTo(-7, 10);
		expect(falling.weeksTo80Pct).toBeNull();
	});

	test("already above a threshold returns null for it", () => {
		// Rising to 9 of 10: past 80 %, not yet at 100 %.
		const forecast = forecastRelayCapacity({
			peaks: daily([3, 4, 5, 6, 7, 8, 9]),
			capacity: 10,
			asOf,
		});
		expect(forecast.currentPeak).toBe(9);
		expect(forecast.weeksTo80Pct).toBeNull();
		expect(forecast.weeksTo100Pct).toBeCloseTo(1 / 7, 10);
		const full = forecastRelayCapacity({
			peaks: daily([5, 6, 7, 8, 9, 10, 11]),
			capacity: 10,
			asOf,
		});
		expect(full.weeksTo100Pct).toBeNull();
	});

	test("no capacity means no thresholds", () => {
		const forecast = forecastRelayCapacity({
			peaks: daily([0, 1, 2, 3, 4, 5, 6]),
			capacity: 0,
			asOf,
		});
		expect(forecast.slopePerWeek).toBeCloseTo(7, 10);
		expect(forecast.weeksTo80Pct).toBeNull();
		expect(forecast.weeksTo100Pct).toBeNull();
	});

	test("confidence is low when the line explains little of the variance", () => {
		// Zig-zag with a slight upward drift over 28 days.
		const values = Array.from(
			{ length: 28 },
			(_, index) => (index % 2 ? 20 : 0) + index * 0.05,
		);
		const forecast = forecastRelayCapacity({
			peaks: daily(values),
			capacity: 100,
			asOf,
		});
		expect(forecast.points).toBe(28);
		expect(forecast.rSquared ?? 1).toBeLessThan(0.3);
		expect(forecast.confidence).toBe("low");
	});

	test("only the window before asOf counts; duplicate days keep the max", () => {
		const peaks: DailyPeak[] = [
			// 40 days ago: outside a 28-day window, would flatten the slope.
			{ day: new Date(asOf.getTime() - 40 * DAY), peak: 500 },
			// Today (partial): excluded.
			{ day: asOf, peak: 0 },
			...daily([1, 2, 3, 4, 5, 6, 7]),
			// Same day as the last point, written as an ISO string mid-day.
			{ day: new Date(asOf.getTime() - DAY / 2).toISOString(), peak: 3 },
		];
		const forecast = forecastRelayCapacity({ peaks, capacity: 100, asOf });
		expect(forecast.points).toBe(7);
		expect(forecast.slopePerWeek).toBeCloseTo(7, 10);
		expect(forecast.currentPeak).toBe(7);
	});

	test("current peak is the highest of the last 7 days, not the last day", () => {
		// Weekend spike five days ago above a gentle trend.
		const values = [1, 1, 2, 2, 2, 3, 3, 3, 9, 3, 4, 4, 4, 4];
		const forecast = forecastRelayCapacity({
			peaks: daily(values),
			capacity: 100,
			asOf,
		});
		expect(forecast.currentPeak).toBe(9);
		expect(forecast.weeksTo80Pct).toBeCloseTo(
			(80 - 9) / (forecast.slopePerWeek ?? 1),
			10,
		);
	});
});
