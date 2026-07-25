import { describe, expect, test } from "bun:test";
import { deriveWebStats, readOutboundStats } from "./web-rtc-stats";

describe("readOutboundStats", () => {
	test("reads outbound video and RTT", () => {
		const report = new Map([
			[
				"out",
				{
					bytesSent: 125_000,
					kind: "video",
					packetsLost: 2,
					packetsSent: 100,
					type: "outbound-rtp",
				},
			],
			[
				"pair",
				{
					currentRoundTripTime: 0.048,
					state: "succeeded",
					type: "candidate-pair",
				},
			],
		]) as unknown as RTCStatsReport;

		expect(readOutboundStats(report)).toEqual({
			bytesSent: 125_000,
			packetsLost: 2,
			packetsSent: 100,
			rttMs: 48,
		});
	});
});

describe("deriveWebStats", () => {
	test("computes bitrate and steps ABR on congestion", () => {
		const result = deriveWebStats({
			ceilingKbps: 3500,
			elapsedMs: 1000,
			previous: {
				bytesSent: 0,
				packetsLost: 0,
				packetsSent: 0,
				rttMs: 40,
			},
			sample: {
				bytesSent: 437_500,
				packetsLost: 5,
				packetsSent: 100,
				rttMs: 420,
			},
			targetBitrateKbps: 3500,
		});
		expect(result.stats.bitrateKbps).toBe(3500);
		expect(result.nextTargetKbps).toBeLessThan(3500);
	});
});
