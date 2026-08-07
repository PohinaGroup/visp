import { env } from "@VISP/env/server";

/** 16 kHz mono PCM chunks keep latency and upload size bounded on mobile. */
export const ISOLATION_SAMPLE_RATE = 16_000;
export const ISOLATION_MAX_BYTES = 32_000;

export class AudioIsolationError extends Error {}

export function betterAudioIsolationConfigured() {
	return Boolean(env.ELEVENLABS_API_KEY);
}

type IsolationDependencies = {
	fetch: typeof fetch;
	apiKey: string | undefined;
};

export async function isolateAudioChunk(
	audio: ArrayBuffer,
	overrides: Partial<IsolationDependencies> = {},
): Promise<ArrayBuffer> {
	const {
		fetch: request,
		apiKey,
	}: IsolationDependencies = {
		fetch,
		apiKey: env.ELEVENLABS_API_KEY,
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
		{
			method: "POST",
			headers: { "xi-api-key": apiKey },
			body: form,
		},
	);
	if (!response.ok) {
		throw new AudioIsolationError(
			`Isolation provider returned ${response.status}`,
		);
	}
	return await response.arrayBuffer();
}
