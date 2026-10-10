/**
 * Capacity forecast for one relay resource (live paths or forwarders) from
 * its daily peaks: "at the current trend, how many weeks until this relay is
 * 80 % / 100 % full?". Pure so the maths can be tested without a database and
 * the router stays a thin query.
 *
 * Method (`linear_daily_peak`): ordinary least squares on one point per UTC
 * day, x = days since the window start, y = that day's peak. Peaks rather
 * than means because a relay runs out of slots at its busiest minute.
 *
 * Limitations, on purpose and worth knowing when reading the number:
 * - Linear. Growth that compounds (or a one-off migration of streamers onto a
 *   relay) is under- or over-stated; the forecast is a nudge to look at the
 *   history chart, not a provisioning schedule.
 * - Weekly seasonality is not modelled. Streaming peaks on weekends, so a
 *   window that starts on a quiet weekday and ends on a Saturday tilts the
 *   slope up (and the reverse tilts it down). The default 28 days is four
 *   whole weeks so each weekday weighs the same; shorter windows and gaps
 *   (days without samples are skipped, not zero-filled) weaken that, which is
 *   one reason `confidence` drops below 14 points.
 * - The starting point is the highest daily peak of the last 7 days, not the
 *   fitted line, so a weekend peak above the trend is not forecast away.
 * - Fewer than 7 points gives no forecast at all: a slope through a handful
 *   of days is mostly noise.
 */

export const RELAY_FORECAST_METHOD = "linear_daily_peak";
/** Days of daily peaks a forecast looks at unless told otherwise. */
export const RELAY_FORECAST_DEFAULT_DAYS = 28;
/** Below this many days with samples there is no forecast. */
export const RELAY_FORECAST_MIN_POINTS = 7;
/** Below this many days, or below `RELAY_FORECAST_MIN_R2`, confidence is low. */
export const RELAY_FORECAST_OK_POINTS = 14;
export const RELAY_FORECAST_MIN_R2 = 0.3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One UTC day's peak; `peak` is null when the day had samples but no value. */
export type DailyPeak = { day: Date | string; peak: number | null };

export type RelayForecast = {
	/** Trend in units (paths or forwarders) per week; null without a fit. */
	slopePerWeek: number | null;
	/** Highest daily peak in the last 7 days with data; null with no data. */
	currentPeak: number | null;
	/**
	 * Weeks from now until the trend reaches 80 % of capacity. Null when there
	 * is no fit, the trend is flat or falling, there is no capacity, or the
	 * relay is already at or above 80 %.
	 */
	weeksTo80Pct: number | null;
	/** As `weeksTo80Pct`, for 100 %. */
	weeksTo100Pct: number | null;
	/** `low` below 14 points or when the line explains < 30 % of variance. */
	confidence: "low" | "ok";
	/** Coefficient of determination of the fit; null without a fit. */
	rSquared: number | null;
	/** Days with a peak that went into the fit. */
	points: number;
	method: typeof RELAY_FORECAST_METHOD;
};

/** Start of the UTC day containing `value`, in ms. */
export function utcDayStart(value: Date | string | number) {
	return Math.floor(new Date(value).getTime() / DAY_MS) * DAY_MS;
}

function weeksUntil(
	threshold: number,
	currentPeak: number,
	slopePerWeek: number,
): number | null {
	if (slopePerWeek <= 0 || currentPeak >= threshold) return null;
	return (threshold - currentPeak) / slopePerWeek;
}

/**
 * Forecast one resource from its daily peaks.
 *
 * Only days in `[asOf - days, asOf)` count, where `asOf` defaults to the day
 * after the latest peak; callers pass the start of today (UTC) so a partial
 * day — whose peak may not have happened yet — never drags the slope down.
 * Duplicate days keep their highest peak.
 */
export function forecastRelayCapacity({
	peaks,
	capacity,
	days = RELAY_FORECAST_DEFAULT_DAYS,
	asOf,
}: {
	peaks: readonly DailyPeak[];
	capacity: number;
	days?: number;
	asOf?: Date | string;
}): RelayForecast {
	const byDay = new Map<number, number>();
	for (const { day, peak } of peaks) {
		if (peak === null || !Number.isFinite(peak)) continue;
		const key = utcDayStart(day);
		const previous = byDay.get(key);
		if (previous === undefined || peak > previous) byDay.set(key, peak);
	}
	const latest = byDay.size ? Math.max(...byDay.keys()) : 0;
	const end = asOf === undefined ? latest + DAY_MS : utcDayStart(asOf);
	const start = end - days * DAY_MS;
	const series = [...byDay]
		.filter(([day]) => day >= start && day < end)
		.sort(([a], [b]) => a - b)
		.map(([day, peak]) => ({ x: (day - start) / DAY_MS, y: peak }));

	const empty: RelayForecast = {
		slopePerWeek: null,
		currentPeak: null,
		weeksTo80Pct: null,
		weeksTo100Pct: null,
		confidence: "low",
		rSquared: null,
		points: series.length,
		method: RELAY_FORECAST_METHOD,
	};
	const last = series.at(-1);
	if (!last) return empty;
	const currentPeak = Math.max(
		...series.filter(({ x }) => x > last.x - 7).map(({ y }) => y),
	);
	if (series.length < RELAY_FORECAST_MIN_POINTS) {
		return { ...empty, currentPeak };
	}

	const n = series.length;
	const meanX = series.reduce((sum, { x }) => sum + x, 0) / n;
	const meanY = series.reduce((sum, { y }) => sum + y, 0) / n;
	let sxx = 0;
	let sxy = 0;
	let syy = 0;
	for (const { x, y } of series) {
		sxx += (x - meanX) ** 2;
		sxy += (x - meanX) * (y - meanY);
		syy += (y - meanY) ** 2;
	}
	// Distinct days guarantee sxx > 0 once there are two or more points.
	const slopePerDay = sxy / sxx;
	// A perfectly flat series is perfectly explained by a flat line.
	const rSquared = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
	const slopePerWeek = slopePerDay * 7;
	const confidence =
		n < RELAY_FORECAST_OK_POINTS || rSquared < RELAY_FORECAST_MIN_R2
			? "low"
			: "ok";
	const hasCapacity = capacity > 0;
	return {
		slopePerWeek,
		currentPeak,
		weeksTo80Pct: hasCapacity
			? weeksUntil(capacity * 0.8, currentPeak, slopePerWeek)
			: null,
		weeksTo100Pct: hasCapacity
			? weeksUntil(capacity, currentPeak, slopePerWeek)
			: null,
		confidence,
		rSquared,
		points: n,
		method: RELAY_FORECAST_METHOD,
	};
}
