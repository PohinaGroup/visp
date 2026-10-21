import { describe, expect, test } from "bun:test";
import { onAirLabel, rotationIndex } from "./on-air";

describe("on-air label", () => {
	const since = "2026-10-01T00:00:00Z";
	test("counts seconds under a day and days after", () => {
		expect(onAirLabel(since, Date.parse("2026-10-01T05:07:09Z"))).toBe(
			"05h 07m 09s",
		);
		expect(onAirLabel(since, Date.parse("2026-10-04T14:02:59Z"))).toBe(
			"3d 14h 02m",
		);
	});
	test("never goes negative and is null when off air", () => {
		expect(onAirLabel(since, Date.parse("2026-09-30T00:00:00Z"))).toBe(
			"00h 00m 00s",
		);
		expect(onAirLabel(null, 0)).toBeNull();
	});
	test("rotation wraps and tolerates an empty list", () => {
		expect(rotationIndex(25_000, 3, 10_000)).toBe(2);
		expect(rotationIndex(35_000, 3, 10_000)).toBe(0);
		expect(rotationIndex(35_000, 0, 10_000)).toBe(0);
	});
});
