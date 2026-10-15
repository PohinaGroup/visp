import { describe, expect, test } from "bun:test";
import "../test-env";
import type { MultiChatProvider } from "./contract";

const { planSourceChanges } = await import("./connectors");

const running = (entries: Array<[MultiChatProvider, string]>) =>
	new Map(
		entries.map(([provider, channelLogin]) => [provider, { channelLogin }]),
	);

describe("multichat source refresh plan", () => {
	test("an unchanged save touches no provider connection", () => {
		expect(
			planSourceChanges(
				running([
					["kick", "visp"],
					["twitch", "visp"],
				]),
				[
					{ provider: "kick", channelLogin: "visp" },
					{ provider: "twitch", channelLogin: "visp" },
				],
			),
		).toEqual({ stop: [], start: [] });
	});

	test("restarts only the source that changed", () => {
		expect(
			planSourceChanges(
				running([
					["kick", "visp"],
					["tiktok", "old"],
				]),
				[
					{ provider: "kick", channelLogin: "visp" },
					{ provider: "tiktok", channelLogin: "new" },
				],
			),
		).toEqual({
			stop: ["tiktok"],
			start: [{ provider: "tiktok", channelLogin: "new" }],
		});
	});

	test("stops disabled sources and starts ones that are not running", () => {
		expect(
			planSourceChanges(running([["kick", "visp"]]), [
				{ provider: "twitch", channelLogin: "visp" },
			]),
		).toEqual({
			stop: ["kick"],
			start: [{ provider: "twitch", channelLogin: "visp" }],
		});
	});
});
