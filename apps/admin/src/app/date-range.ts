import { useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSetSearch } from "./search";

/**
 * The global dashboard date range. Every dashboard reads the same window from
 * the URL (`range`, `from`, `to`, `compare`), so a shared link or a reload
 * shows the same numbers, and moving between dashboards keeps the window.
 *
 * All dates are UTC calendar days written as `YYYY-MM-DD`; `to` is inclusive.
 * The API boundary (`toApiRange`) converts to half-open UTC instants.
 */

export const RANGE_PRESETS = ["7d", "28d", "90d", "26w", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const COMPARE_MODES = ["previous", "none"] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

export type RangeInterval = "day" | "week";

/** 28 days is four full weeks, so weekday seasonality cancels out. */
export const DEFAULT_PRESET = "28d" satisfies RangePreset;
export const DEFAULT_COMPARE: CompareMode = "previous";

/** Longest window still charted per day; longer ones are bucketed per week. */
export const MAX_DAILY_INTERVAL_DAYS = 31;

/**
 * Upper bound on a custom window, so a typo such as year 0202 cannot ask the
 * API to scan the whole history.
 */
export const MAX_RANGE_DAYS = 732;

export const PRESET_LABELS: Record<RangePreset, string> = {
	"7d": "Last 7 days",
	"28d": "Last 28 days",
	"90d": "Last 90 days",
	"26w": "Last 26 weeks",
	custom: "Custom",
};

/** Query-string keys owned by the date range. */
export const DATE_RANGE_SEARCH_KEYS = [
	"range",
	"from",
	"to",
	"compare",
] as const;

/** What the URL says, already validated; `from`/`to` only for `custom`. */
export type DateRangeSelection =
	| { preset: Exclude<RangePreset, "custom">; compare: CompareMode }
	| { preset: "custom"; from: string; to: string; compare: CompareMode };

/** A selection resolved against today into concrete inclusive UTC days. */
export interface DateRange {
	preset: RangePreset;
	from: string;
	to: string;
	compare: CompareMode;
	/**
	 * The equal-length window ending the day before `from`. Always computed;
	 * only meant to be queried when `compare` is `previous`.
	 */
	prevFrom: string;
	prevTo: string;
	interval: RangeInterval;
	/** Number of days in the window, both ends included. */
	days: number;
}

/** The range as the admin API takes it: half-open `[from, to)` UTC instants. */
export interface ApiRange {
	from: string;
	to: string;
	interval: RangeInterval;
	compareFrom?: string;
	compareTo?: string;
}

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since the Unix epoch for a `YYYY-MM-DD` string, or null if invalid. */
export function parseIsoDate(value: unknown): number | null {
	if (typeof value !== "string") return null;
	const match = ISO_DATE.exec(value);
	if (!match) return null;
	const [, y, m, d] = match.map(Number) as [number, number, number, number];
	const ms = Date.UTC(y, m - 1, d);
	const date = new Date(ms);
	// Date.UTC rolls Feb 30 over to Mar 2; a round trip rejects such dates.
	if (
		date.getUTCFullYear() !== y ||
		date.getUTCMonth() !== m - 1 ||
		date.getUTCDate() !== d
	) {
		return null;
	}
	return ms / DAY_MS;
}

export function formatIsoDate(day: number): string {
	return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Today's UTC calendar day as a day number. */
export function utcDay(now: Date): number {
	return Math.floor(now.getTime() / DAY_MS);
}

/** The Monday starting the ISO week that contains `day`. */
export function isoWeekStart(day: number): number {
	// 1970-01-01 was a Thursday: shift so Monday is 0.
	const weekday = (((day + 3) % 7) + 7) % 7;
	return day - weekday;
}

export function intervalForDays(days: number): RangeInterval {
	return days <= MAX_DAILY_INTERVAL_DAYS ? "day" : "week";
}

function isPreset(value: unknown): value is RangePreset {
	return (RANGE_PRESETS as readonly unknown[]).includes(value);
}

function isCompareMode(value: unknown): value is CompareMode {
	return (COMPARE_MODES as readonly unknown[]).includes(value);
}

/**
 * Reads the selection from query-string values. Anything unusable falls back
 * to the default rather than erroring, so a stale or hand-edited link still
 * opens a dashboard: an unknown preset becomes `28d`, an unknown compare mode
 * `previous`, and a custom window that is malformed, reversed, entirely in the
 * future, or longer than `MAX_RANGE_DAYS` becomes `28d`. A custom `to` after
 * today is clamped to today.
 */
export function parseDateRangeSearch(
	search: Record<string, unknown>,
	now: Date,
): DateRangeSelection {
	const compare = isCompareMode(search.compare)
		? search.compare
		: DEFAULT_COMPARE;
	const preset = isPreset(search.range) ? search.range : DEFAULT_PRESET;
	if (preset !== "custom") return { preset, compare };

	const today = utcDay(now);
	const from = parseIsoDate(search.from);
	const rawTo = parseIsoDate(search.to);
	if (from === null || rawTo === null) {
		return { preset: DEFAULT_PRESET, compare };
	}
	const to = Math.min(rawTo, today);
	if (from > to || to - from + 1 > MAX_RANGE_DAYS) {
		return { preset: DEFAULT_PRESET, compare };
	}
	return {
		preset,
		from: formatIsoDate(from),
		to: formatIsoDate(to),
		compare,
	};
}

/**
 * The query-string patch for a selection. Defaults map to `undefined` so they
 * are dropped from the URL, and every key is present so applying the patch
 * also clears stale `from`/`to` when leaving `custom`.
 */
export function dateRangeToSearch(
	selection: DateRangeSelection,
): Record<(typeof DATE_RANGE_SEARCH_KEYS)[number], string | undefined> {
	const custom = selection.preset === "custom";
	return {
		range: selection.preset === DEFAULT_PRESET ? undefined : selection.preset,
		from: custom ? selection.from : undefined,
		to: custom ? selection.to : undefined,
		compare:
			selection.compare === DEFAULT_COMPARE ? undefined : selection.compare,
	};
}

/**
 * Only the date-range keys of a search object, for links between dashboards:
 * the window carries over while page-local state (a selected user) does not.
 */
export function pickDateRangeSearch(
	search: Record<string, unknown>,
): Record<string, string> {
	const picked: Record<string, string> = {};
	for (const key of DATE_RANGE_SEARCH_KEYS) {
		const value = search[key];
		if (typeof value === "string" && value) picked[key] = value;
	}
	return picked;
}

/**
 * Concrete days for a selection. Day presets end today and include it, so
 * `28d` on Oct 10 is Sep 13 – Oct 10. `26w` covers 26 ISO weeks: it starts on
 * the Monday 25 weeks before the current week's Monday, so every weekly
 * bucket but the current one is complete.
 */
export function resolveDateRange(
	selection: DateRangeSelection,
	now: Date,
): DateRange {
	const today = utcDay(now);
	let from: number;
	let to = today;
	switch (selection.preset) {
		case "7d":
			from = today - 6;
			break;
		case "28d":
			from = today - 27;
			break;
		case "90d":
			from = today - 89;
			break;
		case "26w":
			from = isoWeekStart(today) - 25 * 7;
			break;
		case "custom":
			// parseDateRangeSearch already validated both bounds.
			from = parseIsoDate(selection.from) ?? today;
			to = parseIsoDate(selection.to) ?? today;
			break;
	}
	const days = to - from + 1;
	return {
		preset: selection.preset,
		from: formatIsoDate(from),
		to: formatIsoDate(to),
		compare: selection.compare,
		prevFrom: formatIsoDate(from - days),
		prevTo: formatIsoDate(from - 1),
		interval: intervalForDays(days),
		days,
	};
}

/** Back from a resolved range to the selection that produces it. */
export function selectionOf(range: DateRange): DateRangeSelection {
	return range.preset === "custom"
		? {
				preset: "custom",
				from: range.from,
				to: range.to,
				compare: range.compare,
			}
		: { preset: range.preset, compare: range.compare };
}

function startOfDayIso(isoDate: string): string {
	return `${isoDate}T00:00:00.000Z`;
}

function endExclusiveIso(isoDate: string): string {
	const day = parseIsoDate(isoDate);
	if (day === null) throw new Error(`Invalid ISO date: ${isoDate}`);
	return startOfDayIso(formatIsoDate(day + 1));
}

/**
 * The range in the shape admin metric endpoints take. Bounds are half-open
 * UTC instants (`from` inclusive, `to` exclusive at the next midnight), which
 * maps directly to `ts >= from and ts < to` and to `date_trunc` buckets.
 * Compare bounds are only present when comparison is on.
 */
export function toApiRange(range: DateRange): ApiRange {
	const api: ApiRange = {
		from: startOfDayIso(range.from),
		to: endExclusiveIso(range.to),
		interval: range.interval,
	};
	if (range.compare === "previous") {
		api.compareFrom = startOfDayIso(range.prevFrom);
		api.compareTo = endExclusiveIso(range.prevTo);
	}
	return api;
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});

function formatSpan(fromIso: string, toIso: string, showYear: boolean) {
	const from = new Date(startOfDayIso(fromIso));
	const to = new Date(startOfDayIso(toIso));
	const fromYear = from.getUTCFullYear();
	const toYear = to.getUTCFullYear();
	const end = showYear ? `${MONTH_DAY.format(to)}, ${toYear}` : "";
	if (fromIso === toIso) return showYear ? end : MONTH_DAY.format(from);
	if (fromYear !== toYear) {
		return `${MONTH_DAY.format(from)}, ${fromYear} – ${MONTH_DAY.format(to)}, ${toYear}`;
	}
	return `${MONTH_DAY.format(from)} – ${showYear ? end : MONTH_DAY.format(to)}`;
}

/**
 * Human text for a range, e.g. "Sep 13 – Oct 10, 2026 vs Aug 16 – Sep 12".
 * The comparison omits its year when it ends in the same year as the range.
 */
export function formatDateRange(range: DateRange): string {
	const main = formatSpan(range.from, range.to, true);
	if (range.compare !== "previous") return main;
	const sameYear = range.prevTo.slice(0, 4) === range.to.slice(0, 4);
	return `${main} vs ${formatSpan(range.prevFrom, range.prevTo, !sameYear)}`;
}

/**
 * The current instant, re-read just after each UTC midnight. Held in state
 * rather than read during render so memoised renders (React Compiler) cannot
 * keep yesterday's window on a console left open overnight.
 */
export function useUtcNow(): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const nextMidnight = (utcDay(now) + 1) * DAY_MS;
		const timer = setTimeout(
			() => setNow(new Date()),
			nextMidnight - Date.now() + 1000,
		);
		return () => clearTimeout(timer);
	}, [now]);
	return now;
}

/** The dashboard range from the URL, resolved against the current UTC day. */
export function useDateRange(): DateRange {
	const search: Record<string, unknown> = useSearch({ strict: false });
	const now = useUtcNow();
	return resolveDateRange(parseDateRangeSearch(search, now), now);
}

/** Writes a new selection to the URL in one navigation. */
export function useSetDateRange(): (selection: DateRangeSelection) => void {
	const setSearch = useSetSearch();
	return (selection) => setSearch(dateRangeToSearch(selection));
}
