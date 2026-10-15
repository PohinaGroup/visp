import { env } from "@VISP/env/server";
import {
	type AudioUsageMeters,
	createAudioUsageMeters,
	type PcmFormat,
} from "./audio-usage";
import { withProviderTimeout } from "./provider-timeout";

/** 16 kHz mono PCM chunks keep latency and upload size bounded on mobile. */
export const ISOLATION_SAMPLE_RATE = 16_000;
export const ISOLATION_MAX_BYTES = 32_000;
/** Recorded with hosted usage so per-provider prices can apply. */
export const ISOLATION_PROVIDER = "elevenlabs";
/** What `pcm_s16le_16` means: 16-bit little-endian mono at 16 kHz. */
export const ISOLATION_PCM_FORMAT: PcmFormat = {
	sampleRate: ISOLATION_SAMPLE_RATE,
	channels: 1,
	bytesPerSample: 2,
};

/**
 * Isolation is one HTTP request per chunk, so seconds are summed per user and
 * a user's meter ends after 10 s without a chunk.
 */
export const isolationUsage = createAudioUsageMeters({
	feature: "audio_isolation",
	provider: ISOLATION_PROVIDER,
	format: ISOLATION_PCM_FORMAT,
});

export class AudioIsolationError extends Error {}

export function betterAudioIsolationConfigured() {
	return Boolean(env.ELEVENLABS_API_KEY);
}

type IsolationDependencies = {
	fetch: typeof fetch;
	apiKey: string | undefined;
	usage: Pick<AudioUsageMeters, "addBytes">;
};

/**
 * Sends one chunk of `userId`'s mic audio to the hosted isolation provider and
 * meters its duration once the provider returned audio for it.
 */
export async function isolateAudioChunk(
	audio: ArrayBuffer,
	userId: string,
	overrides: Partial<IsolationDependencies> = {},
): Promise<ArrayBuffer> {
	const {
		fetch: request,
		apiKey,
		usage,
	}: IsolationDependencies = {
		fetch,
		apiKey: env.ELEVENLABS_API_KEY,
		usage: isolationUsage,
		...overrides,
	};
	if (!apiKey) {
		throw new AudioIsolationError("Better audio isolation is not configured");
	}
	if (audio.byteLength === 0 || audio.byteLength > ISOLATION_MAX_BYTES) {
		throw new AudioIsolationError("Invalid audio chunk");
	}

	const form = new FormData();
	form.append(
		"audio",
		new Blob([audio], { type: "application/octet-stream" }),
		"chunk.pcm",
	);
	form.append("file_format", "pcm_s16le_16");

	const response = await request(
		"https://api.elevenlabs.io/v1/audio-isolation/stream",
		// A chunk is at most ISOLATION_MAX_BYTES (one second of audio); one that
		// takes longer than this is stale and the on-device fallback is better.
		withProviderTimeout({
			method: "POST",
			headers: { "xi-api-key": apiKey },
			body: form,
		}),
	);
	if (!response.ok) {
		throw new AudioIsolationError(
			`Isolation provider returned ${response.status}`,
		);
	}
	const isolated = await response.arrayBuffer();
	// Only billed work is metered: a refused or failed request costs nothing,
	// and the on-device fallback never reaches this function.
	usage.addBytes(userId, audio.byteLength);
	return isolated;
}
