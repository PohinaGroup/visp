import { describe, expect, test } from "bun:test";

import "./test-env";

const {
	DirectError,
	createYoutubeDestination,
	portraitFilter,
	validateDirectCrop,
	kickIngestDestination,
	sanitizeDirectError,
	setDirectOutputs,
	streamKeyDestination,
} = await import("./direct");

describe("portrait framing", () => {
	test("validates normalized 9:16 framing for a 16:9 contribution", () => {
		const crop = { x: 0.3418, y: 0, w: 0.3164, h: 1, aspect: "9:16" };
		expect(validateDirectCrop(crop)).toEqual(crop);
		expect(portraitFilter(crop)).toBe(
			"crop=iw*0.3164:ih*1:iw*0.3418:ih*0,scale=1080:1920",
		);
	});

	test("rejects out-of-bounds and wrong-aspect crops", () => {
		for (const crop of [
			{ x: 0.8, y: 0, w: 0.3, h: 1, aspect: "9:16" },
			{ x: 0, y: 0, w: 0.5, h: 1, aspect: "9:16" },
			{ x: 0, y: 0, w: 0, h: 1, aspect: "9:16" },
		]) {
			expect(() => validateDirectCrop(crop)).toThrow(DirectError);
		}
	});
});

const dependencies = (
	respond: (url: string, init?: RequestInit) => Response,
) => ({
	fetch: (async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
		respond(String(input), init)) as typeof fetch,
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

	test("adds :443/app when Kick returns a host-only ingest URL", () => {
		expect(
			kickIngestDestination(
				"rtmps://fa723fc1b171.global-contribute.live-video.net",
				"sk_abc",
			),
		).toBe(
			"rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/sk_abc",
		);
	});

	test("leaves a dashboard-style Kick URL unchanged apart from the key", () => {
		expect(
			kickIngestDestination(
				"rtmps://fa723fc1b171.global-contribute.live-video.net:443/app",
				"sk_abc",
			),
		).toBe(
			"rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/sk_abc",
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

	test("normalizes a host-only Kick ingest URL from the API", async () => {
		const url = await streamKeyDestination(
			"kick",
			"user-a",
			"42",
			dependencies(() =>
				Response.json({
					data: [
						{
							stream: {
								url: "rtmps://fa723fc1b171.global-contribute.live-video.net",
								key: "sk_abc",
							},
						},
					],
				}),
			),
		);
		expect(url).toBe(
			"rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/sk_abc",
		);
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

test("clearing every provider is a Home Studio switch, not a refusal", async () => {
	// The switch itself needs a database, so this covers the narrower thing that
	// regressed a shipped app: the request is no longer refused up front, so a
	// phone with no mode control can still turn Direct output off.
	const failure = await setDirectOutputs("user-a", 1, {
		twitch: false,
		kick: false,
		youtube: false,
	}).then(
		() => undefined,
		(reason: unknown) => reason,
	);
	expect(String(failure)).not.toContain("Choose Route to Home Studio");
});

describe("createYoutubeDestination", () => {
	test("creates and binds a public auto-starting broadcast", async () => {
		const calls: Array<{ body?: unknown; method: string; url: string }> = [];
		const deps = dependencies((url, init) => {
			calls.push({
				body: init?.body ? JSON.parse(String(init.body)) : undefined,
				method: init?.method ?? "GET",
				url,
			});
			if (url.includes("/liveStreams?part=cdn&id=")) {
				return Response.json({ items: [] });
			}
			if (url.includes("/liveStreams?part=snippet")) {
				return Response.json({
					id: "stream-1",
					cdn: {
						ingestionInfo: {
							rtmpsIngestionAddress: "rtmps://youtube.test/live2",
							streamName: "secret-key",
						},
					},
				});
			}
			if (url.includes("/liveBroadcasts?part=")) {
				return Response.json({ id: "broadcast-1" });
			}
			if (url.includes("/liveBroadcasts/bind")) {
				expect(init?.method).toBe("POST");
				return Response.json({ id: "broadcast-1" });
			}
			return new Response(null, { status: 404 });
		});

		const result = await createYoutubeDestination(
			{
				accessToken: "google-token",
				streamId: "deleted-stream",
				title: "My public stream",
			},
			deps,
			() => 1_700_000_000_000,
		);
		expect(result).toEqual({
			broadcastId: "broadcast-1",
			createdBroadcast: true,
			streamId: "stream-1",
			url: "rtmps://youtube.test/live2/secret-key",
		});
		const broadcast = calls.find((call) =>
			call.url.includes("/liveBroadcasts?part="),
		);
		expect(broadcast?.body).toEqual({
			snippet: {
				title: "My public stream",
				scheduledStartTime: "2023-11-14T22:13:30.000Z",
			},
			status: { privacyStatus: "public" },
			contentDetails: {
				enableAutoStart: true,
				enableAutoStop: true,
				monitorStream: { enableMonitorStream: false },
			},
		});
		expect(calls.some((call) => call.url.includes("streamId=stream-1"))).toBe(
			true,
		);
	});

	test("reuses the current broadcast and reusable stream", async () => {
		let posts = 0;
		const deps = dependencies((url) => {
			if (url.includes("/liveStreams?")) {
				return Response.json({
					items: [
						{
							id: "stream-1",
							cdn: {
								ingestionInfo: {
									rtmpsIngestionAddress: "rtmps://youtube.test/live2",
									streamName: "secret-key",
								},
							},
						},
					],
				});
			}
			if (url.includes("/liveBroadcasts?")) {
				return Response.json({
					items: [
						{
							id: "broadcast-1",
							contentDetails: { boundStreamId: "stream-1" },
							status: { lifeCycleStatus: "ready" },
						},
					],
				});
			}
			posts += 1;
			return new Response(null, { status: 500 });
		});
		const result = await createYoutubeDestination(
			{
				accessToken: "google-token",
				broadcastId: "broadcast-1",
				streamId: "stream-1",
				title: "Ignored",
			},
			deps,
		);
		expect(result.broadcastId).toBe("broadcast-1");
		expect(posts).toBe(0);
	});

	test("deletes a newly created broadcast when binding fails", async () => {
		let deleted = false;
		const deps = dependencies((url, init) => {
			if (url.includes("/liveStreams?part=snippet")) {
				return Response.json({
					id: "stream-1",
					cdn: {
						ingestionInfo: {
							rtmpsIngestionAddress: "rtmps://youtube.test/live2",
							streamName: "must-not-leak",
						},
					},
				});
			}
			if (url.includes("/liveBroadcasts?part=")) {
				return Response.json({ id: "broadcast-1" });
			}
			if (url.includes("/liveBroadcasts/bind")) {
				return new Response("must-not-leak", { status: 403 });
			}
			if (url.includes("/liveBroadcasts?id=") && init?.method === "DELETE") {
				deleted = true;
				return new Response(null, { status: 204 });
			}
			return new Response(null, { status: 404 });
		});

		const failure = createYoutubeDestination(
			{ accessToken: "google-token", title: "Safe title" },
			deps,
		);
		await expect(failure).rejects.toThrow("(403)");
		expect(deleted).toBe(true);
		await expect(failure).rejects.not.toThrow("must-not-leak");
	});
});
