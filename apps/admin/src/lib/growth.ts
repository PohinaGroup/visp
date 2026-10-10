import type { ChartSeries } from "@VISP/ui/components/charts";
import type { trpc } from "../lib";

/**
 * Pure helpers behind the Growth page: segment URL state, funnel conversion
 * maths, signup stacking and the retention heatmap's shading. Kept free of
 * React so the numbers the page shows are the numbers the tests check.
 */

export type FunnelResult = Awaited<
	ReturnType<typeof trpc.admin.growth.funnel.query>
>;
export type FunnelSegmentResult = FunnelResult["segments"][number];
export type FunnelStageCount = FunnelSegmentResult["stages"][number];
export type RetentionResult = Awaited<
	ReturnType<typeof trpc.admin.growth.retention.query>
>;
export type RetentionCohort = RetentionResult["cohorts"][number];
export type TimeToFirstLiveResult = Awaited<
	ReturnType<typeof trpc.admin.growth.timeToFirstLive.query>
>;
export type SeriesResult = Awaited<
	ReturnType<typeof trpc.admin.metrics.series.query>
>;

// ---------------------------------------------------------------------------
// Segment filter (`?segment=`)
// ---------------------------------------------------------------------------

/** Mirrors `FUNNEL_SEGMENTS` in `packages/api/src/routers/admin/growth.ts`. */
export const GROWTH_SEGMENTS = [
	"none",
	"provider",
	"use_case",
	"publisher",
	"destination",
] as const;
export type GrowthSegment = (typeof GROWTH_SEGMENTS)[number];

export const SEGMENT_SEARCH_KEY = "segment";

export const SEGMENT_LABELS: Record<GrowthSegment, string> = {
	none: "None",
	provider: "Signup provider",
	use_case: "Use case",
	publisher: "Publisher",
	destination: "Destination",
};

/**
 * Reads `?segment=`. Anything unknown (a stale or hand-edited link) falls
 * back to no segment rather than an error, like the date range does.
 */
export function parseSegment(raw: unknown): GrowthSegment {
	return (GROWTH_SEGMENTS as readonly unknown[]).includes(raw)
		? (raw as GrowthSegment)
		: "none";
}

/** The URL value for a segment; the default is dropped from the URL. */
export function segmentToSearch(segment: GrowthSegment): string | undefined {
	return segment === "none" ? undefined : segment;
}

const VALUE_LABELS: Record<string, string> = {
	all: "All signups",
	not_selected: "Not selected",
	unknown: "Unknown",
	credential: "Email",
	google: "Google",
	twitch: "Twitch",
	kick: "Kick",
	youtube: "YouTube",
	obs: "OBS",
	visp: "VISP",
	larix: "Larix",
	moblin: "Moblin",
	direct: "Direct",
	phone_to_obs: "Phone to OBS",
	remote_guest: "Remote guest",
	multi_cam: "Multi-cam",
	other: "Other",
};

/** Display name for a provider id or onboarding answer. */
export function segmentValueLabel(value: string): string {
	const known = VALUE_LABELS[value];
	if (known) return known;
	const words = value.replace(/[_-]+/g, " ").trim();
	return words ? words[0]?.toUpperCase() + words.slice(1) : value;
}

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** `MAX_SERIES_RANGE_DAYS` on the API: longer custom windows are refused. */
export const MAX_GROWTH_RANGE_DAYS = 400;

/**
 * Keeps the newest `maxDays` of a half-open range, so a long custom window
 * (the date control allows up to two years) still charts instead of erroring.
 */
export function clampRange(
	range: { from: string; to: string },
	maxDays = MAX_GROWTH_RANGE_DAYS,
): { from: string; to: string; clamped: boolean } {
	const to = Date.parse(range.to);
	const earliest = to - maxDays * DAY_MS;
	if (Date.parse(range.from) >= earliest) return { ...range, clamped: false };
	return {
		from: new Date(earliest).toISOString(),
		to: range.to,
		clamped: true,
	};
}

/**
 * Weeks of retention cohorts for a range: its length in weeks, but at least
 * 8 (a 7-day range would otherwise show one cohort) and at most the API's 26.
 */
export function retentionWeeks(days: number): number {
	return Math.min(26, Math.max(8, Math.ceil(days / 7)));
}

/** True when the range reaches back before live tracking began. */
export function startsBeforeData(
	from: string,
	dataStart: string | undefined,
): boolean {
	return dataStart !== undefined && Date.parse(from) < Date.parse(dataStart);
}

// ---------------------------------------------------------------------------
// Activation funnel
// ---------------------------------------------------------------------------

export const STAGE_LABELS: Record<FunnelStageCount["stage"], string> = {
	signup: "Signed up",
	device_created: "Created a device",
	first_live: "Went live in 7 days",
	week2_return: "Returned in week 2",
	first_live_any: "Went live (any time)",
};

/**
 * A stage's conversion. Only users whose window has closed are judged, so the
 * rate is `count / observedCount` and never diluted by users who may still
 * get there; `unobserved` is how many of the base are still maturing.
 */
export function stageConversion(stage: {
	count: number;
	cohortCount: number;
	observedCount: number;
}): { rate: number | null; unobserved: number } {
	return {
		rate: stage.observedCount > 0 ? stage.count / stage.observedCount : null,
		unobserved: Math.max(0, stage.cohortCount - stage.observedCount),
	};
}

export type FunnelRow = {
	stage: FunnelStageCount["stage"];
	label: string;
	count: number;
	cohortCount: number;
	observedCount: number;
	/** Bar length: `count` against the first stage, 0–1. */
	share: number;
	/** `count / observedCount`; null when nobody is observed yet. */
	conversion: number | null;
	unobserved: number;
};

/** One funnel's rows, bars proportional to the first stage. */
export function funnelRows(segment: FunnelSegmentResult): FunnelRow[] {
	const first = segment.stages[0]?.count ?? 0;
	return segment.stages.map((stage) => {
		const { rate, unobserved } = stageConversion(stage);
		return {
			stage: stage.stage,
			label: STAGE_LABELS[stage.stage],
			count: stage.count,
			cohortCount: stage.cohortCount,
			observedCount: stage.observedCount,
			share: first > 0 ? Math.min(1, stage.count / first) : 0,
			conversion: rate,
			unobserved,
		};
	});
}

export const OTHER_SEGMENT = "__other";

function addStage<T extends FunnelStageCount>(a: T, b: T): T {
	return {
		...a,
		count: a.count + b.count,
		cohortCount: a.cohortCount + b.cohortCount,
		observedCount: a.observedCount + b.observedCount,
	};
}

/**
 * The `top` largest segments (the API already orders by signups) plus one
 * `__other` segment summing the rest. Every count is additive per user, so
 * the sum is exactly the funnel of the folded users.
 */
export function foldSegments(
	segments: readonly FunnelSegmentResult[],
	top = 5,
): FunnelSegmentResult[] {
	if (segments.length <= top + 1) return [...segments];
	const kept = segments.slice(0, top);
	const rest = segments.slice(top);
	const [head, ...tail] = rest as [
		FunnelSegmentResult,
		...FunnelSegmentResult[],
	];
	const other = tail.reduce<FunnelSegmentResult>(
		(sum, segment) => ({
			segment: OTHER_SEGMENT,
			stages: sum.stages.map((stage, index) => {
				const next = segment.stages[index];
				return next ? addStage(stage, next) : stage;
			}),
			firstLiveAny: addStage(sum.firstLiveAny, segment.firstLiveAny),
		}),
		{ ...head, segment: OTHER_SEGMENT },
	);
	return [...kept, other];
}

export function funnelSegmentLabel(segment: string): string {
	return segment === OTHER_SEGMENT ? "Other" : segmentValueLabel(segment);
}

/** True when there is nothing to draw (no signups in any segment). */
export function isFunnelEmpty(segments: readonly FunnelSegmentResult[]) {
	return !segments.some((segment) => (segment.stages[0]?.count ?? 0) > 0);
}

/** Flat rows for the funnel CSV: one per segment and stage. */
export function funnelCsvRows(segments: readonly FunnelSegmentResult[]) {
	return segments.flatMap((segment) =>
		[...segment.stages, segment.firstLiveAny].map((stage) => ({
			segment: funnelSegmentLabel(segment.segment),
			stage: STAGE_LABELS[stage.stage],
			count: stage.count,
			cohortCount: stage.cohortCount,
			observedCount: stage.observedCount,
			conversion: stageConversion(stage).rate,
		})),
	);
}

// ---------------------------------------------------------------------------
// Signups over time
// ---------------------------------------------------------------------------

export type SignupRow = { bucket: string } & Record<string, number | string>;

/**
 * Pivots `admin.metrics.series` provider buckets into one row per bucket for
 * a stacked chart. The `top` providers by total in the range keep their own
 * series (largest at the bottom of the stack); the rest fold into "Other",
 * which takes the muted ink instead of a sixth hue.
 */
export function signupStack(
	buckets: readonly { bucket: string; segment?: string; value: number }[],
	top = 5,
): { rows: SignupRow[]; series: ChartSeries[] } {
	const totals = new Map<string, number>();
	for (const b of buckets) {
		const key = b.segment ?? "all";
		totals.set(key, (totals.get(key) ?? 0) + b.value);
	}
	const ranked = [...totals.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([key]) => key);
	const fold = ranked.length > top + 1;
	const kept = fold ? ranked.slice(0, top) : ranked;
	const keyOf = (segment: string) =>
		kept.includes(segment) ? `p_${segment}` : OTHER_SEGMENT;
	const series: ChartSeries[] = kept.map((segment) => ({
		key: `p_${segment}`,
		label: segmentValueLabel(segment),
	}));
	if (fold) {
		series.push({
			key: OTHER_SEGMENT,
			label: "Other",
			color: "var(--muted-foreground)",
		});
	}

	const byBucket = new Map<string, SignupRow>();
	for (const b of buckets) {
		let row = byBucket.get(b.bucket);
		if (!row) {
			row = { bucket: b.bucket };
			for (const s of series) row[s.key] = 0;
			byBucket.set(b.bucket, row);
		}
		const key = keyOf(b.segment ?? "all");
		row[key] = Number(row[key] ?? 0) + b.value;
	}
	const rows = [...byBucket.values()].sort((a, b) =>
		a.bucket.localeCompare(b.bucket),
	);
	return { rows, series };
}

// ---------------------------------------------------------------------------
// Retention heatmap
// ---------------------------------------------------------------------------

/**
 * Shading steps for retention cells, lower bound inclusive. Fixed buckets
 * rather than a continuous scale so the legend can name each step and
 * neighbouring cells that look alike really are in the same band. Week 0 is
 * always 100 %, so the top band starts at 60 % to leave room below it.
 * Opacity tops out at 0.75 so foreground text keeps ≥ 4.5:1 contrast on the
 * fill in both themes.
 */
export const HEATMAP_BUCKETS = [
	{ min: 0, label: "0%", opacity: 0 },
	{ min: Number.MIN_VALUE, label: "<5%", opacity: 0.08 },
	{ min: 0.05, label: "5–10%", opacity: 0.16 },
	{ min: 0.1, label: "10–20%", opacity: 0.28 },
	{ min: 0.2, label: "20–40%", opacity: 0.42 },
	{ min: 0.4, label: "40–60%", opacity: 0.58 },
	{ min: 0.6, label: "≥60%", opacity: 0.75 },
] as const;

/** Index into `HEATMAP_BUCKETS`, or null for a blank (unobserved) cell. */
export function heatmapBucket(value: number | null): number | null {
	if (value === null || !Number.isFinite(value)) return null;
	for (let i = HEATMAP_BUCKETS.length - 1; i >= 0; i--) {
		const bucket = HEATMAP_BUCKETS[i];
		if (bucket && value >= bucket.min) return i;
	}
	return 0;
}

/** The cell fill: the theme's first chart hue at the bucket's opacity. */
export function heatmapFill(value: number | null): string | undefined {
	const index = heatmapBucket(value);
	if (index === null) return undefined;
	const opacity = HEATMAP_BUCKETS[index]?.opacity ?? 0;
	if (opacity === 0) return undefined;
	return `color-mix(in oklab, var(--chart-1) ${Math.round(opacity * 100)}%, transparent)`;
}

/**
 * Week offsets worth a column: up to the last offset any cohort has observed.
 * The API returns `weeks` offsets for every row, but past the oldest cohort's
 * age they are all null and only widen the table. Offset 0 always shows.
 */
export function heatmapOffsets(cohorts: readonly RetentionCohort[]): number[] {
	let last = 0;
	for (const cohort of cohorts) {
		for (const cell of cohort.cells) {
			if (cell.count !== null && cell.offset > last) last = cell.offset;
		}
	}
	return Array.from({ length: last + 1 }, (_, offset) => offset);
}

/** Flat rows for the retention CSV: cohort, size, then one share per week. */
export function retentionCsvRows(cohorts: readonly RetentionCohort[]) {
	const offsets = heatmapOffsets(cohorts);
	return {
		offsets,
		rows: cohorts.map((cohort) => {
			const row: Record<string, string | number | null> = {
				cohort: cohort.cohort.slice(0, 10),
				size: cohort.size,
			};
			for (const offset of offsets) {
				row[`week${offset}`] =
					cohort.cells.find((cell) => cell.offset === offset)?.value ?? null;
			}
			return row;
		}),
	};
}

// ---------------------------------------------------------------------------
// Time to first live
// ---------------------------------------------------------------------------

/** Hours as "45 min", "5.2 h" or "3.1 d", whichever reads naturally. */
export function formatHours(hours: number): string {
	if (hours < 1) return `${Math.round(hours * 60)} min`;
	if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
	return `${Math.round((hours / 24) * 10) / 10} d`;
}

export function timeToFirstLiveRows(data: TimeToFirstLiveResult | undefined) {
	return (data?.cohorts ?? []).map((row) => ({
		cohort: row.cohort,
		signups: row.signups,
		live: row.count,
		medianHours: row.medianHours,
		p75Hours: row.p75Hours,
	}));
}
