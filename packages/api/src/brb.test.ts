import { describe, expect, test } from "bun:test";

import "./test-env";

const { brbBackgroundKey, brbHolds, brbImageKey, splitBrbEligible } =
	await import("./brb");

const path = (over: Partial<Parameters<typeof splitBrbEligible>[0][0]> = {}) => ({
	pathId: 1,
	brbEnabled: true,
	revoked: false,
	providers: [{ enabled: true, state: "live" }],
	...over,
});

describe("splitBrbEligible", () => {
	test("holds a path whose owner enabled BRB and has a running forwarder", () => {
		expect(splitBrbEligible([path()])).toEqual({ brbIds: [1], stopIds: [] });
	});

	test("tears down when the owner never enabled BRB", () => {
		expect(splitBrbEligible([path({ brbEnabled: false })])).toEqual({
			brbIds: [],
			stopIds: [1],
		});
	});

	// Otherwise a device with no Direct output, or one whose providers all
	// failed consent, keeps a BRB marker that nothing is running to clear.
	test("tears down when no enabled provider is actually forwarding", () => {
		expect(
			splitBrbEligible([
				path({ providers: [{ enabled: true, state: "failed" }] }),
			]),
		).toEqual({ brbIds: [], stopIds: [1] });
		expect(
			splitBrbEligible([path({ providers: [{ enabled: false, state: "live" }] })]),
		).toEqual({ brbIds: [], stopIds: [1] });
		expect(
			splitBrbEligible([path({ providers: [{ enabled: true, state: null }] })]),
		).toEqual({ brbIds: [], stopIds: [1] });
	});

	test("keeps holding a forwarder that already reported brb", () => {
		expect(
			splitBrbEligible([path({ providers: [{ enabled: true, state: "brb" }] })])
				.brbIds,
		).toEqual([1]);
	});

	test("a revoked device never holds", () => {
		expect(splitBrbEligible([path({ revoked: true })])).toEqual({
			brbIds: [],
			stopIds: [1],
		});
	});

	test("splits a mixed batch, which is what the reconciler passes", () => {
		expect(
			splitBrbEligible([
				path({ pathId: 1 }),
				path({ pathId: 2, brbEnabled: false }),
				path({ pathId: 3 }),
			]),
		).toEqual({ brbIds: [1, 3], stopIds: [2] });
	});
});

describe("brbHolds", () => {
	const base = {
		now: 1_000_000,
		enabled: true,
		providerEnabled: true,
		revoked: false,
		brbSince: new Date(1_000_000 - 60_000),
	};

	test("holds while the marker is set and inside the ceiling", () => {
		expect(brbHolds(base)).toBe(true);
	});

	// Every way out of BRB has to resolve to a stop line on the next tick.
	test("stops once the dashboard clears the marker", () => {
		expect(brbHolds({ ...base, brbSince: null })).toBe(false);
	});

	test("stops when BRB is switched off or the provider is turned off", () => {
		expect(brbHolds({ ...base, enabled: false })).toBe(false);
		expect(brbHolds({ ...base, providerEnabled: false })).toBe(false);
	});

	test("stops when the device is revoked", () => {
		expect(brbHolds({ ...base, revoked: true })).toBe(false);
	});

	// A held forwarder burns an encoder slot, so an abandoned one must not
	// hold a slot forever.
	test("stops past the stuck-process ceiling", () => {
		const sixHoursAgo = new Date(base.now - 6 * 60 * 60 * 1000 - 1);
		expect(brbHolds({ ...base, brbSince: sixHoursAgo })).toBe(false);
	});
});

describe("brbBackgroundKey", () => {
	test("snapshot reuses the existing per-path snapshot object", () => {
		expect(
			brbBackgroundKey({ source: "snapshot", pathId: 7, imageKey: null }),
		).toBe("snapshots/7.jpg");
	});

	test("image uses the uploaded key, and falls back when there is none", () => {
		expect(
			brbBackgroundKey({
				source: "image",
				pathId: 7,
				imageKey: "brb/user-a.png",
			}),
		).toBe("brb/user-a.png");
		expect(
			brbBackgroundKey({ source: "image", pathId: 7, imageKey: null }),
		).toBeNull();
	});

	test("color has no object at all", () => {
		expect(
			brbBackgroundKey({ source: "color", pathId: 7, imageKey: "brb/x.png" }),
		).toBeNull();
	});
});

describe("brbImageKey", () => {
	test("one key per user per type, so re-uploads overwrite", () => {
		expect(brbImageKey("user-a", "image/png")).toBe("brb/user-a.png");
		expect(brbImageKey("user-a", "image/jpeg")).toBe("brb/user-a.jpg");
	});
});
