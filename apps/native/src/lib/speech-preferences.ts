import { booleanPreference } from "./preference";
import { type LanguageCode, parseLanguageCode } from "./spoken-language";
import { storage } from "./storage";

const CAPTION_LANGUAGE_KEY = "visp.captions.language";

export type AudioIsolationMode = "off" | "native" | "better";
export type CaptionLanguage = "off" | LanguageCode;
export type SpokenCaptionLanguage = LanguageCode;

export const audioIsolation = booleanPreference("visp.audio.isolation");
export const betterAudioIsolation = booleanPreference(
	"visp.audio.better-isolation",
);
export const betterCaptions = booleanPreference("visp.captions.better");

export function parseCaptionLanguage(value: string | null): CaptionLanguage {
	return parseLanguageCode(value) ?? "off";
}

export async function loadCaptionLanguage(): Promise<CaptionLanguage> {
	return parseCaptionLanguage(await storage.getItem(CAPTION_LANGUAGE_KEY));
}

export async function saveCaptionLanguage(
	language: CaptionLanguage,
): Promise<void> {
	await storage.setItem(CAPTION_LANGUAGE_KEY, language);
}

/** Better replaces native the same way better TTS replaces the device voice. */
export function resolveAudioIsolationMode({
	enabled,
	better,
	betterAvailable,
}: {
	enabled: boolean;
	better: boolean;
	betterAvailable: boolean;
}): AudioIsolationMode {
	if (!enabled) return "off";
	if (better && betterAvailable) return "better";
	return "native";
}
