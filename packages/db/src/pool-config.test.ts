import { describe, expect, test } from "bun:test";

import { DEFAULT_POOL_MAX, poolMax } from "./pool-config";

describe("poolMax", () => {
	test("defaults to 20 when unset or blank", () => {
		expect(DEFAULT_POOL_MAX).toBe(20);
		expect(poolMax(undefined)).toBe(20);
		expect(poolMax("  ")).toBe(20);
	});

	test("reads a positive integer", () => {
		expect(poolMax("35")).toBe(35);
		expect(poolMax(" 5 ")).toBe(5);
	});

	test("falls back on junk instead of failing boot", () => {
		for (const bad of ["0", "-3", "1.5", "lots"]) {
			expect(poolMax(bad)).toBe(DEFAULT_POOL_MAX);
		}
	});
});
