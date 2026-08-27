import { describe, expect, test } from "bun:test";
import { validateDirectDestination } from "./direct-destination";
import { DirectError } from "./direct-model";

describe("validateDirectDestination", () => {
	test("accepts the production Twitch, Kick, and YouTube RTMPS hosts", () => {
		for (const [provider, destination] of [
			[
				"twitch",
				"rtmps://ingest.global-contribute.live-video.net/app/live_secret",
			],
			["kick", "rtmps://stream.kick.com/1234/sk_secret"],
			[
				"kick",
				"rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/sk_secret",
			],
			["youtube", "rtmps://a.rtmp.youtube.com/live2/secret-key"],
		] as const) {
			expect(validateDirectDestination(provider, destination)).toBe(
				destination,
			);
		}
	});

	test("rejects non-RTMPS schemes, credentials, and unexpected hosts", () => {
		for (const destination of [
			"rtmp://ingest.global-contribute.live-video.net/app/live_secret",
			"rtmps://user:password@ingest.global-contribute.live-video.net/app/live_secret",
			"rtmps://attacker.example/app/live_secret",
		]) {
			expect(() => validateDirectDestination("twitch", destination)).toThrow(
				DirectError,
			);
		}
	});

	test("rejects whitespace and control-character record injection without echoing the secret", () => {
		for (const destination of [
			"rtmps://ingest.global-contribute.live-video.net/app/live secret",
			"rtmps://ingest.global-contribute.live-video.net/app/live_secret\nother rtmps://attacker.example/key",
			"rtmps://ingest.global-contribute.live-video.net/app/live_secret\u0000",
			"rtmps://ingest.global-contribute.live-video.net/app/live_secret%0Ainjected",
		]) {
			try {
				validateDirectDestination("twitch", destination);
				expect.unreachable();
			} catch (error) {
				expect(error).toBeInstanceOf(DirectError);
				expect(String(error)).not.toContain("live_secret");
			}
		}
	});
});
