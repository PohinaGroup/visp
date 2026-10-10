import { describe, expect, test } from "bun:test";
import {
	type DateRangeSelection,
	dateRangeToSearch,
	formatDateRange,
	intervalForDays,
	isoWeekStart,
	parseDateRangeSearch,
	parseIsoDate,
	pickDateRangeSearch,
	resolveDateRange,
	selectionOf,
	toApiRange,
} from "./date-range";
import { stringifySearch } from "./search";

/** Saturday, late in the UTC day so a local-time bug would show. */
const NOW = new Date("2026-10-10T23:30:00Z");

function resolve(search: Record<string, unknown>, now = NOW) {
	return resolveDateRange(parseDateRangeSearch(search, now), now);
}

describe("parseIsoDate", () => {
	test("accepts real calendar days", () => {
		expect(parseIsoDate("2026-10-10")).toBe(Date.UTC(2026, 9, 10) / 86_400_000);
		expect(parseIsoDate("2028-02-29")).not.toBeNull();
	});

	test("rejects malformed and impossible dates", () => {
		for (const value of [
			"2026-02-30",
			"2027-02-29",
			"2026-13-01",
			"2026-1-01",
			"2026-10-10T00:00:00Z",
			"",
			"yesterday",
			undefined,
			20261010,
		]) {
			expect(parseIsoDate(value)).toBeNull();
		}
	});
});

describe("window math", () => {
	test("defaults to the last 28 days including today, compared to the previous 28", () => {
		const range = resolve({});
		expect(range).toEqual({
			preset: "28d",
			from: "2026-09-13",
			to: "2026-10-10",
			compare: "previous",
			prevFrom: "2026-08-16",
			prevTo: "2026-09-12",
			interval: "day",
			days: 28,
		});
	});

	test("day presets end today and have their nominal length", () => {
		expect(resolve({ range: "7d" })).toMatchObject({
			from: "2026-10-04",
			to: "2026-10-10",
			days: 7,
			prevFrom: "2026-09-27",
			prevTo: "2026-10-03",
		});
		expect(resolve({ range: "90d" })).toMatchObject({
			from: "2026-07-13",
			to: "2026-10-10",
			days: 90,
			prevFrom: "2026-04-14",
			prevTo: "2026-07-12",
		});
	});

	test("26w starts on a Monday, 25 weeks before the current ISO week", () => {
		const range = resolve({ range: "26w" });
		// Oct 10 2026 is a Saturday; its ISO week starts Monday Oct 5.
		expect(range.from).toBe("2026-04-13");
		expect(new Date(`${range.from}T00:00:00Z`).getUTCDay()).toBe(1);
		expect(range.to).toBe("2026-10-10");
		expect(range.days).toBe(25 * 7 + 6);
		expect(range.interval).toBe("week");
	});

	test("26w on a Monday and on a Sunday", () => {
		const monday = resolve({ range: "26w" }, new Date("2026-10-05T00:00:00Z"));
		expect(monday.from).toBe("2026-04-13");
		expect(monday.days).toBe(25 * 7 + 1);
		const sunday = resolve({ range: "26w" }, new Date("2026-10-11T12:00:00Z"));
		expect(sunday.from).toBe("2026-04-13");
		expect(sunday.days).toBe(26 * 7);
	});

	test("uses the UTC day, not the local one", () => {
		const range = resolve({ range: "7d" }, new Date("2026-10-11T00:00:01Z"));
		expect(range.to).toBe("2026-10-11");
	});

	test("previous window is equal length and ends the day before from", () => {
		for (const search of [
			{},
			{ range: "7d" },
			{ range: "90d" },
			{ range: "26w" },
			{ range: "custom", from: "2026-02-20", to: "2026-03-05" },
		]) {
			const range = resolve(search);
			const from = parseIsoDate(range.from) as number;
			const to = parseIsoDate(range.to) as number;
			const prevFrom = parseIsoDate(range.prevFrom) as number;
			const prevTo = parseIsoDate(range.prevTo) as number;
			expect(prevTo).toBe(from - 1);
			expect(prevTo - prevFrom).toBe(to - from);
		}
	});

	test("isoWeekStart maps every weekday to its Monday", () => {
		const monday = parseIsoDate("2026-10-05") as number;
		for (let offset = 0; offset < 7; offset++) {
			expect(isoWeekStart(monday + offset)).toBe(monday);
		}
		expect(isoWeekStart(monday + 7)).toBe(monday + 7);
		// Before the epoch too (1969-12-29 was a Monday).
		expect(isoWeekStart(-1)).toBe(-3);
	});
});

describe("interval rule", () => {
	test("daily up to 31 days, weekly beyond", () => {
		expect(intervalForDays(1)).toBe("day");
		expect(intervalForDays(31)).toBe("day");
		expect(intervalForDays(32)).toBe("week");
		expect(resolve({ range: "7d" }).interval).toBe("day");
		expect(resolve({ range: "28d" }).interval).toBe("day");
		expect(resolve({ range: "90d" }).interval).toBe("week");
		expect(
			resolve({ range: "custom", from: "2026-08-01", to: "2026-08-31" })
				.interval,
		).toBe("day");
		expect(
			resolve({ range: "custom", from: "2026-08-01", to: "2026-09-01" })
				.interval,
		).toBe("week");
	});
});

describe("URL parsing", () => {
	test("reads custom bounds and compare mode", () => {
		expect(
			parseDateRangeSearch(
				{
					range: "custom",
					from: "2026-09-01",
					to: "2026-09-30",
					compare: "none",
				},
				NOW,
			),
		).toEqual({
			preset: "custom",
			from: "2026-09-01",
			to: "2026-09-30",
			compare: "none",
		});
	});

	test("ignores from/to unless the preset is custom", () => {
		expect(
			parseDateRangeSearch(
				{ range: "7d", from: "2026-01-01", to: "2026-01-02" },
				NOW,
			),
		).toEqual({ preset: "7d", compare: "previous" });
	});

	test("a single-day custom window is valid", () => {
		const range = resolve({
			range: "custom",
			from: "2026-10-01",
			to: "2026-10-01",
		});
		expect(range).toMatchObject({
			from: "2026-10-01",
			to: "2026-10-01",
			days: 1,
			prevFrom: "2026-09-30",
			prevTo: "2026-09-30",
		});
	});

	test("clamps a future custom end to today", () => {
		expect(
			parseDateRangeSearch(
				{ range: "custom", from: "2026-10-01", to: "2026-12-31" },
				NOW,
			),
		).toMatchObject({ from: "2026-10-01", to: "2026-10-10" });
	});

	test("invalid values fall back to defaults", () => {
		const fallback = { preset: "28d", compare: "previous" };
		for (const search of [
			{ range: "1y" },
			{ range: "CUSTOM" },
			{ range: "custom" },
			{ range: "custom", from: "2026-09-01" },
			{ range: "custom", from: "2026-09-31", to: "2026-10-01" },
			{ range: "custom", from: "2026-10-05", to: "2026-10-01" },
			{ range: "custom", from: "2026-11-01", to: "2026-11-05" },
			{ range: "custom", from: "0202-01-01", to: "2026-10-01" },
			{ range: ["7d"] },
		]) {
			expect(parseDateRangeSearch(search, NOW)).toEqual(
				fallback as DateRangeSelection,
			);
		}
		expect(parseDateRangeSearch({ compare: "yes" }, NOW).compare).toBe(
			"previous",
		);
		expect(
			parseDateRangeSearch({ range: "bogus", compare: "none" }, NOW),
		).toEqual({ preset: "28d", compare: "none" });
	});

	test("custom window may be up to MAX_RANGE_DAYS long", () => {
		expect(
			parseDateRangeSearch(
				{ range: "custom", from: "2024-10-09", to: "2026-10-10" },
				NOW,
			).preset,
		).toBe("custom");
		expect(
			parseDateRangeSearch(
				{ range: "custom", from: "2024-10-08", to: "2026-10-10" },
				NOW,
			).preset,
		).toBe("28d");
	});
});

describe("URL serialising", () => {
	test("defaults are omitted from the URL", () => {
		expect(
			stringifySearch(
				dateRangeToSearch({ preset: "28d", compare: "previous" }),
			),
		).toBe("");
	});

	test("non-defaults are written as plain params", () => {
		expect(
			stringifySearch(dateRangeToSearch({ preset: "90d", compare: "none" })),
		).toBe("?range=90d&compare=none");
		expect(
			stringifySearch(
				dateRangeToSearch({
					preset: "custom",
					from: "2026-09-01",
					to: "2026-09-30",
					compare: "previous",
				}),
			),
		).toBe("?range=custom&from=2026-09-01&to=2026-09-30");
	});

	test("leaving custom clears stale bounds when merged over the old search", () => {
		const old = {
			user: "u1",
			range: "custom",
			from: "2026-09-01",
			to: "2026-09-30",
		};
		const merged = {
			...old,
			...dateRangeToSearch({ preset: "7d", compare: "previous" }),
		};
		expect(stringifySearch(merged)).toBe("?user=u1&range=7d");
	});

	test("round-trips through the URL", () => {
		for (const selection of [
			{ preset: "28d", compare: "previous" },
			{ preset: "7d", compare: "none" },
			{ preset: "26w", compare: "previous" },
			{
				preset: "custom",
				from: "2026-01-01",
				to: "2026-02-15",
				compare: "none",
			},
		] as DateRangeSelection[]) {
			const query = stringifySearch(dateRangeToSearch(selection));
			const parsed = Object.fromEntries(new URLSearchParams(query));
			expect(parseDateRangeSearch(parsed, NOW)).toEqual(selection);
			expect(selectionOf(resolveDateRange(selection, NOW))).toEqual(selection);
		}
	});

	test("pickDateRangeSearch keeps only the range keys", () => {
		expect(
			pickDateRangeSearch({
				user: "u1",
				range: "custom",
				from: "2026-09-01",
				to: "2026-09-30",
				compare: "none",
			}),
		).toEqual({
			range: "custom",
			from: "2026-09-01",
			to: "2026-09-30",
			compare: "none",
		});
		expect(pickDateRangeSearch({ user: "u1" })).toEqual({});
	});
});

describe("toApiRange", () => {
	test("half-open UTC instants with compare bounds", () => {
		expect(toApiRange(resolve({}))).toEqual({
			from: "2026-09-13T00:00:00.000Z",
			to: "2026-10-11T00:00:00.000Z",
			interval: "day",
			compareFrom: "2026-08-16T00:00:00.000Z",
			compareTo: "2026-09-13T00:00:00.000Z",
		});
	});

	test("omits compare bounds when comparison is off", () => {
		const api = toApiRange(resolve({ range: "90d", compare: "none" }));
		expect(api).toEqual({
			from: "2026-07-13T00:00:00.000Z",
			to: "2026-10-11T00:00:00.000Z",
			interval: "week",
		});
		expect("compareFrom" in api).toBe(false);
	});

	test("crosses month and year ends", () => {
		const api = toApiRange(
			resolve({ range: "custom", from: "2025-12-01", to: "2025-12-31" }),
		);
		expect(api.to).toBe("2026-01-01T00:00:00.000Z");
		expect(api.compareFrom).toBe("2025-10-31T00:00:00.000Z");
	});
});

describe("formatDateRange", () => {
	test("matches the header copy", () => {
		expect(formatDateRange(resolve({}))).toBe(
			"Sep 13 – Oct 10, 2026 vs Aug 16 – Sep 12",
		);
	});

	test("without comparison", () => {
		expect(formatDateRange(resolve({ compare: "none" }))).toBe(
			"Sep 13 – Oct 10, 2026",
		);
	});

	test("spans across years and single days", () => {
		expect(
			formatDateRange(
				resolve({ range: "custom", from: "2025-12-20", to: "2026-01-16" }),
			),
		).toBe("Dec 20, 2025 – Jan 16, 2026 vs Nov 22 – Dec 19, 2025");
		expect(
			formatDateRange(
				resolve({ range: "custom", from: "2026-01-01", to: "2026-01-01" }),
			),
		).toBe("Jan 1, 2026 vs Dec 31, 2025");
		expect(
			formatDateRange(
				resolve({ range: "custom", from: "2026-10-02", to: "2026-10-02" }),
			),
		).toBe("Oct 2, 2026 vs Oct 1");
	});
});
