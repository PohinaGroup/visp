import { describe, expect, mock, test } from "bun:test";

mock.module("./storage", () => ({ storage: {} }));
const { parseBondingMode } = await import("./bonding-preferences");

describe("parseBondingMode", () => {
	test("accepts supported modes and defaults unknown values to off", () => {
		expect(parseBondingMode("broadcast")).toBe("broadcast");
		expect(parseBondingMode("backup")).toBe("backup");
		expect(parseBondingMode("balancing")).toBe("off");
		expect(parseBondingMode(null)).toBe("off");
	});
});
