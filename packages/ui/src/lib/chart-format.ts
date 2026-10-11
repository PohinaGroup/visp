/**
 * Pure number/delta helpers shared by the chart primitives and KPI tiles.
 *
 * Kept free of React and DOM so they can be unit-tested with bun:test and
 * reused by pages that need the same formatting outside a chart (tables,
 * CSV exports) without the numbers drifting apart.
 */

/** Direction of change, independent of whether that change is desirable. */
export type DeltaDirection = "up" | "down" | "flat";

/** Whether a change is desirable for the metric being shown. */
export type DeltaTone = "good" | "bad" | "neutral";

export type NumberFormatOptions = {
	/** BCP 47 locale; undefined uses the viewer's locale. */
	locale?: string;
	/**
	 * `true` always compacts (1.2K), `false` never does, `"auto"` (default)
	 * compacts from 10,000 up so small counts stay exact.
	 */
	compact?: boolean | "auto";
	maximumFractionDigits?: number;
	/** Extra Intl options, e.g. `{ style: "currency", currency: "EUR" }`. */
	intl?: Intl.NumberFormatOptions;
};

const AUTO_COMPACT_FROM = 10_000;

/** Placeholder for missing values; an em dash reads as "no data", not zero. */
export const MISSING_VALUE = "—";

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * Formats a number with Intl so separators and compact suffixes follow the
 * viewer's locale. Null/NaN render as an em dash rather than "0", because a
 * missing metric and a zero metric mean different things on a dashboard.
 */
export function formatChartNumber(
	value: number | null | undefined,
	options: NumberFormatOptions = {},
): string {
	if (!isFiniteNumber(value)) return MISSING_VALUE;
	const { locale, compact = "auto", maximumFractionDigits, intl } = options;
	const useCompact =
		compact === true ||
		(compact === "auto" && Math.abs(value) >= AUTO_COMPACT_FROM);
	// Currency carries its own minor-unit precision; forcing 0 digits would
	// round €12.50 to €13.
	const defaultDigits =
		intl?.style === "currency"
			? undefined
			: useCompact || Math.abs(value) < 10
				? 1
				: 0;
	return new Intl.NumberFormat(locale, {
		maximumFractionDigits: maximumFractionDigits ?? defaultDigits,
		...(useCompact ? { notation: "compact" } : {}),
		...intl,
	}).format(value);
}

/** Compact formatter for axis ticks, where width matters more than precision. */
export function formatAxisTick(value: unknown, locale?: string): string {
	if (typeof value === "string") return value;
	if (!isFiniteNumber(value)) return "";
	return formatChartNumber(value, {
		locale,
		compact: Math.abs(value) >= 1_000,
		maximumFractionDigits: 1,
	});
}

/**
 * Percentage change from `previous` to `value`, in percent units (12.5 means
 * +12.5%). Returns null when there is no meaningful baseline: a missing or
 * zero previous value would otherwise produce Infinity or a misleading 0%.
 */
export function computeDeltaPct(
	value: number | null | undefined,
	previous: number | null | undefined,
): number | null {
	if (!isFiniteNumber(value) || !isFiniteNumber(previous) || previous === 0) {
		return null;
	}
	return ((value - previous) / Math.abs(previous)) * 100;
}

/**
 * Changes smaller than this (in percent units) render as flat, so rounding
 * noise such as +0.01% does not paint a tile green or red.
 */
export const FLAT_DELTA_THRESHOLD = 0.05;

export function deltaDirection(
	deltaPct: number | null | undefined,
	threshold: number = FLAT_DELTA_THRESHOLD,
): DeltaDirection {
	if (!isFiniteNumber(deltaPct) || Math.abs(deltaPct) < threshold) {
		return "flat";
	}
	return deltaPct > 0 ? "up" : "down";
}

/**
 * Maps a delta to good/bad. `invert` is for metrics where growth is bad
 * (cost, latency, error rate), so the colour follows meaning, not sign.
 */
export function deltaTone(
	deltaPct: number | null | undefined,
	invert = false,
	threshold: number = FLAT_DELTA_THRESHOLD,
): DeltaTone {
	const direction = deltaDirection(deltaPct, threshold);
	if (direction === "flat") return "neutral";
	const isUp = direction === "up";
	return isUp !== invert ? "good" : "bad";
}

/**
 * Signed percentage such as "+12.5%" / "-3%" / "0%". Large swings drop the
 * decimal (+250%) because the extra precision is noise at that scale. Pass
 * `signed: false` for prose ("up 12.5%") where the word carries direction.
 */
export function formatDeltaPct(
	deltaPct: number | null | undefined,
	locale?: string,
	signed = true,
): string {
	if (!isFiniteNumber(deltaPct)) return MISSING_VALUE;
	const flat = Math.abs(deltaPct) < FLAT_DELTA_THRESHOLD;
	return new Intl.NumberFormat(locale, {
		style: "percent",
		signDisplay: flat || !signed ? "never" : "exceptZero",
		maximumFractionDigits: Math.abs(deltaPct) >= 100 ? 0 : 1,
	}).format(flat ? 0 : deltaPct / 100);
}

/**
 * Screen-reader sentence for a delta, e.g. "up 12.5% vs previous period,
 * good". Colour and arrow are visual only, so the tone is spelled out.
 */
export function describeDelta(
	deltaPct: number | null | undefined,
	options: { invert?: boolean; comparisonLabel?: string; locale?: string } = {},
): string {
	const { invert = false, comparisonLabel, locale } = options;
	if (!isFiniteNumber(deltaPct)) return "no comparison available";
	const direction = deltaDirection(deltaPct);
	const tone = deltaTone(deltaPct, invert);
	const amount = formatDeltaPct(deltaPct, locale, false);
	const suffix = comparisonLabel ? ` ${comparisonLabel}` : "";
	if (direction === "flat") return `unchanged${suffix}`;
	return `${direction} ${amount}${suffix}, ${tone === "good" ? "good" : "bad"}`;
}

/**
 * SVG polyline `points` for a sparkline scaled into a width×height box.
 * Non-finite samples are skipped; a constant series draws a centred flat line
 * instead of dividing by a zero range.
 */
export function sparklinePoints(
	values: readonly number[],
	width: number,
	height: number,
	padding = 2,
): { points: string; last: { x: number; y: number } | null } {
	const samples = values.filter(isFiniteNumber);
	if (samples.length === 0) return { points: "", last: null };
	const min = Math.min(...samples);
	const max = Math.max(...samples);
	const range = max - min;
	const innerW = Math.max(0, width - padding * 2);
	const innerH = Math.max(0, height - padding * 2);
	const step = samples.length > 1 ? innerW / (samples.length - 1) : 0;
	const coords = samples.map((sample, index) => {
		const x = samples.length > 1 ? padding + index * step : width / 2;
		const y =
			range === 0
				? height / 2
				: padding + innerH - ((sample - min) / range) * innerH;
		return { x: round2(x), y: round2(y) };
	});
	// A single sample still needs two points for a visible line segment.
	const drawn =
		coords.length === 1 && coords[0]
			? [
					{ x: padding, y: coords[0].y },
					{ x: width - padding, y: coords[0].y },
				]
			: coords;
	return {
		points: drawn.map((c) => `${c.x},${c.y}`).join(" "),
		last: coords.at(-1) ?? null,
	};
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
