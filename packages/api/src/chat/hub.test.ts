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

test("provider alerts isolate failing Studio bridge listeners", async () => {
	const calls: Array<{ userId: string; event: ChatLiveEvent }> = [];
	const unsubscribeFailing = chatHub.onPublished(() => {
		throw new Error("listener failed");
	});
	const unsubscribeRejecting = chatHub.onPublished(async () => {
		throw new Error("async listener failed");
	});
	const unsubscribe = chatHub.onPublished((userId, event) => {
		if (userId === "studio-alert-user") calls.push({ userId, event });
	});
	const originalError = console.error;
	const errors: unknown[][] = [];
	console.error = (...args) => errors.push(args);
	try {
		chatHub.publish("studio-alert-user", {
			type: "alert",
			alert: {
				id: "raid-1",
				provider: "twitch",
				kind: "raid",
				sentAt: "2026-08-26T12:00:00.000Z",
				name: "Ada",
			},
		});
		await Bun.sleep(0);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.event.type).toBe("alert");
		const messages = errors.map(([, error]) => (error as Error).message);
		expect(messages).toContain("listener failed");
		expect(messages).toContain("async listener failed");
	} finally {
		console.error = originalError;
		unsubscribeFailing();
		unsubscribeRejecting();
		unsubscribe();
	}
});
