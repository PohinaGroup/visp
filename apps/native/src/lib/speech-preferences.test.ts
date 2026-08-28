import { describe, expect, mock, test } from "bun:test";

mock.module("./storage", () => ({ storage: {} }));
const { parseCaptionLanguage, resolveAudioIsolationMode } = await import(
	"./speech-preferences"
);

describe("resolveAudioIsolationMode", () => {
	test("is off when isolation is disabled", () => {
		expect(
			resolveAudioIsolationMode({
				enabled: false,
				better: true,
				betterAvailable: true,
			}),
		).toBe("off");
	});

	test("uses native isolation by default", () => {
		expect(
			resolveAudioIsolationMode({
				enabled: true,
				better: false,
				betterAvailable: true,
			}),
		).toBe("native");
	});

	test("uses better isolation only when the flag and toggle are both on", () => {
		expect(
			resolveAudioIsolationMode({
				enabled: true,
				better: true,
				betterAvailable: true,
			}),
		).toBe("better");
		expect(
			resolveAudioIsolationMode({
				enabled: true,
				better: true,
				betterAvailable: false,
			}),
		).toBe("native");
	});
});

describe("parseCaptionLanguage", () => {
	test("accepts fi and en and defaults unknown values to off", () => {
		expect(parseCaptionLanguage("fi")).toBe("fi");
		expect(parseCaptionLanguage("en")).toBe("en");
		expect(parseCaptionLanguage("fi-FI")).toBe("off");
		expect(parseCaptionLanguage(null)).toBe("off");
	});
});
