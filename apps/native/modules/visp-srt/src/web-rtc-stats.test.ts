import { describe, expect, test } from "bun:test";
import { deriveWebStats, readOutboundStats } from "./web-rtc-stats";

describe("readOutboundStats", () => {
	test("reads outbound video and RTT", () => {
		const report = new Map([
			[
				"out",
				{
					bytesSent: 125_000,
					framesDropped: 3,
					framesEncoded: 30,
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
			framesDropped: 3,
			framesEncoded: 30,
			packetsLost: 2,
			packetsSent: 100,
			rttMs: 48,
		});
	});
});

describe("deriveWebStats", () => {
	test("reports congestion without lowering WebRTC's configured ceiling", () => {
		const result = deriveWebStats({
			ceilingKbps: 3500,
			elapsedMs: 1000,
			previous: {
				bytesSent: 0,
				framesDropped: 0,
				framesEncoded: 0,
				packetsLost: 0,
				packetsSent: 0,
				rttMs: 40,
			},
			sample: {
				bytesSent: 437_500,
				framesDropped: 2,
				framesEncoded: 30,
				packetsLost: 5,
				packetsSent: 100,
				rttMs: 420,
			},
			targetBitrateKbps: 3500,
		});
		expect(result.stats.bitrateKbps).toBe(3500);
		expect(result.stats.encodedFps).toBe(30);
		expect(result.stats.droppedVideoFrames).toBe(2);
		expect(result.nextTargetKbps).toBe(3500);
	});
});
