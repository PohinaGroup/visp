import { db } from "@VISP/db";
import { appUser } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { eq } from "drizzle-orm";

/**
 * ~75 ms, 32 languages including Finnish, and the only flagship model that
 * honours `language_code`. Multilingual v2 sounds better but costs twice as
 * much and cannot be pinned to a language.
 */
export const TTS_MODEL_ID = "eleven_flash_v2_5";
/** Speech out of a phone speaker; the 44.1 kHz default is wasted bytes. */
const TTS_OUTPUT_FORMAT = "mp3_22050_32";
export const TTS_LANGUAGES = ["fi", "en"] as const;
export type TtsLanguage = (typeof TTS_LANGUAGES)[number];

export class TtsError extends Error {}

/**
 * The only admission control hosted speech has. Unlike Direct this gates
 * spend: every character billed is a character someone typed in chat.
 */
export async function canUseBetterTts(userId: string) {
	const [owner] = await db
		.select({ betterTts: appUser.betterTts })
		.from(appUser)
		.where(eq(appUser.id, userId))
		.limit(1);
	return owner?.betterTts === true;
}

export function betterTtsConfigured() {
	return Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_VOICE_ID);
}

type SpeechDependencies = {
	fetch: typeof fetch;
	apiKey: string | undefined;
	voiceId: string | undefined;
};

export async function synthesizeSpeech(
	{ text, language }: { text: string; language: TtsLanguage },
	overrides: Partial<SpeechDependencies> = {},
): Promise<ArrayBuffer> {
	// Credentials are arguments rather than module state so a caller (or a test)
	// never depends on when the env module happened to be parsed.
	const {
		fetch: request,
		apiKey,
		voiceId,
	}: SpeechDependencies = {
		fetch,
		apiKey: env.ELEVENLABS_API_KEY,
		voiceId: env.ELEVENLABS_VOICE_ID,
		...overrides,
	};
	if (!apiKey || !voiceId) throw new TtsError("Speech is not configured");

	const response = await request(
		`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${TTS_OUTPUT_FORMAT}`,
		{
			method: "POST",
			headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
			body: JSON.stringify({
				text,
				model_id: TTS_MODEL_ID,
				language_code: language,
			}),
		},
	);
	// The upstream body can echo account details, so only the status travels.
	if (!response.ok) {
		throw new TtsError(`Speech provider returned ${response.status}`);
	}
	return await response.arrayBuffer();
}
