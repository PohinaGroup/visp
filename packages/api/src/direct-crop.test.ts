import { describe, expect, test } from "bun:test";

import "./test-env";

import {
	buildPortraitFilter,
	DIRECT_CROP_MAX_OUTPUT_SIDE,
	directCropError,
} from "./direct-crop";

const { portraitFilterMatches } = await import("./direct-portrait");

const portrait = { x: 0.3418, y: 0, w: 0.3164, h: 1, aspect: "9:16" };

describe("direct crop aspect", () => {
	test("accepts the 9:16 framing the editors offer", () => {
		expect(directCropError(portrait)).toBeNull();
		expect(buildPortraitFilter(portrait)).toBe(
			"crop=iw*0.3164:ih*1:iw*0.3418:ih*0,scale=1080:1920",
		);
	});

	test.each([
		// Matches the crop geometry exactly but would scale to 1920000×1920.
		{ x: 0, y: 0, w: 1, h: 0.00028125, aspect: "1000:1" },
		{ x: 0, y: 0, w: 0.5625, h: 1, aspect: "1:1" },
		{ x: 0, y: 0, w: 1, h: 1, aspect: "16:9" },
		{ x: 0, y: 0, w: 0.3164, h: 1, aspect: "18:32" },
		{ x: 0, y: 0, w: 0.3164, h: 1, aspect: "09:16" },
	])("rejects aspect $aspect", (crop) => {
		expect(directCropError(crop)).toBe("Crop must match its target aspect");
	});

	test("caps the scaled output even if called with an odd aspect", () => {
		const match = /scale=(\d+):(\d+)$/.exec(
			buildPortraitFilter({ ...portrait, aspect: "1000:1" }),
		);
		expect(Number(match?.[1])).toBeLessThanOrEqual(DIRECT_CROP_MAX_OUTPUT_SIDE);
		expect(Number(match?.[2])).toBeLessThanOrEqual(DIRECT_CROP_MAX_OUTPUT_SIDE);
		const tall = /scale=(\d+):(\d+)$/.exec(
			buildPortraitFilter({ ...portrait, aspect: "1:1000" }),
		);
		expect(Number(tall?.[1])).toBeGreaterThanOrEqual(2);
		expect(Number(tall?.[2])).toBeLessThanOrEqual(DIRECT_CROP_MAX_OUTPUT_SIDE);
	});

	test("a stored crop that no longer validates matches no filter", () => {
		const filter = buildPortraitFilter(portrait);
		expect(portraitFilterMatches(portrait, filter)).toBe(true);
		expect(portraitFilterMatches({ ...portrait, aspect: "1:1" }, filter)).toBe(
			false,
		);
		expect(portraitFilterMatches(null, filter)).toBe(false);
	});
});
