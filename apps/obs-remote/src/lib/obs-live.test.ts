import { describe, expect, test } from "bun:test";
import {
	expireConnection,
	type ObsStatus,
	parseStatusFrame,
	reconnectDelay,
} from "./obs-live";

const status: ObsStatus = {
	configured: true,
	connected: true,
	connectedUntil: "2026-07-26T12:00:10.000Z",
	streaming: false,
	desiredStreaming: false,
	recording: false,
	virtualCam: false,
	replayBuffer: false,
	recordPaused: false,
	scenes: ["Program"],
	currentScene: "Program",
	desiredScene: "Program",
	pending: false,
	lastSeenAt: "2026-07-26T12:00:00.000Z",
	commandVersion: 4,
	appliedVersion: 4,
};

describe("OBS live status", () => {
	test("validates frames, expires leases, and caps retries", () => {
		expect(
			parseStatusFrame(JSON.stringify({ type: "status", status })),
		).toEqual(status);
		expect(
			parseStatusFrame('{"type":"status","status":{"connected":true}}'),
		).toBeNull();
		expect(
			expireConnection(status, Date.parse(status.connectedUntil as string))
				.connected,
		).toBeFalse();
		expect(reconnectDelay(0)).toBe(500);
		expect(reconnectDelay(20)).toBe(15_000);
	});
});
