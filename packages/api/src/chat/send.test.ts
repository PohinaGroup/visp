import { beforeEach, describe, expect, test } from "bun:test";

import "../test-env";

const { MAX_SEND_LENGTH, prepareMessage, resetSendLimits, sendChatMessage } =
	await import("./send");

type Call = { url: string; body: unknown; authorization: string };

function dependencies(over: { scope?: string; status?: number } = {}) {
	const calls: Call[] = [];
	return {
		calls,
		deps: {
			fetch: (async (input, init) => {
				calls.push({
					url: String(input),
					body: JSON.parse(String(init?.body)),
					authorization: new Headers(init?.headers).get("Authorization") ?? "",
				});
				return new Response(null, { status: over.status ?? 200 });
			}) as typeof fetch,
			getAccessToken: async () => ({ accessToken: "token" }),
			loadAccount: async () => ({
				accountId: "12345",
				scope:
					over.scope ??
					"user:read:chat user:write:chat chat:write https://www.googleapis.com/auth/youtube.force-ssl",
			}),
			liveChatId: async () => "live-chat-1",
		},
	};
}

describe("chat send", () => {
	beforeEach(() => resetSendLimits());

	test("flattens and truncates to one chat-sized line", () => {
		expect(prepareMessage("  two\nlines  ")).toBe("two lines");
		const long = prepareMessage("x".repeat(500));
		expect(long).toHaveLength(MAX_SEND_LENGTH);
		expect(long.endsWith("…")).toBe(true);
	});

	test("posts the shape each provider expects", async () => {
		const twitch = dependencies();
		expect(await sendChatMessage("user", "twitch", "hello", twitch.deps)).toBe(
			"sent",
		);
		expect(twitch.calls[0]?.url).toBe(
			"https://api.twitch.tv/helix/chat/messages",
		);
		expect(twitch.calls[0]?.body).toEqual({
			broadcaster_id: "12345",
			sender_id: "12345",
			message: "hello",
		});
		expect(twitch.calls[0]?.authorization).toBe("Bearer token");

		const kick = dependencies();
		expect(await sendChatMessage("user", "kick", "hello", kick.deps)).toBe(
			"sent",
		);
		expect(kick.calls[0]?.body).toEqual({
			broadcaster_user_id: 12345,
			content: "hello",
			type: "user",
		});

		const youtube = dependencies();
		expect(
			await sendChatMessage("user", "youtube", "hello", youtube.deps),
		).toBe("sent");
		expect(youtube.calls[0]?.body).toEqual({
			snippet: {
				liveChatId: "live-chat-1",
				type: "textMessageEvent",
				textMessageDetails: { messageText: "hello" },
			},
		});
	});

	test("refuses to post without the write scope, and never calls the API", async () => {
		const { calls, deps } = dependencies({ scope: "user:read:chat" });
		expect(await sendChatMessage("user", "twitch", "hello", deps)).toBe(
			"unauthorized",
		);
		expect(calls).toHaveLength(0);
	});

	test("reports a revoked token as unauthorized and a failure as unavailable", async () => {
		expect(
			await sendChatMessage(
				"user",
				"twitch",
				"hello",
				dependencies({ status: 401 }).deps,
			),
		).toBe("unauthorized");
		expect(
			await sendChatMessage(
				"user-2",
				"twitch",
				"hello",
				dependencies({ status: 500 }).deps,
			),
		).toBe("unavailable");
	});

	test("throttles a bot loop instead of burning the account", async () => {
		const { calls, deps } = dependencies();
		let now = 1_000_000;
		expect(await sendChatMessage("user", "twitch", "one", deps, now)).toBe(
			"sent",
		);
		// Same second: the minimum interval holds it back.
		expect(await sendChatMessage("user", "twitch", "two", deps, now)).toBe(
			"throttled",
		);
		now += 2_000;
		expect(await sendChatMessage("user", "twitch", "three", deps, now)).toBe(
			"sent",
		);
		// A different platform has its own budget.
		expect(await sendChatMessage("user", "kick", "four", deps, now)).toBe(
			"sent",
		);
		expect(calls).toHaveLength(3);

		// Twenty a minute is the ceiling, however patiently they arrive.
		resetSendLimits();
		const loop = dependencies();
		let tick = 2_000_000;
		for (let index = 0; index < 25; index += 1) {
			await sendChatMessage(
				"looper",
				"twitch",
				`spam ${index}`,
				loop.deps,
				tick,
			);
			tick += 2_000;
		}
		expect(loop.calls).toHaveLength(20);
	});
});
