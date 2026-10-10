import {
	type HostedUsageEvent,
	type HostedUsageFeature,
	recordHostedUsage,
} from "./hosted-usage";

/** Raw PCM layout of audio sent to a provider. */
export type PcmFormat = {
	sampleRate: number;
	/** Defaults to mono. */
	channels?: number;
	/** Defaults to 2 (s16le). */
	bytesPerSample?: number;
};

/**
 * Duration of `bytes` of raw PCM. Providers bill audio length, and the bytes
 * are what we actually sent, so this is exact where wall clock would also bill
 * silence the client never uploaded (pauses, reconnects, a backgrounded app).
 */
export function pcmSeconds(bytes: number, format: PcmFormat): number {
	const bytesPerSecond =
		format.sampleRate * (format.channels ?? 1) * (format.bytesPerSample ?? 2);
	if (!(bytes > 0) || !(bytesPerSecond > 0)) return 0;
	return bytes / bytesPerSecond;
}

/**
 * How often one stream hands its running total to `recordHostedUsage`. The
 * audio hot path then only adds to a number; ten seconds is far below the
 * minute-long write interval, so it costs no metering precision.
 */
export const AUDIO_USAGE_RECORD_INTERVAL_MS = 10_000;

type Record = (event: HostedUsageEvent) => void;

type MeterOptions = {
	userId: string;
	feature: HostedUsageFeature;
	provider: string;
	format: PcmFormat;
	record?: Record;
	now?: () => number;
	recordEveryMs?: number;
};

/**
 * Seconds of audio one stream sent to a hosted provider. Fractions accumulate
 * in memory and are recorded at most once per `recordEveryMs` and on `end()`,
 * so a 0.2 s chunk never becomes a whole billed second on its own.
 */
export function createAudioUsageMeter({
	userId,
	feature,
	provider,
	format,
	record = recordHostedUsage,
	now = Date.now,
	recordEveryMs = AUDIO_USAGE_RECORD_INTERVAL_MS,
}: MeterOptions) {
	let pending = 0;
	let lastRecordedAt = now();
	let ended = false;

	function flush() {
		if (pending <= 0) return;
		const units = pending;
		pending = 0;
		lastRecordedAt = now();
		try {
			record({ userId, feature, units, unit: "seconds", provider });
		} catch (error) {
			// Metering is bookkeeping; never let it break the audio path.
			console.error("Failed to record hosted audio usage", error);
		}
	}

	return {
		/** Call after the provider accepted `bytes` of PCM in `format`. */
		addBytes(bytes: number) {
			if (ended) return;
			const seconds = pcmSeconds(bytes, format);
			if (seconds <= 0) return;
			pending += seconds;
			if (now() - lastRecordedAt >= recordEveryMs) flush();
		},
		/** Records what is left. Idempotent; later audio is ignored. */
		end() {
			if (ended) return;
			flush();
			ended = true;
		},
		/** Seconds not yet handed to `record`, for tests and diagnostics. */
		pending: () => pending,
	};
}

/**
 * One meter per user for providers called per chunk over HTTP, where there is
 * no socket close to mark the end of a stream. A user who sends nothing for
 * `idleMs` has stopped; the sweep ends their meter so the tail is recorded.
 */
export function createAudioUsageMeters({
	idleMs = AUDIO_USAGE_RECORD_INTERVAL_MS,
	sweepEveryMs = AUDIO_USAGE_RECORD_INTERVAL_MS,
	...options
}: Omit<MeterOptions, "userId"> & { idleMs?: number; sweepEveryMs?: number }) {
	const now = options.now ?? Date.now;
	const meters = new Map<
		string,
		{ meter: ReturnType<typeof createAudioUsageMeter>; lastSeenAt: number }
	>();
	let timer: ReturnType<typeof setInterval> | undefined;

	function sweep() {
		const at = now();
		for (const [userId, entry] of meters) {
			if (at - entry.lastSeenAt < idleMs) continue;
			entry.meter.end();
			meters.delete(userId);
		}
		if (meters.size === 0 && timer) {
			clearInterval(timer);
			timer = undefined;
		}
	}

	return {
		addBytes(userId: string, bytes: number) {
			let entry = meters.get(userId);
			if (!entry) {
				entry = {
					meter: createAudioUsageMeter({ ...options, userId }),
					lastSeenAt: now(),
				};
				meters.set(userId, entry);
			}
			entry.lastSeenAt = now();
			entry.meter.addBytes(bytes);
			if (!timer && sweepEveryMs > 0) {
				timer = setInterval(sweep, sweepEveryMs);
				// The meter must not be the reason a process stays up.
				timer.unref?.();
			}
		},
		/** Ends meters idle for `idleMs`. Runs on its own timer; exposed for tests. */
		sweep,
		/** Records every open meter now, for shutdown and tests. */
		endAll() {
			for (const entry of meters.values()) entry.meter.end();
			meters.clear();
			if (timer) clearInterval(timer);
			timer = undefined;
		},
		/** Users with an open meter. */
		size: () => meters.size,
	};
}

export type AudioUsageMeters = ReturnType<typeof createAudioUsageMeters>;
