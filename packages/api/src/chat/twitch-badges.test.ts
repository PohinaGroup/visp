import { describe, expect, test } from "bun:test";

import "../test-env";

const { loadTwitchBadges } = await import("./twitch-badges");

describe("Twitch chat badges", () => {
	test("flattens global and channel badges and caches per broadcaster", async () => {
		const requests: string[] = [];
		const dependencies = {
			fetch: (async (input, init) => {
				requests.push(String(input));
				const headers = new Headers(init?.headers);
				expect(headers.get("Authorization")).toBe("Bearer token");
				expect(headers.get("Client-Id")).toBeTruthy();
				const channel = String(input).includes("broadcaster_id");
				return Response.json({
					data: [
						{
							set_id: channel ? "subscriber" : "moderator",
							versions: [
								{
									id: channel ? "12" : "1",
									image_url_2x: `https://static-cdn.jtvnw.net/${channel ? "sub" : "mod"}.png`,
								},
							],
						},
					],
				});
			}) as typeof fetch,
			getAccessToken: async () => ({ accessToken: "token" }),
			now: () => 100,
		};

		const badges = await loadTwitchBadges(
			"user",
			"badge-test-broadcaster",
			dependencies,
		);
		const cached = await loadTwitchBadges(
			"user",
			"badge-test-broadcaster",
			dependencies,
		);

		expect(Object.fromEntries(badges)).toEqual({
			"moderator/1": "https://static-cdn.jtvnw.net/mod.png",
			"subscriber/12": "https://static-cdn.jtvnw.net/sub.png",
		});
		expect(cached).toBe(badges);
		expect(requests).toHaveLength(2);
	});

	test("returns an empty map when Twitch fails", async () => {
		const badges = await loadTwitchBadges("user", "failed-broadcaster", {
			fetch: (async () =>
				new Response(null, { status: 503 })) as unknown as typeof fetch,
			getAccessToken: async () => ({ accessToken: "token" }),
		});

		expect(badges.size).toBe(0);
	});

	test("expires old entries and bounds the broadcaster cache", async () => {
		let requests = 0;
		let now = 0;
		const dependencies = {
			fetch: (async () => {
				requests += 1;
				return Response.json({ data: [] });
			}) as unknown as typeof fetch,
			getAccessToken: async () => ({ accessToken: "token" }),
			now: () => now,
		};

		await loadTwitchBadges("user", "expiring", dependencies);
		now = 60 * 60_000 + 1;
		await loadTwitchBadges("user", "expiring", dependencies);
		expect(requests).toBe(4);

		for (let index = 0; index < 257; index += 1) {
			await loadTwitchBadges("user", `bounded-${index}`, dependencies);
		}
		await loadTwitchBadges("user", "bounded-0", dependencies);
		expect(requests).toBe(520);
	});
});
