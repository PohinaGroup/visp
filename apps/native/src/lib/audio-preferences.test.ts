import { describe, expect, mock, test } from "bun:test";

const values = new Map<string, string>();
mock.module("./storage", () => ({
	storage: {
		getItem: async (key: string) => values.get(key) ?? null,
		setItem: async (key: string, value: string) => {
			values.set(key, value);
		},
	},
}));
const { loadSpeechOutput, saveSpeechOutput } = await import(
	"./audio-preferences"
);

describe("speech output preference", () => {
	test("defaults to the system route and round-trips a device", async () => {
		values.clear();
		expect(await loadSpeechOutput()).toBe("default");
		await saveSpeechOutput("42");
		expect(await loadSpeechOutput()).toBe("42");
	});
});
