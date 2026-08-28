import { describe, expect, test } from "bun:test";
import { DEFAULT_CHAT_PREFERENCES, parseChatPreferences } from "./chat-model";

describe("chat display preferences", () => {
	test("falls back for invalid persisted values", () => {
		expect(parseChatPreferences("not-json")).toEqual(DEFAULT_CHAT_PREFERENCES);
		expect(
			parseChatPreferences(JSON.stringify({ mode: "wat", corner: "middle" })),
		).toEqual(DEFAULT_CHAT_PREFERENCES);
	});

	test("defaults old preferences to non-disappearing messages", () => {
		expect(
			parseChatPreferences(JSON.stringify({ mode: "floating" })),
		).toMatchObject({
			alerts: true,
			mode: "floating",
			disappearingMessages: false,
		});
	});

	test("preserves disabled viewer alerts", () => {
		expect(
			parseChatPreferences(JSON.stringify({ alerts: false })),
		).toMatchObject({
			alerts: false,
		});
	});

	test("preserves disappearing messages when enabled", () => {
		expect(
			parseChatPreferences(JSON.stringify({ disappearingMessages: true })),
		).toMatchObject({ disappearingMessages: true });
	});

	test("leaves read-aloud off for preferences saved before it existed", () => {
		expect(
			parseChatPreferences(JSON.stringify({ mode: "floating" })),
		).toMatchObject({ speechLanguage: "off", betterVoice: false });
	});

	test("keeps a supported speech language and rejects the rest", () => {
		expect(
			parseChatPreferences(
				JSON.stringify({ speechLanguage: "fi-FI", betterVoice: true }),
			),
		).toMatchObject({ speechLanguage: "fi-FI", betterVoice: true });
		expect(
			parseChatPreferences(JSON.stringify({ speechLanguage: "sv-SE" })),
		).toMatchObject({ speechLanguage: "off" });
	});

	test("clamps floating positions", () => {
		const parsed = parseChatPreferences(
			JSON.stringify({
				mode: "embedded",
				corner: "top-right",
				floating: { portrait: { x: -10, y: 25 }, landscape: { x: 40, y: -2 } },
			}),
		);
		expect(parsed).toMatchObject({
			mode: "embedded",
			corner: "top-right",
			floating: { portrait: { x: 0, y: 25 }, landscape: { x: 40, y: 0 } },
		});
	});
});
