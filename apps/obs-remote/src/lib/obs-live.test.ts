import { describe, expect, test } from "bun:test";
import {
	COMMAND_TIMEOUT_MS,
	commandAwaitingObs,
	commandTimedOut,
	expireConnection,
	type ObsStatus,
	parseStatusFrame,
	pendingCommandWatch,
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

	test("times out pending commands so the remote UI can unlock", () => {
		const pending = { ...status, pending: true, commandVersion: 5, appliedVersion: 4 };
		const started = Date.parse("2026-07-26T12:00:00.000Z");
		const watch = pendingCommandWatch(pending, null, started);
		expect(watch).toEqual({ commandVersion: 5, startedAt: started });
		expect(pendingCommandWatch(pending, watch, started + 1_000)).toBe(watch);
		expect(commandAwaitingObs(pending, watch, started + 1_000)).toBeTrue();
		expect(
			commandTimedOut(pending, watch, started + COMMAND_TIMEOUT_MS),
		).toBeTrue();
		expect(
			commandAwaitingObs(pending, watch, started + COMMAND_TIMEOUT_MS),
		).toBeFalse();
		expect(pendingCommandWatch({ ...pending, pending: false }, watch)).toBeNull();
		expect(
			pendingCommandWatch(
				{ ...pending, commandVersion: 6 },
				watch,
				started + 20_000,
			),
		).toEqual({ commandVersion: 6, startedAt: started + 20_000 });
	});
});
