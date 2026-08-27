import { describe, expect, test } from "bun:test";

import "./test-env";

const {
	brbBackgroundKey,
	brbHolds,
	brbHighlightKey,
	brbImageKey,
	inspectBrbHighlightMp4,
	validateBrbHighlight,
	splitBrbEligible,
} = await import("./brb");

const path = (
	over: Partial<Parameters<typeof splitBrbEligible>[0][0]> = {},
) => ({
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
			splitBrbEligible([
				path({ providers: [{ enabled: false, state: "live" }] }),
			]),
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

describe("BRB highlights", () => {
	const box = (type: string, ...parts: Uint8Array[]) => {
		const size = 8 + parts.reduce((total, part) => total + part.length, 0);
		const bytes = new Uint8Array(size);
		new DataView(bytes.buffer).setUint32(0, size);
		bytes.set(new TextEncoder().encode(type), 4);
		let offset = 8;
		for (const part of parts) {
			bytes.set(part, offset);
			offset += part.length;
		}
		return bytes;
	};
	const concat = (...parts: Uint8Array[]) => {
		const bytes = new Uint8Array(
			parts.reduce((total, part) => total + part.length, 0),
		);
		let offset = 0;
		for (const part of parts) {
			bytes.set(part, offset);
			offset += part.length;
		}
		return bytes;
	};
	const track = (type: "avc1" | "mp4a", width = 0, height = 0) => {
		const tkhd = new Uint8Array(84);
		new DataView(tkhd.buffer).setUint32(76, width << 16);
		new DataView(tkhd.buffer).setUint32(80, height << 16);
		const entry =
			type === "avc1"
				? box(
						"avc1",
						new Uint8Array(78),
						box("avcC", new Uint8Array([1, 100, 0, 40, 255, 225, 0])),
					)
				: box("mp4a", new Uint8Array(28));
		const stsd = concat(new Uint8Array(4), new Uint8Array([0, 0, 0, 1]), entry);
		return box(
			"trak",
			box("tkhd", tkhd),
			box("mdia", box("minf", box("stbl", box("stsd", stsd)))),
		);
	};

	test("uses an account-scoped object key", () => {
		expect(brbHighlightKey("user-a", "clip-a")).toBe(
			"brb/user-a/highlights/clip-a.mp4",
		);
	});

	test("accepts an H.264 MP4 inside the published limits", () => {
		expect(
			validateBrbHighlight({
				contentType: "video/mp4",
				codec: "avc1.640028",
				durationMs: 30_000,
				byteSize: 25 * 1024 * 1024,
			}),
		).toBeNull();
	});

	test("rejects the type, codec, duration, and size independently", () => {
		const valid = {
			contentType: "video/mp4",
			codec: "avc1",
			durationMs: 10_000,
			byteSize: 1024,
		};
		expect(validateBrbHighlight({ ...valid, contentType: "video/webm" })).toBe(
			"type",
		);
		expect(validateBrbHighlight({ ...valid, codec: "vp09" })).toBe("codec");
		expect(validateBrbHighlight({ ...valid, durationMs: 30_001 })).toBe(
			"duration",
		);
		expect(
			validateBrbHighlight({
				...valid,
				byteSize: 25 * 1024 * 1024 + 1,
			}),
		).toBe("size");
	});

	test("reads H.264, duration, and dimensions from actual MP4 boxes", () => {
		const mvhd = new Uint8Array(24);
		new DataView(mvhd.buffer).setUint32(12, 1000);
		new DataView(mvhd.buffer).setUint32(16, 12_500);
		const bytes = concat(
			box("ftyp", new TextEncoder().encode("isom")),
			box("moov", box("mvhd", mvhd), track("mp4a"), track("avc1", 1920, 1080)),
		);
		expect(inspectBrbHighlightMp4(bytes)).toEqual({
			codec: "avc1",
			durationMs: 12_500,
			width: 1920,
			height: 1080,
		});
	});

	test("rejects a structured avc1 marker without codec configuration", () => {
		const mvhd = new Uint8Array(24);
		new DataView(mvhd.buffer).setUint32(12, 1000);
		new DataView(mvhd.buffer).setUint32(16, 1000);
		const tkhd = new Uint8Array(84);
		new DataView(tkhd.buffer).setUint32(76, 1280 << 16);
		new DataView(tkhd.buffer).setUint32(80, 720 << 16);
		const fakeEntry = box("avc1", new Uint8Array(78));
		const stsd = concat(
			new Uint8Array(4),
			new Uint8Array([0, 0, 0, 1]),
			fakeEntry,
		);
		const bytes = concat(
			box("ftyp", new TextEncoder().encode("isom")),
			box(
				"moov",
				box("mvhd", mvhd),
				box(
					"trak",
					box("tkhd", tkhd),
					box("mdia", box("minf", box("stbl", box("stsd", stsd)))),
				),
			),
		);
		expect(inspectBrbHighlightMp4(bytes)).toBeNull();
	});

	test("rejects junk that merely contains MP4 marker strings", () => {
		const junk = new Uint8Array(64);
		junk.set(new TextEncoder().encode("mvhd"), 4);
		junk.set(new TextEncoder().encode("avc1"), 48);
		expect(inspectBrbHighlightMp4(junk)).toBeNull();
	});
});
