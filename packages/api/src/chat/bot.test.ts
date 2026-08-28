import { describe, expect, test } from "bun:test";

import "../test-env";

const { assertBotSenderModeAllowed, resolveBotSenderMode } = await import(
	"./sender"
);

describe("bot sender selection", () => {
	test("defaults and fails closed to the VISP bot", () => {
		expect(resolveBotSenderMode(undefined, false)).toBe("visp");
		expect(resolveBotSenderMode("self", false)).toBe("visp");
	});

	test("allows own-account mode only with feature access", () => {
		expect(resolveBotSenderMode("self", true)).toBe("self");
		expect(resolveBotSenderMode("visp", true)).toBe("visp");
		expect(() => assertBotSenderModeAllowed("self", false)).toThrow();
		expect(() => assertBotSenderModeAllowed("self", true)).not.toThrow();
	});
});
