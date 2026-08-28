import { env } from "@VISP/env/server";
import type { LanguageCode } from "./languages";

export const SCRIBE_MODEL_ID = "scribe_v2_realtime";
export const SCRIBE_AUDIO_FORMAT = "pcm_16000";
export type SubtitleLanguage = LanguageCode;

export class SubtitlesError extends Error {}

export function betterSubtitlesConfigured() {
	return Boolean(env.ELEVENLABS_API_KEY);
}

type TokenDependencies = {
	fetch: typeof fetch;
	apiKey: string | undefined;
};

export type ScribeTokenResult = {
	audioFormat: typeof SCRIBE_AUDIO_FORMAT;
	modelId: typeof SCRIBE_MODEL_ID;
	token: string;
	wsUrl: string;
};

export async function createScribeToken(
	{ language }: { language: SubtitleLanguage },
	overrides: Partial<TokenDependencies> = {},
): Promise<ScribeTokenResult> {
	const { fetch: request, apiKey }: TokenDependencies = {
		fetch,
		apiKey: env.ELEVENLABS_API_KEY,
		...overrides,
	};
	if (!apiKey) {
		throw new SubtitlesError("Better subtitles are not configured");
	}

	const response = await request(
		"https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
		{
			method: "POST",
			headers: { "xi-api-key": apiKey },
		},
	);
	if (!response.ok) {
		throw new SubtitlesError(`Subtitles provider returned ${response.status}`);
	}

	const body = (await response.json()) as { token?: unknown };
	if (typeof body.token !== "string" || body.token.length === 0) {
		throw new SubtitlesError("Subtitles provider returned an invalid token");
	}

	const params = new URLSearchParams({
		model_id: SCRIBE_MODEL_ID,
		token: body.token,
		audio_format: SCRIBE_AUDIO_FORMAT,
		language_code: language,
		commit_strategy: "vad",
	});

	return {
		audioFormat: SCRIBE_AUDIO_FORMAT,
		modelId: SCRIBE_MODEL_ID,
		token: body.token,
		wsUrl: `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params}`,
	};
}
