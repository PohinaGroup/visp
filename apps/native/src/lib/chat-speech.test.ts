import type { ChatFragment, ChatMessage } from "@VISP/api/chat/contract";
import { describe, expect, mock, test } from "bun:test";
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

const routedFiles: Array<[string, string]> = [];
const routedSpeech: Array<[string, string, string]> = [];

mock.module("react-native", () => ({ Platform: { OS: "android" } }));
mock.module("expo-audio", () => ({
	createAudioPlayer: () => {
		throw new Error("expo-audio should not handle a selected Android output");
	},
	setAudioModeAsync: async () => undefined,
}));
mock.module("expo-file-system", () => ({
	File: class {
		uri = "file:///cache/visp-tts.mp3";
		create() {}
		delete() {}
		write() {}
	},
	Paths: { cache: "/cache" },
}));
mock.module("expo-speech", () => ({
	getAvailableVoicesAsync: async () => [],
	speak: () => {
		throw new Error("expo-speech should not handle a selected Android output");
	},
	stop: async () => undefined,
}));
mock.module("./backend", () => ({
	authenticatedPost: async () => ({
		arrayBuffer: async () => new Uint8Array([1]).buffer,
		ok: true,
	}),
}));
mock.module("../../modules/visp-srt", () => ({
	default: {
		playAudioFile: async (uri: string, outputId: string) => {
			routedFiles.push([uri, outputId]);
		},
		speakToDevice: async (
			value: string,
			language: string,
			outputId: string,
		) => {
			routedSpeech.push([value, language, outputId]);
		},
	},
}));

const { enqueueAlert, enqueueChatMessage, stopChatSpeech } = await import(
	"./chat-speech"
);

async function nextDrain() {
	await new Promise((resolve) => setTimeout(resolve, 10));
}

describe("Android speech output routing", () => {
	test("routes both better and device voices through the native module", async () => {
		routedFiles.length = 0;
		routedSpeech.length = 0;

		enqueueChatMessage(
			{ ...message([text("better")]), id: "better" },
			"en-US",
			true,
			"42",
		);
		await nextDrain();
		expect(routedFiles).toEqual([["file:///cache/visp-tts.mp3", "42"]]);

		enqueueChatMessage(
			{ ...message([text("device")]), id: "device" },
			"en-US",
			false,
			"42",
		);
		await nextDrain();
		expect(routedSpeech).toEqual([["device says Joni", "en-US", "42"]]);
		stopChatSpeech();
	});

	test("reads an alert once across redelivery", async () => {
		routedSpeech.length = 0;
		const alert = {
			id: "raid-1",
			provider: "twitch" as const,
			kind: "raid" as const,
			sentAt: new Date(0).toISOString(),
			name: "Raider",
			amount: 12,
		};
		enqueueAlert(alert, "en-US", false, "42");
		enqueueAlert(alert, "en-US", false, "42");
		await nextDrain();
		expect(routedSpeech).toEqual([
			["Raider raided with 12 viewers", "en-US", "42"],
		]);
		stopChatSpeech();
	});
});
