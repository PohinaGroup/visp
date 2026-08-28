import "./test-env";

import { describe, expect, test } from "bun:test";

const {
	buildMaskedPathUrls,
	buildSceneCollection,
	buildStudioPreviewUrls,
	decryptPublishSecret,
	encryptPublishSecret,
	recommendLatency,
	selectStudioPreviewPath,
} = await import("./relay");

describe("relay guidance", () => {
	test("builds authenticated camera and program WHEP previews", () => {
		expect(
			buildStudioPreviewUrls("relay.test", "path-1", "creator", "secret pass"),
		).toEqual({
			camera: "https://relay.test/path-1/whep?user=creator&pass=secret+pass",
			program:
				"https://relay.test/studio/path-1/whep?user=creator&pass=secret+pass",
		});
	});
	test("previews the publishing device, then falls back deterministically", () => {
		const paths = [
			{ id: 7, publishing: false },
			{ id: 3, publishing: true },
			{ id: 1, publishing: true },
		];
		expect(selectStudioPreviewPath(paths)?.id).toBe(1);
		expect(
			selectStudioPreviewPath(
				paths.map((path) => ({ ...path, publishing: false })),
			)?.id,
		).toBe(1);
	});
	test("builds display-safe path URLs without exposing credentials", () => {
		const urls = buildMaskedPathUrls(
			{
				relayHost: "eu-relay.test",
				slug: "streamer-1",
				publishRevealable: true,
			},
			"streamer",
			true,
		);

		expect(urls.publish?.srt).toContain(
			"streamid=publish:streamer-1:streamer:*****",
		);
		expect(urls.publish?.srtBonded).toContain("relay.test:8891");
		expect(urls.publish?.srtla).toStartWith("srtla://eu-relay.test:5000");
		expect(urls.publish?.srtla).toContain(
			"streamid=publish:streamer-1:streamer:*****",
		);
		expect(urls.read?.srt).toContain("streamid=read:streamer-1:streamer:*****");
		expect(urls.publish?.rtmp).toContain("pass=*****");
		expect(urls.read?.rtmp).toContain("pass=*****");
		expect(urls.publish?.srt).toStartWith("srt://eu-relay.test:8890");
		expect(
			buildMaskedPathUrls(
				{
					relayHost: "us-relay.test",
					slug: "legacy-1",
					publishRevealable: false,
				},
				"legacy",
				false,
			),
		).toEqual({ publish: null, read: null });
	});

	test("encrypts publish secrets with user and path binding", () => {
		const encrypted = encryptPublishSecret("publish-secret", "user-a", 1);
		expect(encrypted).not.toContain("publish-secret");
		expect(decryptPublishSecret(encrypted, "user-a", 1)).toBe("publish-secret");
		expect(() => decryptPublishSecret(encrypted, "user-a", 2)).toThrow(
			"cannot be revealed",
		);
		const ciphertextStart = encrypted.lastIndexOf(".") + 1;
		expect(() =>
			decryptPublishSecret(
				`${encrypted.slice(0, ciphertextStart)}${encrypted[ciphertextStart] === "x" ? "y" : "x"}${encrypted.slice(ciphertextStart + 1)}`,
				"user-a",
				1,
			),
		).toThrow("cannot be revealed");
	});

	test("applies profile multipliers, floors, and 50 ms rounding", () => {
		expect(recommendLatency(1, "wired").ms).toBe(120);
		expect(recommendLatency(81, "wired").ms).toBe(250);
		expect(recommendLatency(1, "wifi").ms).toBe(300);
		expect(recommendLatency(101, "wifi").ms).toBe(450);
		expect(recommendLatency(1, "cellular").ms).toBe(600);
		expect(recommendLatency(109, "cellular").ms).toBe(700);
	});

	test("generates OBS ffmpeg media sources with the required settings", () => {
		const collection = buildSceneCollection({
			handle: "streamer",
			latencyMicros: 300_000,
			paths: [
				{
					id: 1,
					label: "main",
					relayHost: "eu-relay.test",
					slug: "streamer-1",
				},
			],
			readSecret: "read-secret",
		});
		const source = collection.sources.find(
			(item) => item.id === "ffmpeg_source",
		);
		if (!source || !("input" in source.settings)) {
			throw new Error("OBS media source was not generated");
		}

		expect(source.settings).toMatchObject({
			input_format: "mpegts",
			buffering_mb: 1,
			clear_on_media_end: true,
			reconnect_delay_sec: 1,
		});
		expect(source.settings.input).toContain("streamid=read:streamer-1");
		expect(source.settings.input).toStartWith("srt://eu-relay.test:8890");
		expect(source.settings.input).toContain("latency=300000");
		expect(source.settings.visp_path_id).toBe("1");
	});
});
