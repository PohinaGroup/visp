import { describe, expect, test } from "bun:test";
import { fixedWindow } from "./rate-limit";

describe("fixedWindow", () => {
	test("enforces the boundary and rolls over the window", () => {
		const limiter = fixedWindow(2, 100);
		expect(limiter.take("user", 0)).toBe(true);
		expect(limiter.take("user", 1)).toBe(true);
		expect(limiter.take("user", 99)).toBe(false);
		expect(limiter.take("user", 100)).toBe(true);
	});

	test("evicts one key when the guard is full", () => {
		const limiter = fixedWindow(1, 1_000);
		for (let index = 0; index < 10_000; index += 1) {
			expect(limiter.take(String(index), 0)).toBe(true);
		}
		expect(limiter.take("new", 1)).toBe(true);
		expect(limiter.take("0", 2)).toBe(true);
	});
});
