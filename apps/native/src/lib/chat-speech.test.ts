import type { ChatFragment, ChatMessage } from "@VISP/api/chat/contract";
import { describe, expect, test } from "bun:test";
// Never import ./chat-speech here: it pulls in expo-speech and expo-audio,
// which cannot load outside the app runtime.
import { speechUtterance } from "./chat-model";

const message = (fragments: ChatFragment[], name = "Joni"): ChatMessage => ({
	id: "1",
	provider: "twitch",
	sentAt: new Date(0).toISOString(),
	sender: { id: "u", name, color: "#FF0000", badges: [] },
	fragments,
});

const text = (value: string): ChatFragment => ({ type: "text", text: value });

describe("speech utterance", () => {
	test("puts the message first and the sender last per language", () => {
		expect(speechUtterance(message([text("hello")]), "en-US")).toBe(
			"hello says Joni",
		);
		expect(speechUtterance(message([text("hello")]), "fi-FI")).toBe(
			"hello terveisin Joni",
		);
	});

	test("drops emotes and collapses the gaps they leave", () => {
		const fragments: ChatFragment[] = [
			text("lol"),
			{ type: "emote", text: "Kappa", url: "https://cdn/emote.png" },
			text("ok"),
		];
		expect(speechUtterance(message(fragments), "en-US")).toBe(
			"lol ok says Joni",
		);
	});

	test("stays silent when there is nothing but emotes", () => {
		const fragments: ChatFragment[] = [
			{ type: "emote", text: "Kappa", url: "https://cdn/emote.png" },
		];
		expect(speechUtterance(message(fragments), "en-US")).toBe("");
		expect(speechUtterance(message([text("   ")]), "fi-FI")).toBe("");
	});

	test("reads links as a word instead of spelling them out", () => {
		expect(
			speechUtterance(
				message([text("check https://twitch.tv/x now")]),
				"en-US",
			),
		).toBe("check link now says Joni");
		expect(
			speechUtterance(message([text("katso www.twitch.tv/x")]), "fi-FI"),
		).toBe("katso linkki terveisin Joni");
	});

	test("caps the spoken body so one message cannot monologue", () => {
		const spoken = speechUtterance(message([text("a".repeat(400))]), "en-US");
		expect(spoken).toBe(`${"a".repeat(200)} says Joni`);
	});

	test("caps the sender name", () => {
		const spoken = speechUtterance(
			message([text("hi")], "n".repeat(40)),
			"en-US",
		);
		expect(spoken).toBe(`hi says ${"n".repeat(24)}`);
	});

	test("skips the attribution when the sender has no readable name", () => {
		expect(speechUtterance(message([text("hi")], "  "), "en-US")).toBe("hi");
	});
});
