/**
 * Pure helpers behind the Overview dashboard: which KPI tiles show, how they
 * are labelled and formatted, where a click goes, and how the trend charts
 * query and plot `admin.metrics.series`. Kept free of React so the choices
 * are unit-tested (overview.test.ts) instead of only eyeballed.
 */
import type {
	Kpi,
	KpiKey,
	KpiUnit,
} from "@VISP/api/routers/admin/metrics-kpis";
import { formatChartNumber, MISSING_VALUE } from "@VISP/ui/lib/chart-format";
import type { ApiRange, DateRange, RangeInterval } from "../app/date-range";

const DAY_MS = 86_400_000;

/** Signups count towards the first-live rate once they are this old. */
const ACTIVATION_WINDOW_MS = 7 * DAY_MS;

/**
 * `admin.metrics.series` rejects ranges longer than this
 * (`MAX_SERIES_RANGE_DAYS` in packages/api `admin/metrics.ts`); not imported
 * because that module pulls in the database client.
 */
export const MAX_SERIES_RANGE_DAYS = 400;

/** Where the trend charts sit; the active-streamers tile scrolls here. */
export const OVERVIEW_TREND_ID = "overview-trend";

/** What clicking a tile does: scroll within Overview, or open a dashboard. */
export type TileTarget =
	| { kind: "anchor"; id: string }
	| { kind: "route"; to: "/growth" | "/usage" };

export type OverviewTile = {
	key: KpiKey;
	label: string;
	value: number | null;
	/** Display text; set when the raw value alone would mislead (null rate). */
	formattedValue?: string;
	formatValue: (value: number) => string;
	previous: number | null;
	deltaPct: number | null;
	sparkline: number[];
	/** Headline tiles (active streamers, streaming hours) get equal emphasis. */
	headline: boolean;
	target: TileTarget;
};

/** The order tiles render in: the two headline KPIs first. */
export const OVERVIEW_TILE_ORDER: readonly KpiKey[] = [
	"weekly_active_streamers",
	"streaming_hours",
	"signups",
	"signup_to_first_live_rate",
	"sessions_per_streamer",
];

const HEADLINE = new Set<KpiKey>([
	"weekly_active_streamers",
	"streaming_hours",
]);

/**
 * Streamers drill into the Overview trend itself (Growth repeats it), hours
 * into Usage, where hosted spend is read against them; the rest live on
 * Growth (see "Shown on" in docs/admin-kpis.md).
 */
const TARGETS: Record<KpiKey, TileTarget> = {
	weekly_active_streamers: { kind: "anchor", id: OVERVIEW_TREND_ID },
	streaming_hours: { kind: "route", to: "/usage" },
	signups: { kind: "route", to: "/growth" },
	signup_to_first_live_rate: { kind: "route", to: "/growth" },
	sessions_per_streamer: { kind: "route", to: "/growth" },
};

/**
 * The API counts streamers live anywhere in the range, which is WAS only for
 * a 7-day range; a 28-day range counts monthly actives, so "weekly" there
 * would overstate the KPI's definition.
 */
export function activeStreamersLabel(days: number): string {
	return days === 7 ? "Weekly active streamers" : "Active streamers";
}

export function comparisonLabel(range: DateRange): string {
	return range.days === 1
		? "vs previous day"
		: `vs previous ${range.days} days`;
}

/** Formats a KPI value in its unit; percent values are already ×100. */
export function formatKpiValue(unit: KpiUnit, value: number): string {
	switch (unit) {
		case "count":
			return formatChartNumber(value);
		case "hours":
			return `${formatChartNumber(value, { maximumFractionDigits: 1 })} h`;
		case "ratio":
			return formatChartNumber(value, { maximumFractionDigits: 1 });
		case "percent":
			return `${formatChartNumber(value, { maximumFractionDigits: 1 })}%`;
	}
}

/**
 * Text for a null signup → first-live rate. The API's cohort is the range's
 * signups from the data start, minus the last 7 days before the range end
 * (or before now, if the range reaches it), whose signups have not had their
 * full 7 days; the rate is null when that cohort is empty or has no signups.
 * An empty cohort reads as "Maturing" (every signup is still in that last
 * week, so any 7-day range is always maturing); a range ending before
 * tracking started, or a cohort with simply no signups, reads as no data.
 */
export function nullRateText(
	apiRange: Pick<ApiRange, "from" | "to">,
	now: Date,
	dataStart: Date,
): string {
	const from = Math.max(Date.parse(apiRange.from), dataStart.getTime());
	const to = Date.parse(apiRange.to);
	if (to <= dataStart.getTime()) return MISSING_VALUE;
	const cohortEnd = Math.min(to, now.getTime()) - ACTIVATION_WINDOW_MS;
	return cohortEnd <= from ? "Maturing" : MISSING_VALUE;
}

/**
 * Maps `admin.metrics.kpis` tiles to what the Overview renders, in
 * `OVERVIEW_TILE_ORDER`; KPIs the API does not return are skipped.
 */
export function overviewTiles(
	kpis: readonly Kpi[],
	range: DateRange,
	apiRange: Pick<ApiRange, "from" | "to">,
	now: Date,
	dataStart: Date,
): OverviewTile[] {
	const byKey = new Map(kpis.map((kpi) => [kpi.key, kpi]));
	return OVERVIEW_TILE_ORDER.flatMap((key) => {
		const kpi = byKey.get(key);
		if (!kpi) return [];
		const tile: OverviewTile = {
			key,
			label:
				key === "weekly_active_streamers"
					? activeStreamersLabel(range.days)
					: kpi.label,
			value: kpi.value,
			formatValue: (value) => formatKpiValue(kpi.unit, value),
			previous: kpi.previous,
			deltaPct: kpi.deltaPct,
			sparkline: kpi.sparkline,
			headline: HEADLINE.has(key),
			target: TARGETS[key],
		};
		if (key === "signup_to_first_live_rate" && kpi.value == null) {
			tile.formattedValue = nullRateText(apiRange, now, dataStart);
		}
		return [tile];
	});
}

/**
 * The window to ask `admin.metrics.series` for. Live metrics have nothing
 * before the data start (the API clamps there too), so starting there keeps
 * long custom ranges under the series cap; anything still longer keeps its
 * most recent `MAX_SERIES_RANGE_DAYS`. Null when the whole range predates
 * the data start, so no request is made.
 */
export function liveSeriesWindow(
	apiRange: Pick<ApiRange, "from" | "to">,
	dataStart: Date,
): { from: string; to: string } | null {
	const to = Date.parse(apiRange.to);
	const from = Math.max(
		Date.parse(apiRange.from),
		dataStart.getTime(),
		to - MAX_SERIES_RANGE_DAYS * DAY_MS,
	);
	if (from >= to) return null;
	return { from: new Date(from).toISOString(), to: apiRange.to };
}

/** True when the selected range starts before live data was recorded. */
export function startsBeforeData(
	range: Pick<DateRange, "from">,
	dataStart: Date,
): boolean {
	return Date.parse(`${range.from}T00:00:00Z`) < dataStart.getTime();
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});

const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

/** "Data starts Sep 7, 2026". */
export function dataStartNote(dataStart: Date): string {
	return `Data starts ${MONTH_DAY_YEAR.format(dataStart)}`;
}

/** Axis and tooltip label for a bucket start, e.g. "Sep 7". */
export function formatBucket(value: string | number): string {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? String(value) : MONTH_DAY.format(date);
}

export function bucketColumnLabel(interval: RangeInterval): string {
	return interval === "day" ? "Day" : "Week starting";
}

/** One plotted point; `bucket` stays the raw ISO instant for CSV export. */
export type TrendRow = { bucket: string; value: number };

/** Series buckets as chart rows (the overview never segments). */
export function trendRows(
	buckets: readonly { bucket: string; segment?: string; value: number }[],
): TrendRow[] {
	return buckets
		.filter((bucket) => bucket.segment == null)
		.map(({ bucket, value }) => ({ bucket, value }));
}

/** CSV name for a trend chart, e.g. `overview-streaming-hours-2026-09-13-2026-10-10`. */
export function trendExportFilename(
	metric: "weekly_active_streamers" | "streaming_hours",
	range: Pick<DateRange, "from" | "to">,
): string {
	return `overview-${metric.replaceAll("_", "-")}-${range.from}-${range.to}`;
}
