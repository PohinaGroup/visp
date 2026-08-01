import { describe, expect, test } from "bun:test";

import "../test-env";

const {
	getViewerCounts,
	hasChannelWriteScope,
	searchStreamCategories,
	updateStreamInfo,
} = await import("./stream-info");
const { channelRouter } = await import("../routers/channel");

type Call = { url: string; method?: string; headers: Headers; body?: unknown };

function recordingFetch(
	calls: Call[],
	respond: (url: string) => Response = () =>
		new Response(null, { status: 204 }),
) {
	return (async (input, init) => {
		const url = String(input);
		calls.push({
			url,
			method: init?.method,
			headers: new Headers(init?.headers),
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		});
		return respond(url);
	}) as typeof fetch;
}

const bothLinked = async () => [
	{
		provider: "twitch",
		accountId: "tw-1",
		scope: "user:read:chat channel:manage:broadcast",
	},
	{ provider: "kick", accountId: "42", scope: "user:read,channel:write" },
];

const tokens = async (provider: "twitch" | "kick") => ({
	accessToken: `${provider}-token`,
});

describe("getViewerCounts", () => {
	test("returns separate live Twitch and Kick counts", async () => {
		const calls: Call[] = [];
		const counts = await getViewerCounts("user", ["twitch", "kick"], {
			fetch: recordingFetch(calls, (url) =>
				url.includes("twitch.tv")
					? Response.json({ data: [{ viewer_count: 12 }] })
					: Response.json({
							data: [{ stream: { is_live: true, viewer_count: 7 } }],
						}),
			),
			getAccessToken: tokens,
			loadAccounts: bothLinked,
		});

		expect(counts).toEqual({ twitch: 12, kick: 7 });
		expect(calls).toHaveLength(2);
		const twitch = calls.find((call) => call.url.includes("twitch.tv"));
		expect(twitch?.url).toBe(
			"https://api.twitch.tv/helix/streams?user_id=tw-1",
		);
		expect(twitch?.headers.get("Authorization")).toBe("Bearer twitch-token");
		expect(twitch?.headers.get("Client-Id")).toBe("test-twitch-client");
	});

	test("returns zero for offline channels", async () => {
		const counts = await getViewerCounts("user", ["twitch", "kick"], {
			fetch: recordingFetch([], (url) =>
				url.includes("twitch.tv")
					? Response.json({ data: [] })
					: Response.json({ data: [{ stream: { is_live: false } }] }),
			),
			getAccessToken: tokens,
			loadAccounts: bothLinked,
		});

		expect(counts).toEqual({ twitch: 0, kick: 0 });
	});

	test("isolates failures and malformed counts", async () => {
		const failed = await getViewerCounts("user", ["twitch", "kick"], {
			fetch: recordingFetch([], (url) =>
				url.includes("twitch.tv")
					? new Response(null, { status: 503 })
					: Response.json({
							data: [{ stream: { is_live: true, viewer_count: 4 } }],
						}),
			),
			getAccessToken: tokens,
			loadAccounts: bothLinked,
		});
		expect(failed).toEqual({ twitch: null, kick: 4 });

		const malformed = await getViewerCounts("user", ["twitch"], {
			fetch: recordingFetch([], () =>
				Response.json({ data: [{ viewer_count: -1 }] }),
			),
			getAccessToken: tokens,
			loadAccounts: bothLinked,
		});
		expect(malformed).toEqual({ twitch: null, kick: null });
	});

	test("requests only the selected provider", async () => {
		const calls: Call[] = [];
		const counts = await getViewerCounts("user", ["kick", "kick"], {
			fetch: recordingFetch(calls, () =>
				Response.json({
					data: [{ stream: { is_live: true, viewer_count: 3 } }],
				}),
			),
			getAccessToken: tokens,
			loadAccounts: bothLinked,
		});

		expect(counts).toEqual({ twitch: null, kick: 3 });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("https://api.kick.com/public/v1/channels");
	});
});

test("viewer counts require an authenticated session", async () => {
	const caller = channelRouter.createCaller({
		auth: null,
		headers: new Headers(),
		session: null,
	});
	await expect(
		caller.viewerCounts({ providers: ["twitch"] }),
	).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

describe("hasChannelWriteScope", () => {
	test("parses space and comma separated scope strings", () => {
		expect(hasChannelWriteScope("twitch", "a channel:manage:broadcast b")).toBe(
			true,
		);
		expect(hasChannelWriteScope("kick", "user:read,channel:write")).toBe(true);
		expect(hasChannelWriteScope("twitch", "user:read:chat")).toBe(false);
		expect(hasChannelWriteScope("kick", null)).toBe(false);
	});
});

describe("updateStreamInfo", () => {
	test("patches both platforms with the right shapes when both are linked", async () => {
		const calls: Call[] = [];
		const results = await updateStreamInfo(
			"user",
			{ title: "Hello", twitchCategoryId: "509658", kickCategoryId: 7 },
			{
				fetch: recordingFetch(calls),
				getAccessToken: tokens,
				loadAccounts: bothLinked,
			},
		);
		expect(results).toEqual([
			{ provider: "twitch", ok: true },
			{ provider: "kick", ok: true },
		]);
		const twitch = calls.find((call) => call.url.includes("twitch.tv"));
		expect(twitch?.url).toBe(
			"https://api.twitch.tv/helix/channels?broadcaster_id=tw-1",
		);
		expect(twitch?.method).toBe("PATCH");
		expect(twitch?.headers.get("Authorization")).toBe("Bearer twitch-token");
		expect(twitch?.headers.get("Client-Id")).toBe("test-twitch-client");
		expect(twitch?.body).toEqual({ title: "Hello", game_id: "509658" });
		const kick = calls.find((call) => call.url.includes("kick.com"));
		expect(kick?.url).toBe("https://api.kick.com/public/v1/channels");
		expect(kick?.method).toBe("PATCH");
		expect(kick?.headers.get("Authorization")).toBe("Bearer kick-token");
		expect(kick?.body).toEqual({ stream_title: "Hello", category_id: 7 });
	});

	test("updates only the linked platform", async () => {
		const calls: Call[] = [];
		const results = await updateStreamInfo(
			"user",
			{ title: "Solo" },
			{
				fetch: recordingFetch(calls),
				getAccessToken: tokens,
				loadAccounts: async () => [
					{ provider: "kick", accountId: "42", scope: "channel:write" },
				],
			},
		);
		expect(results).toEqual([{ provider: "kick", ok: true }]);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toContain("kick.com");
	});

	test("reports per-platform failure without failing the other", async () => {
		const results = await updateStreamInfo(
			"user",
			{ title: "Mixed" },
			{
				fetch: recordingFetch([], (url) =>
					url.includes("twitch.tv")
						? new Response(null, { status: 500 })
						: new Response(null, { status: 204 }),
				),
				getAccessToken: tokens,
				loadAccounts: bothLinked,
			},
		);
		expect(results).toEqual([
			{ provider: "twitch", ok: false, error: "Twitch update failed (500)" },
			{ provider: "kick", ok: true },
		]);
	});

	test("returns consent-required without calling the platform", async () => {
		const calls: Call[] = [];
		const results = await updateStreamInfo(
			"user",
			{ title: "Nope" },
			{
				fetch: recordingFetch(calls),
				getAccessToken: tokens,
				loadAccounts: async () => [
					{ provider: "twitch", accountId: "tw-1", scope: "user:read:chat" },
				],
			},
		);
		expect(results).toEqual([
			{ provider: "twitch", ok: false, error: "consent-required" },
		]);
		expect(calls).toHaveLength(0);
	});

	test("skips a platform when the input has nothing applicable to it", async () => {
		const calls: Call[] = [];
		const results = await updateStreamInfo(
			"user",
			{ kickCategoryId: 7 },
			{
				fetch: recordingFetch(calls),
				getAccessToken: tokens,
				loadAccounts: bothLinked,
			},
		);
		expect(results).toEqual([{ provider: "kick", ok: true }]);
		expect(calls).toHaveLength(1);
	});
});

describe("searchStreamCategories", () => {
	test("returns null for unlinked providers and results for linked ones", async () => {
		const results = await searchStreamCategories("user", "fortnite", {
			fetch: (async () =>
				Response.json({
					data: [{ id: "33214", name: "Fortnite" }],
				})) as unknown as typeof fetch,
			getAccessToken: tokens,
			loadAccounts: async () => [
				{ provider: "twitch", accountId: "tw-1", scope: null },
			],
		});
		expect(results).toEqual({
			twitch: [{ id: "33214", name: "Fortnite" }],
			kick: null,
		});
	});

	test("a failing platform yields [] while the other still returns", async () => {
		const results = await searchStreamCategories("user", "chess", {
			fetch: (async (input) =>
				String(input).includes("twitch.tv")
					? Promise.reject(new Error("boom"))
					: Response.json({
							data: [{ id: 5, name: "Chess" }],
						})) as typeof fetch,
			getAccessToken: tokens,
			loadAccounts: bothLinked,
		});
		expect(results).toEqual({ twitch: [], kick: [{ id: 5, name: "Chess" }] });
	});
});
