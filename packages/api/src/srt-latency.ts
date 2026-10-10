// Client-safe: shared by the server, portal, and native broadcaster. No DB here.

export type NetworkProfile = "wired" | "wifi" | "cellular";

/**
 * SRT latency guidance from a measured round trip. SRT holds every packet for
 * this long so a lost one can be retransmitted, so it is a fixed delay, not a
 * ceiling: lower is snappier, but a value below a few round trips drops data.
 */
export function recommendLatency(rttMs: number, profile: NetworkProfile) {
	const multiplier = { wired: 3, wifi: 4, cellular: 6 }[profile];
	const floor = { wired: 120, wifi: 300, cellular: 600 }[profile];
	const ms = Math.max(floor, Math.ceil((rttMs * multiplier) / 50) * 50);
	return {
		ms,
		micros: ms * 1000,
		larixMs: ms,
		note:
			profile === "cellular"
				? "Cellular jitter is large and bursty; do not tune this down."
				: undefined,
	};
}

/** What the VISP app sends with outside low-latency mode. */
export const STANDARD_PUBLISH_LATENCY_MS = 2_000;

/** OBS reads of a device outside low-latency mode. */
export const STANDARD_OBS_READ_LATENCY_MS = 300;

/**
 * OBS reads of a low-latency device. The relay-to-OBS hop is normally a fixed
 * home or studio line, and MediaMTX's own SRT default is 120 ms, so this sits
 * just above it with headroom for a ~35 ms round trip.
 */
export const LOW_LATENCY_OBS_READ_LATENCY_MS = 150;

/** Used when the pre-live relay probe fails; a typical 100 ms round trip. */
const FALLBACK_RTT_MS = 100;

/**
 * Publish latency for a phone in low-latency mode: the RTT-based guidance,
 * never above the standard value (the mode must never make things slower).
 */
export function lowLatencyPublishMs(
	rttMs: number | undefined,
	profile: NetworkProfile,
) {
	const measured =
		rttMs !== undefined && Number.isFinite(rttMs) && rttMs >= 0
			? rttMs
			: FALLBACK_RTT_MS;
	return Math.min(
		STANDARD_PUBLISH_LATENCY_MS,
		recommendLatency(measured, profile).ms,
	);
}

/**
 * Sets `latency` (milliseconds, the SRTO_LATENCY unit the VISP app reads) on
 * an SRT publish URL. String-based on purpose: the stream ID carries `:`
 * separators that URL serialisation would re-encode.
 */
export function withPublishLatency(url: string, latencyMs: number) {
	const ms = Math.round(latencyMs);
	if (!Number.isInteger(ms) || ms < 20 || ms > 8_000) {
		throw new Error("SRT latency must be between 20 and 8000 ms");
	}
	const queryStart = url.indexOf("?");
	const base = queryStart < 0 ? url : url.slice(0, queryStart);
	const query = queryStart < 0 ? "" : url.slice(queryStart + 1);
	const params = query
		.split("&")
		.filter((part) => part.length > 0 && !part.startsWith("latency="));
	params.push(`latency=${ms}`);
	return `${base}?${params.join("&")}`;
}

/** Shown wherever Direct runs from a low-latency device. */
export const LOW_LATENCY_DIRECT_WARNING =
	"Low-latency mode is on for this device. Direct will still work, but the shorter retransmit window means a weak uplink can drop or smear frames on Twitch, Kick, or YouTube.";
