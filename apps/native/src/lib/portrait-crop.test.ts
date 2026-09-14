import { describe, expect, test } from "bun:test";
import {
	cropSliderRange,
	cropWithHeight,
	DEFAULT_PORTRAIT_CROP,
	PORTRAIT_WIDTH_RATIO,
} from "./portrait-crop";

describe("cropSliderRange", () => {
	test("default crop leaves no vertical travel, so the range is widened", () => {
		const range = cropSliderRange(0, 1 - DEFAULT_PORTRAIT_CROP.h);
		expect(range.max).toBeGreaterThan(0);
		expect(range.disabled).toBe(true);
	});

	test("keeps a real range untouched", () => {
		expect(cropSliderRange(0, 0.5)).toEqual({ max: 0.5, disabled: false });
	});
});

describe("cropWithHeight", () => {
	test("stays 9:16 and inside the frame", () => {
		const crop = cropWithHeight({ ...DEFAULT_PORTRAIT_CROP, x: 0.9 }, 0.6);
		expect(crop.w).toBeCloseTo(0.6 * PORTRAIT_WIDTH_RATIO, 6);
		expect(crop.x + crop.w).toBeLessThanOrEqual(1);
		expect(crop.y + crop.h).toBeLessThanOrEqual(1);
	});

	test("clamps to the minimum height", () => {
		expect(cropWithHeight(DEFAULT_PORTRAIT_CROP, 0).h).toBe(0.25);
	});
});
