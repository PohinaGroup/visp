import { describe, expect, test } from "bun:test";

import "../test-env";

const { listLinkedAccounts } = await import("./linked-accounts");

const linkedAt = new Date("2026-01-02T03:04:05.000Z");

const accounts = async () => [
	{
		provider: "twitch",
		accountId: "tw-1",
		scope: "user:read:chat channel:manage:broadcast",
		createdAt: linkedAt,
	},
	{
		provider: "google",
		accountId: "google-1",
		scope: "https://www.googleapis.com/auth/youtube.readonly",
		createdAt: linkedAt,
	},
];

const tokens = async () => ({ accessToken: "token" });

describe("listLinkedAccounts", () => {
	test("reports identity, permissions and link time per provider", async () => {
		const result = await listLinkedAccounts("user", {
			fetch: (async (input) =>
				String(input).includes("twitch.tv")
					? Response.json({
							data: [{ display_name: "Streamer", email: "tw@example.com" }],
						})
					: Response.json({
							name: "Google Person",
							email: "g@example.com",
						})) as typeof fetch,
			getAccessToken: tokens,
			loadAccounts: accounts,
		});

		expect(result.find((entry) => entry.provider === "twitch")).toEqual({
			provider: "twitch",
			linked: true,
			linkedAt: linkedAt.toISOString(),
			accountId: "tw-1",
			name: "Streamer",
			email: "tw@example.com",
			canChat: true,
			canManageChannel: true,
			canReadStreamKey: false,
			status: "linked",
		});
		expect(result.find((entry) => entry.provider === "youtube")).toMatchObject({
			linked: true,
			name: "Google Person",
			email: "g@example.com",
			canChat: true,
			canReadStreamKey: false,
		});
		expect(result.find((entry) => entry.provider === "kick")).toEqual({
			provider: "kick",
			linked: false,
			canChat: false,
			canManageChannel: false,
			canReadStreamKey: false,
			status: "not-linked",
		});
	});

	test("flags a rejected token as needing re-authorization", async () => {
		const result = await listLinkedAccounts("user", {
			fetch: (async (_input: unknown) =>
				new Response(null, { status: 401 })) as unknown as typeof fetch,
			getAccessToken: tokens,
			loadAccounts: accounts,
		});

		expect(result.find((entry) => entry.provider === "twitch")).toMatchObject({
			linked: true,
			accountId: "tw-1",
			status: "reauthorize",
		});
	});

	test("keeps the link when the provider is merely unreachable", async () => {
		const result = await listLinkedAccounts("user", {
			fetch: (async (_input: unknown) =>
				new Response(null, { status: 503 })) as unknown as typeof fetch,
			getAccessToken: tokens,
			loadAccounts: accounts,
		});

		expect(result.find((entry) => entry.provider === "twitch")).toMatchObject({
			linked: true,
			status: "unreachable",
		});
	});
});
