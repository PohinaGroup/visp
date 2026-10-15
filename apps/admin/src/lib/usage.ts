import { chartSeriesColor } from "@VISP/ui/components/chart";
import type { ChartSeries } from "@VISP/ui/components/charts";

/**
 * Fixed series order for the usage charts. Colour follows the entity, not its
 * rank or presence, so Kick is the same orange whether or not Twitch had any
 * minutes in the selected range.
 */
export const HOSTED_FEATURES = [
	{ key: "tts", label: "Hosted TTS" },
	{ key: "audio_isolation", label: "Audio isolation" },
	{ key: "subtitles", label: "Subtitles" },
	{ key: "ai_moderator", label: "AI moderator" },
] as const;

export const DESTINATIONS = [
	{ key: "twitch", label: "Twitch" },
	{ key: "kick", label: "Kick" },
	{ key: "youtube", label: "YouTube" },
	{ key: "custom", label: "Custom RTMP" },
] as const;

export const UNIT_LABELS: Record<string, string> = {
	characters: "characters",
	seconds: "seconds",
	tokens: "tokens",
};

/** Series for the keys present in the data, coloured by their fixed slot. */
export function fixedSeries(
	catalog: readonly { key: string; label: string }[],
	present: ReadonlySet<string>,
): ChartSeries[] {
	const series: ChartSeries[] = [];
	catalog.forEach((entry, index) => {
		if (present.has(entry.key)) {
			series.push({
				key: entry.key,
				label: entry.label,
				color: chartSeriesColor(index),
			});
		}
	});
	// Anything the catalog does not know yet still shows, in muted ink.
	for (const key of present) {
		if (!catalog.some((entry) => entry.key === key)) {
			series.push({ key, label: key, color: chartSeriesColor(-1) });
		}
	}
	return series;
}

export type PivotRow = { bucket: string } & Record<string, number | string>;

/**
 * Long rows (`bucket`, `segment`, value) to one chart row per bucket with a
 * column per segment. Null values become 0 so a stack never has a hole; the
 * pages warn about unpriced usage separately.
 */
export function pivotBuckets<T extends { bucket: string }>(
	rows: readonly T[],
	segmentOf: (row: T) => string,
	measure: (row: T) => number | null,
): PivotRow[] {
	const byBucket = new Map<string, PivotRow>();
	for (const row of rows) {
		const entry = byBucket.get(row.bucket) ?? { bucket: row.bucket };
		const segment = segmentOf(row);
		const previous = typeof entry[segment] === "number" ? entry[segment] : 0;
		entry[segment] = (previous as number) + (measure(row) ?? 0);
		byBucket.set(row.bucket, entry);
	}
	return [...byBucket.values()].sort((a, b) =>
		a.bucket.localeCompare(b.bucket),
	);
}

const DAY_LABEL = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});

/** Axis label for a UTC bucket start; weekly buckets name their Monday. */
export function bucketLabel(interval: "day" | "week") {
	return (value: string | number) => {
		const label = DAY_LABEL.format(new Date(value));
		return interval === "week" ? `Wk ${label}` : label;
	};
}

export function formatEur(value: number) {
	return new Intl.NumberFormat("en-IE", {
		style: "currency",
		currency: "EUR",
		maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0,
	}).format(value);
}

export function formatCount(value: number) {
	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits: value < 10 ? 1 : 0,
	}).format(value);
}

export function formatPct(value: number) {
	return `${Math.round(value)}%`;
}

/**
 * Example price rows, as in the T13 note: prices are business data and are
 * entered by hand, never by a migration. Values are placeholders, not quotes.
 */
export const UNIT_PRICE_SQL = `insert into unit_price (feature, unit, provider, eur_per_unit, valid_from) values
  ('tts', 'characters', 'elevenlabs', 0.00003000, '2026-10-01T00:00:00Z'),
  ('audio_isolation', 'seconds', 'elevenlabs', 0.00200000, '2026-10-01T00:00:00Z');`;
