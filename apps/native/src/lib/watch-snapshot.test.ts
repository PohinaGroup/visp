import type { ChatMessage } from "@VISP/api/chat/contract";
import { describe, expect, test } from "bun:test";
import { buildWatchSnapshot } from "./watch-snapshot";

function message(id: string): ChatMessage {
	return {
		id,
		provider: "twitch",
		sentAt: "2026-07-18T00:00:00.000Z",
		sender: {
			id: "viewer",
			name: "Viewer",
			color: "#AABBCC",
			badges: [
				{
					type: "moderator",
					label: "Moderator",
					url: "https://static-cdn.jtvnw.net/mod.png",
				},
			],
		},
		fragments: [
			{ type: "text", text: "Hi " },
			{ type: "emote", text: "Wave", url: "https://example.test/wave" },
		],
	};
}

describe("watch snapshot", () => {
	test("keeps three text-only messages and current stream health", () => {
		const snapshot = buildWatchSnapshot({
			audioTier: 2,
			configuration: { cameraId: "back", width: 1280, height: 720, fps: 30 },
			liveStartedAt: 100,
			message: "Reconnect attempt 2 of 3",
			messages: [1, 2, 3, 4, 5].map((id) => message(String(id))),
			obs: {
				configured: true,
				connected: true,
				pending: false,
				scenes: ["Main", "Be right back"],
				currentScene: "Main",
				desiredScene: "Main",
			},
			reconnectAttempt: 2,
			state: "reconnecting",
			statuses: { twitch: "connected", kick: "disconnected" },
			updatedAt: 200,
		});

		expect(snapshot.chat.messages.map(({ id }) => id)).toEqual(["3", "4", "5"]);
		expect(snapshot.chat.messages[0]).toEqual({
			id: "3",
			provider: "twitch",
			senderName: "Viewer",
			senderColor: "#AABBCC",
			badges: ["Moderator"],
			text: "Hi Wave",
		});
		expect(snapshot.stream).toEqual({
			state: "reconnecting",
			liveStartedAt: 100,
			audioTier: 2,
			width: 1280,
			height: 720,
			fps: 30,
			message: "Reconnect attempt 2 of 3",
			reconnectAttempt: 2,
		});
		expect(snapshot.obs?.scenes).toEqual(["Main", "Be right back"]);
		expect(snapshot.obs?.currentScene).toBe("Main");
		expect(JSON.stringify(snapshot)).not.toContain("example.test");
		expect(JSON.stringify(snapshot)).not.toContain("opacity");
	});
});
