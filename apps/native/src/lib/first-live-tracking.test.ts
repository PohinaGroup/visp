import { describe, expect, test } from "bun:test";
import { firstLiveProvidersToTrack } from "./first-live-tracking";

describe("firstLiveProvidersToTrack", () => {
	test("returns enabled providers that just reached live", () => {
		const pending = firstLiveProvidersToTrack(
			{
				twitch: true,
				kick: false,
				youtube: false,
				state: { twitch: "live", kick: null, youtube: null },
			},
			new Set(),
		);
		expect(pending).toEqual(["twitch"]);
	});

	test("skips providers already tracked or not live yet", () => {
		const pending = firstLiveProvidersToTrack(
			{
				twitch: true,
				kick: true,
				youtube: false,
				state: {
					twitch: "live",
					kick: "starting",
					youtube: null,
				},
			},
			new Set(["twitch"]),
		);
		expect(pending).toEqual([]);
	});

	test("reports each provider once when both go live", () => {
		const tracked = new Set<"twitch" | "kick" | "youtube">();
		const path = {
			twitch: true,
			kick: true,
			youtube: false,
			state: {
				twitch: "live" as const,
				kick: "live" as const,
				youtube: null,
			},
		};
		const first = firstLiveProvidersToTrack(path, tracked);
		for (const provider of first) tracked.add(provider);
		expect(first.sort()).toEqual(["kick", "twitch"]);
		expect(firstLiveProvidersToTrack(path, tracked)).toEqual([]);
	});
});
