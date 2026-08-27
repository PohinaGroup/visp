import { describe, expect, test } from "bun:test";

import {
	directDestinationResponse,
	formatLegacyDirectDestinations,
	formatV2DirectDestinations,
} from "./direct-hook-contract";

const destinations = [
	{
		provider: "twitch" as const,
		role: "landscape" as const,
		filter: null,
		url: "rtmps://ingest.global-contribute.live-video.net/app/key",
	},
	{
		provider: "kick" as const,
		role: "portrait" as const,
		filter: "crop=iw*0.3:ih*1:iw*0.35:ih*0,scale=1080:1920",
		url: "rtmps://stream.kick.com/app/key",
	},
];

describe("Direct relay hook rollout contracts", () => {
	test("keeps the legacy endpoint exactly provider-url and landscape-only", () => {
		expect(formatLegacyDirectDestinations(destinations)).toBe(
			"twitch rtmps://ingest.global-contribute.live-video.net/app/key\n",
		);
	});

	test("the versioned endpoint carries role and an explicit filter sentinel", () => {
		expect(formatV2DirectDestinations(destinations)).toBe(
			"twitch landscape - rtmps://ingest.global-contribute.live-video.net/app/key\n" +
				"kick portrait crop=iw*0.3:ih*1:iw*0.35:ih*0,scale=1080:1920 rtmps://stream.kick.com/app/key\n",
		);
	});

	test("neither formatter serializes an invalid secret destination", () => {
		const invalid = [
			{
				provider: "twitch" as const,
				role: "landscape" as const,
				filter: null,
				url: "rtmps://attacker.example/app/secret-key\ninjected record",
			},
		];
		for (const format of [
			formatLegacyDirectDestinations,
			formatV2DirectDestinations,
		]) {
			expect(() => format(invalid)).toThrow("Invalid Direct destination");
			try {
				format(invalid);
			} catch (error) {
				expect(String(error)).not.toContain("secret-key");
			}
		}
	});

	test("secret-bearing hook responses cannot be cached", () => {
		for (const body of [
			formatLegacyDirectDestinations(destinations),
			formatV2DirectDestinations(destinations),
		]) {
			const response = directDestinationResponse(body);
			expect(response.headers.get("Cache-Control")).toBe("no-store");
			expect(response.headers.get("Content-Type")).toBe(
				"text/plain; charset=utf-8",
			);
		}
	});
});
