import { describe, expect, test } from "bun:test";

import "../test-env";

const { createTwitchChatSubscription } = await import("./twitch");

describe("Twitch chat subscription", () => {
	test("gets a fresh Better Auth token and creates the expected EventSub condition", async () => {
		const authorizations: string[] = [];
		const bodies: unknown[] = [];
		let token = 0;
		const dependencies = {
			getAccessToken: async (userId: string) => {
				expect(userId).toBe("visp-user");
				token += 1;
				return { accessToken: `token-${token}` };
			},
			fetch: (async (_input, init) => {
				const headers = new Headers(init?.headers);
				authorizations.push(headers.get("Authorization") ?? "");
				bodies.push(JSON.parse(String(init?.body)));
				return new Response(null, { status: 204 });
			}) as typeof fetch,
		};

		await createTwitchChatSubscription(
			{
				broadcasterId: "broadcaster",
				sessionId: "session-1",
				userId: "visp-user",
			},
			dependencies,
		);
		await createTwitchChatSubscription(
			{
				broadcasterId: "broadcaster",
				sessionId: "session-2",
				userId: "visp-user",
			},
			dependencies,
		);

		expect(authorizations).toEqual([
			...Array(7).fill("Bearer token-1"),
			...Array(7).fill("Bearer token-2"),
		]);
		expect(bodies.map((body) => (body as { type: string }).type)).toEqual(
			Array(2)
				.fill([
					"channel.chat.message",
					"channel.raid",
					"channel.follow",
					"channel.subscribe",
					"channel.subscription.message",
					"channel.subscription.gift",
					"channel.cheer",
				])
				.flat(),
		);
		expect(bodies[1]).toMatchObject({
			condition: { to_broadcaster_user_id: "broadcaster" },
			transport: { method: "websocket", session_id: "session-1" },
		});
	});

	test("surfaces Twitch API failures to the connector", async () => {
		await expect(
			createTwitchChatSubscription(
				{
					broadcasterId: "broadcaster",
					sessionId: "session",
					userId: "visp-user",
				},
				{
					getAccessToken: async () => ({ accessToken: "token" }),
					fetch: (async () =>
						Response.json(
							{ message: "Missing scope: user:read:chat" },
							{ status: 403 },
						)) as unknown as typeof fetch,
				},
			),
		).rejects.toThrow("Missing scope: user:read:chat");
	});

	test("keeps chat connected when an optional alert subscription fails", async () => {
		const original = console.error;
		console.error = () => undefined;
		try {
			let request = 0;
			await expect(
				createTwitchChatSubscription(
					{
						broadcasterId: "broadcaster",
						sessionId: "session",
						userId: "visp-user",
					},
					{
						getAccessToken: async () => ({ accessToken: "token" }),
						fetch: (async () => {
							request += 1;
							return request === 2
								? Response.json({ message: "Unavailable" }, { status: 403 })
								: new Response(null, { status: 204 });
						}) as unknown as typeof fetch,
					},
				),
			).resolves.toBeUndefined();
		} finally {
			console.error = original;
		}
	});
});
