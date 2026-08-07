import {
	isLanguageCode,
	LANGUAGE_CODES,
	type LanguageCode,
} from "@VISP/api/languages";

export { isLanguageCode, LANGUAGE_CODES, type LanguageCode };

/**
 * BCP-47 locales for on-device speech and native caption APIs.
 * Short codes live in @VISP/api/languages; map at the boundary.
 */
export const SPOKEN_LOCALES = {
	fi: "fi-FI",
	en: "en-US",
} as const satisfies Record<LanguageCode, `${LanguageCode}-${string}`>;

export type SpokenLocale = (typeof SPOKEN_LOCALES)[LanguageCode];

const LOCALES = new Set<string>(Object.values(SPOKEN_LOCALES));

export function isSpokenLocale(value: string): value is SpokenLocale {
	return LOCALES.has(value);
}

export function toLanguageCode(locale: SpokenLocale): LanguageCode {
	switch (locale) {
		case "fi-FI":
			return "fi";
		case "en-US":
			return "en";
		default: {
			const _exhaustive: never = locale;
			return _exhaustive;
		}
	}
}

export function toSpokenLocale(code: LanguageCode): SpokenLocale {
	return SPOKEN_LOCALES[code];
}

export function parseLanguageCode(
	value: string | null | undefined,
): LanguageCode | undefined {
	if (value == null) return undefined;
	return isLanguageCode(value) ? value : undefined;
}
