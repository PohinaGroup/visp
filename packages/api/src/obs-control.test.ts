import "./test-env";

import { describe, expect, test } from "bun:test";
import { obsControlStatus, parseObsControlToken } from "./obs-control";

describe("OBS control token", () => {
	test("accepts only the exact bearer token shape", () => {
		const id = "a".repeat(24);
		const secret = "b".repeat(64);
		expect(parseObsControlToken(`Bearer ${id}.${secret}`)).toEqual({
			id,
			secret,
		});
		expect(parseObsControlToken(`${id}.${secret}`)).toBeNull();
		expect(parseObsControlToken(`Bearer ${id}.${secret}.extra`)).toBeNull();
		expect(parseObsControlToken("Bearer ../bad")).toBeNull();
	});
});

describe("OBS control status", () => {
	test("includes connection expiry and command versions", () => {
		const lastSeenAt = new Date("2026-07-26T12:00:00.000Z");
		const row = {
			obsControlTokenHash: "hash",
			obsDesiredStreaming: true,
			obsStreaming: false,
			obsDesiredRecording: true,
			obsRecording: false,
			obsDesiredVirtualCam: false,
			obsVirtualCam: false,
			obsDesiredReplayBuffer: false,
			obsReplayBuffer: false,
			obsDesiredRecordPaused: false,
			obsRecordPaused: false,
			obsScenes: ["Main"],
			obsCurrentScene: "Main",
			obsDesiredScene: null,
			obsCommandVersion: 3,
			obsAppliedVersion: 2,
			obsLastSeenAt: lastSeenAt,
		};
		expect(obsControlStatus(row, lastSeenAt.getTime() + 9_999)).toEqual({
			configured: true,
			connected: true,
			connectedUntil: "2026-07-26T12:00:10.000Z",
			streaming: false,
			desiredStreaming: true,
			recording: false,
			desiredRecording: true,
			virtualCam: false,
			desiredVirtualCam: false,
			replayBuffer: false,
			desiredReplayBuffer: false,
			recordPaused: false,
			desiredRecordPaused: false,
			scenes: ["Main"],
			currentScene: "Main",
			desiredScene: null,
			pending: true,
			lastSeenAt: "2026-07-26T12:00:00.000Z",
			commandVersion: 3,
			appliedVersion: 2,
		});
		expect(obsControlStatus(row, lastSeenAt.getTime() + 10_000).connected).toBe(
			false,
		);
	});
});
