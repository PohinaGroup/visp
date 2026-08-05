import { describe, expect, test } from "bun:test";
import {
	clampVideoBitrateKbps,
	formatBondedBitrates,
	formatBondedLinks,
	formatLinkStats,
	formatLiveLinkHud,
	formatMbps,
	isLinkCongested,
	linkHealth,
	linkStatsFromPath,
	nextVideoBitrateKbps,
	videoBitrateCeilingKbps,
	videoBitrateFloorKbps,
} from "./link-stats";

describe("isLinkCongested", () => {
	test("flags hard loss or RTT", () => {
		expect(isLinkCongested(2, 40)).toBe(true);
		expect(isLinkCongested(0, 400)).toBe(true);
		expect(isLinkCongested(0.1, 40)).toBe(false);
	});
});

describe("linkStatsFromPath", () => {
	const fresh = {
		linkBitrateKbps: 2100,
		linkPacketLossPct: 0.2,
		linkCount: 2,
		linkDegraded: false,
		linkRttMs: 48,
		linkStatsAt: new Date(),
		linkTargetBitrateKbps: 3500,
		publishing: true,
	};

	test("returns a view for fresh live samples and derives congestion", () => {
		expect(linkStatsFromPath(fresh)).toEqual({
			bitrateKbps: 2100,
			congested: false,
			linkCount: 2,
			linkDegraded: false,
			packetLossPct: 0.2,
			rttMs: 48,
			targetBitrateKbps: 3500,
			updatedAt: fresh.linkStatsAt.toISOString(),
		});
		expect(
			linkStatsFromPath({ ...fresh, linkPacketLossPct: 5, linkRttMs: 40 })
				?.congested,
		).toBe(true);
	});

	test("hides stale or offline samples", () => {
		expect(
			linkStatsFromPath({
				...fresh,
				linkStatsAt: new Date(Date.now() - 20_000),
			}),
		).toBeNull();
		expect(linkStatsFromPath({ ...fresh, publishing: false })).toBeNull();
		expect(linkStatsFromPath({ ...fresh, linkBitrateKbps: null })).toBeNull();
	});
});

describe("formatLinkStats", () => {
	test("formats bitrate, rtt, and loss", () => {
		expect(
			formatLinkStats({ bitrateKbps: 2100, packetLossPct: 0.2, rttMs: 48 }),
		).toBe("2.1 Mb/s · 48 ms · 0.2%");
	});
});

describe("formatLiveLinkHud", () => {
	test("returns empty when not live or missing stats", () => {
		expect(formatLiveLinkHud(undefined, true)).toBe("");
		expect(
			formatLiveLinkHud(
				{ bitrateKbps: 2100, packetLossPct: 0.2, rttMs: 48 },
				false,
			),
		).toBe("");
	});

	test("prefixes formatted stats when live", () => {
		expect(
			formatLiveLinkHud(
				{ bitrateKbps: 2100, packetLossPct: 0.2, rttMs: 48 },
				true,
			),
		).toBe(" · 2.1 Mb/s · 48 ms · 0.2%");
	});
});

test("formats per-link bonded stats", () => {
	expect(
		formatBondedLinks([
			{
				bitrateKbps: 2100,
				packetLossPct: 0.2,
				rttMs: 48,
				state: "connected",
				transport: "wifi",
			},
			{
				bitrateKbps: 0,
				packetLossPct: 0,
				rttMs: 0,
				state: "broken",
				transport: "cellular",
			},
		]),
	).toBe("Wi-Fi 2.1 Mb/s · 48 ms · 0.2% · Cellular broken");
});

describe("formatMbps", () => {
	test("renders kbps as one decimal of Mb/s", () => {
		expect(formatMbps(2100)).toBe("2.1");
		expect(formatMbps(0)).toBe("0.0");
		expect(formatMbps(6000)).toBe("6.0");
	});
});

describe("linkHealth", () => {
	test("tiers on the shared soft and congestion thresholds", () => {
		expect(linkHealth(0.1, 40)).toBe("good");
		expect(linkHealth(0.5, 40)).toBe("soft");
		expect(linkHealth(0.1, 250)).toBe("soft");
		expect(linkHealth(2, 40)).toBe("congested");
		expect(linkHealth(0.1, 400)).toBe("congested");
	});
});

describe("formatBondedBitrates", () => {
	test("shows bitrate per link and falls back to link state", () => {
		expect(formatBondedBitrates(undefined)).toBe("");
		expect(
			formatBondedBitrates([
				{ bitrateKbps: 3100, state: "connected", transport: "wifi" },
				{ bitrateKbps: 0, state: "broken", transport: "cellular" },
			]),
		).toBe("Wi-Fi 3.1 Mb/s · Cellular broken");
	});
});

describe("videoBitrateCeilingKbps", () => {
	test("uses 3500 for 720p", () => {
		expect(videoBitrateCeilingKbps(1280, 720, 30, "full")).toBe(3500);
		expect(videoBitrateCeilingKbps(720, 1280, 30)).toBe(3500);
	});

	test("uses 6000 for 1080p30 and 8000 for 1080p60", () => {
		expect(videoBitrateCeilingKbps(1920, 1080, 30, "full")).toBe(6000);
		expect(videoBitrateCeilingKbps(1080, 1920, 60, "full")).toBe(8000);
	});

	test("uses the lighter Direct ladder without changing format", () => {
		expect(videoBitrateCeilingKbps(1280, 720, 30, "direct")).toBe(1500);
		expect(videoBitrateCeilingKbps(1920, 1080, 30, "direct")).toBe(2500);
		expect(videoBitrateCeilingKbps(1080, 1920, 50, "direct")).toBe(3500);
	});
});

describe("videoBitrateFloorKbps", () => {
	test("floors at max(500, ceiling/10)", () => {
		expect(videoBitrateFloorKbps(3500)).toBe(500);
		expect(videoBitrateFloorKbps(8000)).toBe(800);
	});
});

describe("clampVideoBitrateKbps", () => {
	test("clamps into the ABR window", () => {
		expect(clampVideoBitrateKbps(100, 3500)).toBe(500);
		expect(clampVideoBitrateKbps(9000, 3500)).toBe(3500);
		expect(clampVideoBitrateKbps(2100.4, 3500)).toBe(2100);
	});
});

describe("nextVideoBitrateKbps", () => {
	test("steps down on congestion and up when healthy", () => {
		expect(
			nextVideoBitrateKbps({
				ceilingKbps: 3500,
				currentTargetKbps: 3500,
				packetLossPct: 5,
				rttMs: 40,
			}),
		).toBe(3150);

		expect(
			nextVideoBitrateKbps({
				ceilingKbps: 3500,
				currentTargetKbps: 2000,
				packetLossPct: 0,
				rttMs: 40,
			}),
		).toBe(2175);
	});
});
