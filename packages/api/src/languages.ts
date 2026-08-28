/** ISO 639-1 codes supported by hosted TTS, subtitles, and on-device speech. */
export const LANGUAGE_CODES = ["fi", "en"] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export function isLanguageCode(value: string): value is LanguageCode {
	return (LANGUAGE_CODES as readonly string[]).includes(value);
}
