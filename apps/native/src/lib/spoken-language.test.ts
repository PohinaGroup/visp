import { describe, expect, test } from "bun:test";
import {
	isLanguageCode,
	isSpokenLocale,
	parseLanguageCode,
	toLanguageCode,
	toSpokenLocale,
} from "./spoken-language";

describe("spoken language mappers", () => {
	test("maps locales to language codes and back", () => {
		expect(toLanguageCode("fi-FI")).toBe("fi");
		expect(toLanguageCode("en-US")).toBe("en");
		expect(toSpokenLocale("fi")).toBe("fi-FI");
		expect(toSpokenLocale("en")).toBe("en-US");
	});

	test("parses and rejects unknown language codes", () => {
		expect(parseLanguageCode("fi")).toBe("fi");
		expect(parseLanguageCode("en")).toBe("en");
		expect(parseLanguageCode("fi-FI")).toBeUndefined();
		expect(parseLanguageCode(null)).toBeUndefined();
		expect(isLanguageCode("fi")).toBe(true);
		expect(isLanguageCode("sv")).toBe(false);
		expect(isSpokenLocale("en-US")).toBe(true);
		expect(isSpokenLocale("en")).toBe(false);
	});
});
