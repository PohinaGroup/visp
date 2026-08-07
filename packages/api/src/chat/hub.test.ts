import { expect, test } from "bun:test";
import type { ChatLiveEvent } from "./contract";
import { chatHub } from "./hub";

test("chat status includes the provider failure", () => {
	const events: ChatLiveEvent[] = [];
	const unsubscribe = chatHub.subscribe("status-error-test", (event) =>
		events.push(event),
	);

	chatHub.status(
		"status-error-test",
		"twitch",
		"error",
		"Twitch subscription failed (503)",
	);

	expect(events.at(-1)).toEqual({
		type: "status",
		status: {
			provider: "twitch",
			state: "error",
			error: "Twitch subscription failed (503)",
		},
	});
	unsubscribe();
});

test("connector refresh notifies local listeners", () => {
	const calls: string[] = [];
	const unsubscribe = chatHub.onConnectorRefresh((userId) =>
		calls.push(userId),
	);

	chatHub.requestConnectorRefresh("refresh-user");

	expect(calls).toEqual(["refresh-user"]);
	unsubscribe();
});
