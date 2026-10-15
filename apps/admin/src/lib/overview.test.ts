import type { Kpi } from "@VISP/api/routers/admin/metrics-kpis";
import { describe, expect, test } from "bun:test";
import {
	type DateRange,
	parseDateRangeSearch,
	resolveDateRange,
	toApiRange,
} from "../app/date-range";
import {
	activeStreamersLabel,
	comparisonLabel,
	dataStartNote,
	formatBucket,
	formatKpiValue,
	liveSeriesWindow,
	MAX_SERIES_RANGE_DAYS,
	nullRateText,
	OVERVIEW_TREND_ID,
	overviewTiles,
	startsBeforeData,
	trendExportFilename,
	trendRows,
} from "./overview";

const NOW = new Date("2026-10-10T12:00:00Z");
const DATA_START = new Date("2026-09-07T00:00:00Z");
const DAY_MS = 86_400_000;

function rangeOf(search: Record<string, unknown>): DateRange {
	return resolveDateRange(parseDateRangeSearch(search, NOW), NOW);
}

function kpi(key: Kpi["key"], overrides: Partial<Kpi> = {}): Kpi {
	const meta: Record<Kpi["key"], Pick<Kpi, "label" | "unit">> = {
		weekly_active_streamers: { label: "Active streamers", unit: "count" },
		streaming_hours: { label: "Streaming hours", unit: "hours" },
		signups: { label: "Signups", unit: "count" },
		signup_to_first_live_rate: {
			label: "Signup → first stream (7 days)",
			unit: "percent",
		},
		sessions_per_streamer: { label: "Sessions per streamer", unit: "ratio" },
	};
	return {
		key,
		...meta[key],
		value: 10,
		previous: 8,
		deltaPct: 25,
		sparkline: [1, 2, 3],
		...overrides,
	};
}

/** Deliberately not in display order: the tile order must not depend on it. */
const ALL_KPIS: Kpi[] = [
	kpi("sessions_per_streamer", { value: 2.25 }),
	kpi("signups"),
	kpi("signup_to_first_live_rate", { value: 42.5 }),
	kpi("streaming_hours", { value: 123.45 }),
	kpi("weekly_active_streamers"),
];

describe("activeStreamersLabel", () => {
	test("says weekly only for a 7-day range", () => {
		expect(activeStreamersLabel(7)).toBe("Weekly active streamers");
		for (const days of [1, 6, 8, 28, 90, 182]) {
			expect(activeStreamersLabel(days)).toBe("Active streamers");
		}
	});

	test("follows the resolved range, including a 7-day custom one", () => {
		expect(activeStreamersLabel(rangeOf({ range: "7d" }).days)).toBe(
			"Weekly active streamers",
		);
		expect(activeStreamersLabel(rangeOf({}).days)).toBe("Active streamers");
		const custom = rangeOf({
			range: "custom",
			from: "2026-09-21",
			to: "2026-09-27",
		});
		expect(activeStreamersLabel(custom.days)).toBe("Weekly active streamers");
	});
});

describe("comparisonLabel", () => {
	test("names the previous window's length", () => {
		expect(comparisonLabel(rangeOf({}))).toBe("vs previous 28 days");
		expect(
			comparisonLabel(
				rangeOf({ range: "custom", from: "2026-10-01", to: "2026-10-01" }),
			),
		).toBe("vs previous day");
	});
});

describe("formatKpiValue", () => {
	test("formats each unit", () => {
		expect(formatKpiValue("count", 42)).toBe("42");
		expect(formatKpiValue("hours", 123.45)).toBe("123.5 h");
		expect(formatKpiValue("ratio", 2.25)).toBe("2.3");
		// Percent values arrive already multiplied by 100.
		expect(formatKpiValue("percent", 42.5)).toBe("42.5%");
	});
});

describe("nullRateText", () => {
	test("is Maturing while every signup in range is younger than 7 days", () => {
		const range = toApiRange(rangeOf({ range: "7d" }));
		expect(nullRateText(range, NOW, DATA_START)).toBe("Maturing");
	});

	test("is Maturing when the tracked part is all within the last 7 days", () => {
		// Tracked signups are Sep 7–12, all in the 7 days before the range end.
		const range = {
			from: "2026-08-01T00:00:00.000Z",
			to: "2026-09-13T00:00:00.000Z",
		};
		expect(nullRateText(range, NOW, DATA_START)).toBe("Maturing");
	});

	test("is no data when a mature cohort simply had no signups", () => {
		// Sep 7 – Oct 3 is a non-empty cohort, so a null there means no signups.
		const range = {
			from: "2026-08-01T00:00:00.000Z",
			to: "2026-10-11T00:00:00.000Z",
		};
		expect(nullRateText(range, NOW, DATA_START)).toBe("—");
		// Five days after tracking started the same range is still maturing.
		const earlyNow = new Date(DATA_START.getTime() + 5 * DAY_MS);
		expect(nullRateText(range, earlyNow, DATA_START)).toBe("Maturing");
	});

	test("is no data for a range wholly before tracking started", () => {
		const range = {
			from: "2026-07-01T00:00:00.000Z",
			to: "2026-09-01T00:00:00.000Z",
		};
		expect(nullRateText(range, NOW, DATA_START)).toBe("—");
	});
});

describe("overviewTiles", () => {
	const range = rangeOf({});
	const apiRange = toApiRange(range);

	test("puts the two headline KPIs first, then the supporting three", () => {
		const tiles = overviewTiles(ALL_KPIS, range, apiRange, NOW, DATA_START);
		expect(tiles.map((tile) => tile.key)).toEqual([
			"weekly_active_streamers",
			"streaming_hours",
			"signups",
			"signup_to_first_live_rate",
			"sessions_per_streamer",
		]);
		expect(tiles.map((tile) => tile.headline)).toEqual([
			true,
			true,
			false,
			false,
			false,
		]);
	});

	test("maps values, deltas, sparklines and click targets", () => {
		const tiles = overviewTiles(ALL_KPIS, range, apiRange, NOW, DATA_START);
		const byKey = Object.fromEntries(tiles.map((tile) => [tile.key, tile]));
		expect(byKey.weekly_active_streamers?.label).toBe("Active streamers");
		expect(byKey.weekly_active_streamers?.target).toEqual({
			kind: "anchor",
			id: OVERVIEW_TREND_ID,
		});
		expect(byKey.streaming_hours?.target).toEqual({
			kind: "route",
			to: "/usage",
		});
		for (const key of [
			"signups",
			"signup_to_first_live_rate",
			"sessions_per_streamer",
		]) {
			expect(byKey[key]?.target).toEqual({ kind: "route", to: "/growth" });
		}
		const hours = byKey.streaming_hours;
		expect(hours?.value).toBe(123.45);
		expect(hours?.previous).toBe(8);
		expect(hours?.deltaPct).toBe(25);
		expect(hours?.sparkline).toEqual([1, 2, 3]);
		expect(hours?.formatValue(123.45)).toBe("123.5 h");
		expect(hours?.formattedValue).toBeUndefined();
		expect(byKey.signup_to_first_live_rate?.formatValue(42.5)).toBe("42.5%");
	});

	test("labels the streamers tile weekly for a 7-day range", () => {
		const week = rangeOf({ range: "7d" });
		const [first] = overviewTiles(
			ALL_KPIS,
			week,
			toApiRange(week),
			NOW,
			DATA_START,
		);
		expect(first?.label).toBe("Weekly active streamers");
	});

	test("shows Maturing for a null rate whose cohort is still young", () => {
		const week = rangeOf({ range: "7d" });
		const kpis = ALL_KPIS.map((entry) =>
			entry.key === "signup_to_first_live_rate"
				? { ...entry, value: null, deltaPct: null }
				: entry,
		);
		const rate = overviewTiles(
			kpis,
			week,
			toApiRange(week),
			NOW,
			DATA_START,
		).find((tile) => tile.key === "signup_to_first_live_rate");
		expect(rate?.value).toBeNull();
		expect(rate?.formattedValue).toBe("Maturing");
	});

	test("skips KPIs the API did not return", () => {
		const tiles = overviewTiles(
			[kpi("signups")],
			range,
			apiRange,
			NOW,
			DATA_START,
		);
		expect(tiles.map((tile) => tile.key)).toEqual(["signups"]);
	});
});

describe("liveSeriesWindow", () => {
	test("starts at the data start for an earlier range", () => {
		const range = toApiRange(rangeOf({ range: "90d" }));
		expect(liveSeriesWindow(range, DATA_START)).toEqual({
			from: DATA_START.toISOString(),
			to: range.to,
		});
	});

	test("keeps a range inside the data unchanged", () => {
		const range = toApiRange(rangeOf({}));
		expect(liveSeriesWindow(range, DATA_START)).toEqual({
			from: range.from,
			to: range.to,
		});
	});

	test("keeps the most recent days of a range longer than the API cap", () => {
		const to = "2028-10-01T00:00:00.000Z";
		const window = liveSeriesWindow(
			{ from: "2026-10-01T00:00:00.000Z", to },
			DATA_START,
		);
		expect(window?.to).toBe(to);
		expect(Date.parse(to) - Date.parse(window?.from ?? "")).toBe(
			MAX_SERIES_RANGE_DAYS * DAY_MS,
		);
	});

	test("is null for a range wholly before the data start", () => {
		expect(
			liveSeriesWindow(
				{ from: "2026-08-01T00:00:00.000Z", to: "2026-09-07T00:00:00.000Z" },
				DATA_START,
			),
		).toBeNull();
	});
});

describe("data start note", () => {
	test("shows only when the range starts before the data", () => {
		expect(startsBeforeData(rangeOf({ range: "90d" }), DATA_START)).toBe(true);
		expect(startsBeforeData(rangeOf({}), DATA_START)).toBe(false);
		expect(startsBeforeData({ from: "2026-09-07" }, DATA_START)).toBe(false);
		expect(startsBeforeData({ from: "2026-09-06" }, DATA_START)).toBe(true);
	});

	test("reads as the task's wording", () => {
		expect(dataStartNote(DATA_START)).toBe("Data starts Sep 7, 2026");
	});
});

describe("trend chart helpers", () => {
	test("rows keep raw ISO buckets and drop segmented rows", () => {
		expect(
			trendRows([
				{ bucket: "2026-09-07T00:00:00.000Z", value: 3 },
				{ bucket: "2026-09-08T00:00:00.000Z", segment: "google", value: 1 },
			]),
		).toEqual([{ bucket: "2026-09-07T00:00:00.000Z", value: 3 }]);
	});

	test("formats bucket labels in UTC", () => {
		expect(formatBucket("2026-09-07T00:00:00.000Z")).toBe("Sep 7");
		expect(formatBucket("not a date")).toBe("not a date");
	});

	test("names CSV exports by metric and range", () => {
		expect(
			trendExportFilename("streaming_hours", {
				from: "2026-09-13",
				to: "2026-10-10",
			}),
		).toBe("overview-streaming-hours-2026-09-13-2026-10-10");
	});
});
