import { describe, expect, test } from "bun:test";
import { createSign, generateKeyPairSync } from "node:crypto";
import type { KickWebhookHeaders } from "./kick";

import "../test-env";

const { createKickSubscription, verifyKickWebhook } = await import("./kick");

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
});

function signedHeaders(rawBody: string, timestamp: string): KickWebhookHeaders {
	const messageId = "event-1";
	const signer = createSign("RSA-SHA256");
	signer.update(`${messageId}.${timestamp}.${rawBody}`);
	signer.end();
	return {
		messageId,
		signature: signer.sign(privateKey, "base64"),
		timestamp,
		type: "chat.message.sent",
		version: "1",
	};
}

describe("Kick webhook verification", () => {
	test("accepts a valid signature once and rejects its replay", () => {
		const now = Date.parse("2026-07-17T10:00:00.000Z");
		const rawBody = '{"message_id":"message-1"}';
		const headers = signedHeaders(rawBody, new Date(now).toISOString());
		const replays = new Map<string, number>();

		expect(
			verifyKickWebhook(rawBody, headers, now, publicKey, replays),
		).toEqual({ ok: true });
		expect(
			verifyKickWebhook(rawBody, headers, now, publicKey, replays),
		).toEqual({
			ok: false,
			reason: "replay",
		});
	});

	test("rejects stale timestamps and body tampering", () => {
		const now = Date.parse("2026-07-17T10:00:00.000Z");
		const rawBody = '{"message_id":"message-1"}';
		const stale = signedHeaders(
			rawBody,
			new Date(now - 5 * 60_000 - 1).toISOString(),
		);
		expect(
			verifyKickWebhook(rawBody, stale, now, publicKey, new Map()),
		).toEqual({
			ok: false,
			reason: "timestamp",
		});

		const current = signedHeaders(rawBody, new Date(now).toISOString());
		expect(
			verifyKickWebhook(`${rawBody} `, current, now, publicKey, new Map()),
		).toEqual({
			ok: false,
			reason: "signature",
		});
	});
});

describe("Kick subscriptions", () => {
	test("creates chat and all viewer alert subscriptions in one request", async () => {
		const original = globalThis.fetch;
		let body: { events: Array<{ name: string; version: number }> } | undefined;
		globalThis.fetch = (async (
			input: Parameters<typeof fetch>[0],
			init?: Parameters<typeof fetch>[1],
		) => {
			if (String(input) === "https://id.kick.com/oauth/token") {
				return Response.json({ access_token: "app-token", expires_in: 3600 });
			}
			body = JSON.parse(String(init?.body));
			return Response.json({
				data: body?.events.map(({ name }, index) => ({
					name,
					subscription_id: `subscription-${index}`,
				})),
			});
		}) as unknown as typeof fetch;
		try {
			const subscriptions = await createKickSubscription("123");
			expect(body?.events).toEqual([
				{ name: "chat.message.sent", version: 1 },
				{ name: "channel.followed", version: 1 },
				{ name: "channel.subscription.new", version: 1 },
				{ name: "channel.subscription.renewal", version: 1 },
				{ name: "channel.subscription.gifts", version: 1 },
			]);
			expect(subscriptions.get("chat.message.sent")).toBe("subscription-0");
			expect(subscriptions.size).toBe(5);
		} finally {
			globalThis.fetch = original;
		}
	});
});
