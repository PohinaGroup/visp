import type { ChatMessage } from "@VISP/api/chat/contract";
import { describe, expect, test } from "bun:test";
import { visibleChatMessages } from "./chat-model";

const message = (
	id: string,
	receivedAt: number,
): ChatMessage & { receivedAt: number } => ({
	id,
	provider: "twitch",
	sentAt: new Date(0).toISOString(),
	sender: { id: "u", name: "user", color: "#FF0000", badges: [] },
	fragments: [{ type: "text", text: id }],
	receivedAt,
});

describe("visible chat messages", () => {
	test("keeps the latest three indefinitely by default", () => {
		const messages = [1, 2, 3, 4, 5].map((id) => message(String(id), id * 100));
		expect(visibleChatMessages(messages, false, 20_000)).toEqual([
			{ ...messages[2], opacity: 1 },
			{ ...messages[3], opacity: 1 },
			{ ...messages[4], opacity: 1 },
		]);
	});

	test("fades after eight seconds and removes at twelve when enabled", () => {
		const messages = [1, 2, 3, 4].map((id) => message(String(id), id * 100));
		expect(
			visibleChatMessages(messages, true, 1_000).map(({ id }) => id),
		).toEqual(["2", "3", "4"]);
		expect(
			visibleChatMessages([message("fade", 0)], true, 10_000)[0]?.opacity,
		).toBe(0.5);
		expect(visibleChatMessages([message("gone", 0)], true, 12_000)).toEqual([]);
	});
});
