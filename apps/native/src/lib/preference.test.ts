import { describe, expect, mock, test } from "bun:test";

const items = new Map<string, string>();
mock.module("./storage", () => ({
	storage: {
		getItem: async (key: string) => items.get(key) ?? null,
		setItem: async (key: string, value: string) => {
			items.set(key, value);
		},
	},
}));
const { booleanPreference } = await import("./preference");

describe("booleanPreference", () => {
	test("falls back only while the key is unset", async () => {
		items.clear();
		expect(await booleanPreference("unset").load()).toBe(false);
		expect(await booleanPreference("unset", true).load()).toBe(true);
	});

	test("round-trips both values", async () => {
		items.clear();
		const preference = booleanPreference("visp.test", true);
		await preference.save(false);
		expect(items.get("visp.test")).toBe("false");
		expect(await preference.load()).toBe(false);
		await preference.save(true);
		expect(items.get("visp.test")).toBe("true");
		expect(await preference.load()).toBe(true);
	});
});
