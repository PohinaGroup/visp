import { describe, expect, test } from "bun:test";
import type { ObsCommand, ObsStatus } from "./obs-live";
import { ObsLiveHub } from "./obs-live";

const status = {
	configured: true,
	connected: true,
	connectedUntil: "2026-07-26T12:00:10.000Z",
	streaming: false,
	desiredStreaming: true,
	scenes: ["Main"],
	currentScene: "Main",
	desiredScene: null,
	pending: true,
	lastSeenAt: "2026-07-26T12:00:00.000Z",
	commandVersion: 2,
	appliedVersion: 1,
} satisfies ObsStatus;

describe("OBS live hub", () => {
	test("isolates users and status from machine commands", () => {
		const hub = new ObsLiveHub();
		const statuses: ObsStatus[] = [];
		const commands: ObsCommand[] = [];
		const unsubscribe = hub.subscribeStatus("user-a", (value) =>
			statuses.push(value),
		);
		hub.subscribeCommands("user-a", (value) => commands.push(value));

		hub.publishStatus("user-b", status);
		hub.publishCommand("user-a", "token-a", {
			commandVersion: 2,
			desiredStreaming: true,
			desiredScene: null,
		});
		hub.publishStatus("user-a", status);
		unsubscribe();
		hub.publishStatus("user-a", { ...status, streaming: true });

		expect(statuses).toEqual([status]);
		expect(commands).toEqual([
			{ commandVersion: 2, desiredStreaming: true, desiredScene: null },
		]);
	});
});
