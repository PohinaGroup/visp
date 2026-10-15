import { beforeEach, describe, expect, test } from "bun:test";

import "../test-env";

process.env.VISP_CHAT_BOT_USER_ID ??= "bot-user";
process.env.TWITCH_CLIENT_ID ??= "twitch-client";
process.env.TWITCH_CLIENT_SECRET ??= "twitch-secret";

const {
	clampTimeout,
	helixCreateClip,
	helixDeleteMessage,
	helixModeratedChannels,
	helixTimeout,
	isMention,
	planActions,
} = await import("./moderator");

type Call = { url: string; method: string; body: unknown };

function helix(
	respond: (call: Call) => Response = () => new Response("{}", { status: 200 }),
) {
	const calls: Call[] = [];
	return {
		calls,
		h: {
			botId: "bot-1",
			token: async () => "bot-token",
			fetch: (async (input, init) => {
				const call = {
					url: String(input),
					method: init?.method ?? "GET",
					body: init?.body ? JSON.parse(String(init.body)) : undefined,
				};
				calls.push(call);
				return respond(call);
			}) as typeof fetch,
		},
	};
}

describe("isMention", () => {
	test("matches the bot as a word, with or without @, any case", () => {
		expect(isMention("@vispstream clip that", "vispstream", "VispStream")).toBe(
			true,
		);
		expect(isMention("hey VISPSTREAM, how long live?", "vispstream")).toBe(
			true,
		);
		expect(isMention("vispstream?", "vispstream")).toBe(true);
	});

	test("ignores the name inside another word and empty names", () => {
		expect(isMention("vispstreamer is here", "vispstream")).toBe(false);
		expect(isMention("myvispstream", "vispstream")).toBe(false);
		expect(isMention("anything", "")).toBe(false);
	});
});

describe("clampTimeout", () => {
	test("defaults to a minute and stays inside 1..max", () => {
		expect(clampTimeout(undefined, 600)).toBe(60);
		expect(clampTimeout(0, 600)).toBe(1);
		expect(clampTimeout(9_999, 600)).toBe(600);
		expect(clampTimeout(9_999_999, 9_999_999)).toBe(1_209_600);
	});
});

describe("planActions", () => {
	const lines = [
		{ id: "m0", userId: "u0", name: "a", privileged: false, text: "spam" },
		{ id: "m1", userId: "u1", name: "mod", privileged: true, text: "x" },
		{ id: "m2", userId: "u2", name: "c", privileged: false, text: "slur" },
	];

	test("drops staff and made-up indexes, clamps seconds, dedupes", () => {
		const timedOut = new Map<string, number>();
		const planned = planActions(
			{
				actions: [
					{ i: 1, action: "timeout", seconds: 60, reason: "no" },
					{ i: 7, action: "delete", reason: "no" },
					{ i: 2, action: "timeout", seconds: 99_999, reason: "slur" },
					{ i: 2, action: "timeout", seconds: 5, reason: "again" },
					{ i: 0, action: "delete", reason: "spam" },
				],
				questions: [],
			},
			lines,
			{ maxTimeoutSeconds: 600, timedOut, budget: () => true, now: 1_000 },
		);
		expect(planned).toEqual([
			{ kind: "timeout", userId: "u2", seconds: 600, reason: "slur" },
			{ kind: "delete", messageId: "m0", userId: "u0", reason: "spam" },
		]);
		expect(timedOut.get("u2")).toBe(1_000);
	});

	test("skips a viewer timed out in the last five minutes", () => {
		const timedOut = new Map([["u2", 1_000]]);
		const output = {
			actions: [{ i: 2, action: "timeout" as const, reason: "r" }],
			questions: [],
		};
		expect(
			planActions(output, lines, {
				maxTimeoutSeconds: 600,
				timedOut,
				budget: () => true,
				now: 1_000 + 60_000,
			}),
		).toEqual([]);
		expect(
			planActions(output, lines, {
				maxTimeoutSeconds: 600,
				timedOut,
				budget: () => true,
				now: 1_000 + 6 * 60_000,
			}),
		).toHaveLength(1);
	});

	test("stops at the per-channel budget", () => {
		let budget = 1;
		const planned = planActions(
			{
				actions: [
					{ i: 0, action: "delete", reason: "a" },
					{ i: 2, action: "delete", reason: "b" },
				],
				questions: [],
			},
			lines,
			{
				maxTimeoutSeconds: 600,
				timedOut: new Map(),
				budget: () => budget-- > 0,
			},
		);
		expect(planned).toHaveLength(1);
	});
});

describe("helix as the bot", () => {
	let fixture: ReturnType<typeof helix>;
	beforeEach(() => {
		fixture = helix();
	});

	test("deletes with the bot as moderator", async () => {
		expect(await helixDeleteMessage(fixture.h, "bc-1", "msg-9")).toBe("ok");
		const call = fixture.calls[0];
		expect(call?.method).toBe("DELETE");
		expect(call?.url).toBe(
			"https://api.twitch.tv/helix/moderation/chat?broadcaster_id=bc-1&moderator_id=bot-1&message_id=msg-9",
		);
	});

	test("a timeout always carries a bounded duration", async () => {
		await helixTimeout(fixture.h, "bc-1", "viewer", 5_000_000, "why");
		const call = fixture.calls[0];
		expect(call?.url).toBe(
			"https://api.twitch.tv/helix/moderation/bans?broadcaster_id=bc-1&moderator_id=bot-1",
		);
		expect(call?.body).toEqual({
			data: { user_id: "viewer", duration: 1_209_600, reason: "why" },
		});
	});

	test("403 is unauthorized, never a throw", async () => {
		const denied = helix(() => new Response(null, { status: 403 }));
		expect(await helixDeleteMessage(denied.h, "bc", "m")).toBe("unauthorized");
		expect(await helixTimeout(denied.h, "bc", "u", 10, "r")).toBe(
			"unauthorized",
		);
		expect(await helixCreateClip(denied.h, "bc")).toEqual({
			error: "unauthorized",
		});
	});

	test("a clip becomes its public URL", async () => {
		const clips = helix(
			() =>
				new Response(JSON.stringify({ data: [{ id: "Clip123" }] }), {
					status: 202,
				}),
		);
		expect(await helixCreateClip(clips.h, "bc-1")).toEqual({
			url: "https://clips.twitch.tv/Clip123",
		});
		expect(clips.calls[0]?.url).toBe(
			"https://api.twitch.tv/helix/clips?broadcaster_id=bc-1",
		);
	});

	test("moderated channels follow pagination", async () => {
		const pages = helix((call) =>
			call.url.includes("after=next")
				? new Response(JSON.stringify({ data: [{ broadcaster_id: "b2" }] }))
				: new Response(
						JSON.stringify({
							data: [{ broadcaster_id: "b1" }],
							pagination: { cursor: "next" },
						}),
					),
		);
		expect(await helixModeratedChannels(pages.h)).toEqual(
			new Set(["b1", "b2"]),
		);
		expect(pages.calls).toHaveLength(2);
	});
});
