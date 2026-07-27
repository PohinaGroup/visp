import { describe, expect, test } from "bun:test";

import "./test-env";

const { DirectError, sanitizeDirectError, streamKeyDestination } = await import(
	"./direct"
);

const dependencies = (respond: (url: string) => Response) => ({
	fetch: (async (input: Parameters<typeof fetch>[0]) =>
		respond(String(input))) as typeof fetch,
	getAccessToken: async () => ({ accessToken: "provider-token" }),
	maxForwarders: 4,
});

describe("sanitizeDirectError", () => {
	test("drops anything that could carry a destination URL or a key", () => {
		expect(
			sanitizeDirectError(
				"rtmps://ingest.global-contribute.live-video.net/app/live_123_secret: 403",
			),
		).toBe("[url] 403");
		expect(sanitizeDirectError("Connection refused")).toBe(
			"Connection refused",
		);
		expect(sanitizeDirectError(null)).toBeNull();
	});

	test("bounds the stored length", () => {
		expect(sanitizeDirectError("x".repeat(500))?.length).toBe(200);
	});
});

describe("streamKeyDestination", () => {
	test("builds the Twitch ingest URL from the key, in memory", async () => {
		const url = await streamKeyDestination(
			"twitch",
			"user-a",
			"tw-1",
			dependencies(() =>
				Response.json({ data: [{ stream_key: "live_1_secret" }] }),
			),
		);
		expect(url).toBe(
			"rtmps://ingest.global-contribute.live-video.net/app/live_1_secret",
		);
	});

	test("joins Kick's stream url and key", async () => {
		const url = await streamKeyDestination(
			"kick",
			"user-a",
			"42",
			dependencies(() =>
				Response.json({
					data: [
						{ stream: { url: "rtmps://stream.kick.com/1234", key: "sk_abc" } },
					],
				}),
			),
		);
		expect(url).toBe("rtmps://stream.kick.com/1234/sk_abc");
	});

	// The capability check stays at API-call time, not at account.scope: a user
	// can revoke at the provider's end and leave the stored scope stale.
	test("a refused provider call becomes consent-required, not a token leak", async () => {
		for (const provider of ["twitch", "kick"] as const) {
			const failure = streamKeyDestination(
				provider,
				"user-a",
				"id",
				dependencies(() => new Response("token expired", { status: 401 })),
			);
			await expect(failure).rejects.toThrow(/permission is required/);
			await expect(failure).rejects.toBeInstanceOf(DirectError);
		}
	});

	test("treats a missing key as consent-required rather than a valid URL", async () => {
		await expect(
			streamKeyDestination(
				"twitch",
				"user-a",
				"tw-1",
				dependencies(() => Response.json({ data: [] })),
			),
		).rejects.toThrow("Twitch did not return a stream key");
	});
});
