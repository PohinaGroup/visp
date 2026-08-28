import { describe, expect, test } from "bun:test";

import {
	directDestinationJsonResponse,
	directDestinationResponse,
	formatLegacyDirectDestinations,
	formatV2DirectDestinations,
	formatV3DirectDestinations,
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

	test("v3 carries opaque managed and custom output identities as JSON", async () => {
		const body = await formatV3DirectDestinations(
			[
				{
					outputId: "managed-twitch-landscape",
					kind: "managed",
					label: "twitch",
					role: "landscape",
					protocol: "rtmps",
					muxer: "flv",
					filter: null,
					url: destinations[0]?.url ?? "",
				},
				{
					outputId: "160b40b3-4e27-4773-9941-1c93ec895906",
					kind: "custom",
					label: "Backup ingest",
					role: "landscape",
					protocol: "srt",
					muxer: "mpegts",
					filter: null,
					url: "srt://receiver.example:9000?streamid=publish:key",
				},
			],
			async () => ["8.8.8.8"],
		);
		expect(JSON.parse(body)).toEqual({
			destinations: expect.arrayContaining([
				expect.objectContaining({ kind: "managed", muxer: "flv" }),
				expect.objectContaining({ kind: "custom", muxer: "mpegts" }),
			]),
		});
		const response = directDestinationJsonResponse(body);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("Content-Type")).toBe(
			"application/json; charset=utf-8",
		);
	});

	test("v3 rejects protocol and muxer mismatches without echoing secrets", async () => {
		const invalid = {
			outputId: "160b40b3-4e27-4773-9941-1c93ec895906",
			kind: "custom" as const,
			label: "bad",
			role: "landscape" as const,
			protocol: "srt" as const,
			muxer: "flv" as const,
			filter: null,
			url: "srt://receiver.example:9000?streamid=SECRET",
		};
		try {
			await formatV3DirectDestinations([invalid], async () => ["8.8.8.8"]);
			throw new Error("expected rejection");
		} catch (error) {
			expect(String(error)).toBe("Error: Invalid custom Direct destination");
			expect(String(error)).not.toContain("SECRET");
		}
	});
});
