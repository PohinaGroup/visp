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

describe("retryAfterMs", () => {
	test("reports the real remaining wait once the window is spent", () => {
		const limiter = fixedWindow(2, 100);
		expect(limiter.retryAfterMs("user", 0)).toBe(0);
		limiter.take("user", 0);
		expect(limiter.retryAfterMs("user", 5)).toBe(0);
		limiter.take("user", 10);
		expect(limiter.take("user", 20)).toBe(false);
		expect(limiter.retryAfterMs("user", 20)).toBe(80);
		expect(limiter.retryAfterMs("user", 100)).toBe(0);
	});

	test("an unknown key never has to wait", () => {
		expect(fixedWindow(1, 100).retryAfterMs("nobody", 0)).toBe(0);
	});
});
