import { db } from "@VISP/db";
import { account, chatConnection } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { createVerify, type KeyLike } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { tryAdvisoryLock } from "../advisory-lock";
import { chatHub } from "./hub";
import { normalizeKickMessage } from "./normalize";

const KICK_API = "https://api.kick.com/public/v1";
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const KICK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;

type KickToken = { accessToken: string; expiresAt: number };
type KickSubscription = {
	broadcaster_user_id?: number;
	event?: string;
	id: string;
};

let appToken: KickToken | undefined;
const replayIds = new Map<string, number>();

async function getAppToken() {
	if (appToken && appToken.expiresAt > Date.now() + 60_000)
		return appToken.accessToken;
	const body = new URLSearchParams({
		client_id: env.KICK_CLIENT_ID,
		client_secret: env.KICK_CLIENT_SECRET,
		grant_type: "client_credentials",
	});
	const response = await fetch("https://id.kick.com/oauth/token", {
		method: "POST",
		body,
	});
	if (!response.ok)
		throw new Error(`Kick app token failed (${response.status})`);
	const payload = (await response.json()) as {
		access_token?: string;
		expires_in?: number;
	};
	if (!payload.access_token)
		throw new Error("Kick app token response was invalid");
	appToken = {
		accessToken: payload.access_token,
		expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000,
	};
	return appToken.accessToken;
}

async function kickRequest(path: string, init?: RequestInit) {
	const token = await getAppToken();
	return fetch(`${KICK_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...init?.headers,
		},
	});
}

export async function createKickSubscription(broadcasterId: string) {
	const numericBroadcasterId = Number(broadcasterId);
	if (
		!Number.isSafeInteger(numericBroadcasterId) ||
		numericBroadcasterId <= 0
	) {
		throw new Error("Kick broadcaster ID was invalid");
	}
	const response = await kickRequest("/events/subscriptions", {
		method: "POST",
		body: JSON.stringify({
			broadcaster_user_id: numericBroadcasterId,
			events: [{ name: "chat.message.sent", version: 1 }],
			method: "webhook",
		}),
	});
	if (!response.ok)
		throw new Error(`Kick subscription failed (${response.status})`);
	const payload = (await response.json()) as {
		data?: Array<{ error?: string; subscription_id?: string }>;
	};
	const result = payload.data?.[0];
	if (!result?.subscription_id || result.error) {
		throw new Error(result?.error || "Kick subscription response was invalid");
	}
	return result.subscription_id;
}

export async function deleteKickSubscription(subscriptionId: string) {
	const query = new URLSearchParams({ id: subscriptionId });
	const response = await kickRequest(`/events/subscriptions?${query}`, {
		method: "DELETE",
	});
	if (!response.ok && response.status !== 404) {
		throw new Error(`Kick subscription delete failed (${response.status})`);
	}
}

async function listKickSubscriptions() {
	const response = await kickRequest("/events/subscriptions");
	if (!response.ok)
		throw new Error(`Kick subscriptions list failed (${response.status})`);
	const payload = (await response.json()) as { data?: KickSubscription[] };
	return payload.data ?? [];
}

async function reconcileKickSubscriptionsOwned() {
	const enabled = await db
		.select({
			broadcasterId: account.accountId,
			subscriptionId: chatConnection.kickSubscriptionId,
			userId: chatConnection.userId,
		})
		.from(chatConnection)
		.innerJoin(
			account,
			and(
				eq(account.userId, chatConnection.userId),
				eq(account.providerId, "kick"),
			),
		)
		.where(eq(chatConnection.provider, "kick"));
	if (enabled.length === 0) return;
	const active = await listKickSubscriptions();
	const failures: Error[] = [];
	for (const connection of enabled) {
		try {
			const existing = active.find(
				(subscription) =>
					subscription.id === connection.subscriptionId ||
					(subscription.event === "chat.message.sent" &&
						String(subscription.broadcaster_user_id) ===
							connection.broadcasterId),
			);
			const subscriptionId =
				existing?.id ??
				(await createKickSubscription(connection.broadcasterId));
			if (subscriptionId !== connection.subscriptionId) {
				await db
					.update(chatConnection)
					.set({ kickSubscriptionId: subscriptionId })
					.where(
						and(
							eq(chatConnection.userId, connection.userId),
							eq(chatConnection.provider, "kick"),
						),
					);
			}
		} catch (error) {
			failures.push(
				new Error(
					`Kick reconciliation failed for VISP user ${connection.userId}`,
					{
						cause: error,
					},
				),
			);
		}
	}
	if (failures.length > 0)
		throw new AggregateError(
			failures,
			"Kick chat reconciliation was incomplete",
		);
}

export async function reconcileKickSubscriptions() {
	const lock = await tryAdvisoryLock("visp:kick-reconciler");
	if (!lock) return false;
	try {
		await reconcileKickSubscriptionsOwned();
		return true;
	} finally {
		await lock.release();
	}
}

export type KickWebhookHeaders = {
	messageId: string;
	signature: string;
	timestamp: string;
	type: string;
	version: string;
};

export function verifyKickWebhook(
	rawBody: string,
	headers: KickWebhookHeaders,
	now = Date.now(),
	publicKey: KeyLike = KICK_PUBLIC_KEY,
	replays = replayIds,
) {
	const timestamp = new Date(headers.timestamp).getTime();
	if (
		!Number.isFinite(timestamp) ||
		Math.abs(now - timestamp) > MAX_CLOCK_SKEW_MS
	) {
		return { ok: false as const, reason: "timestamp" as const };
	}
	const verifier = createVerify("RSA-SHA256");
	verifier.update(`${headers.messageId}.${headers.timestamp}.${rawBody}`);
	verifier.end();
	if (!verifier.verify(publicKey, headers.signature, "base64")) {
		return { ok: false as const, reason: "signature" as const };
	}
	for (const [messageId, expiresAt] of replays) {
		if (expiresAt < now) replays.delete(messageId);
	}
	if (replays.has(headers.messageId))
		return { ok: false as const, reason: "replay" as const };
	replays.set(headers.messageId, now + MAX_CLOCK_SKEW_MS);
	return { ok: true as const };
}

export async function handleKickWebhook(
	rawBody: string,
	headers: KickWebhookHeaders,
) {
	if (headers.type !== "chat.message.sent" || headers.version !== "1")
		return "ignored" as const;
	const verified = verifyKickWebhook(rawBody, headers);
	if (!verified.ok) return verified.reason;
	let payload: unknown;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return "payload" as const;
	}
	return handleVerifiedKickPayload(payload);
}

export async function handleVerifiedKickPayload(payload: unknown) {
	if (!payload || typeof payload !== "object") return "payload" as const;
	const event = payload as { broadcaster?: { user_id?: unknown } };
	const broadcasterId = event.broadcaster?.user_id;
	if (typeof broadcasterId !== "number" && typeof broadcasterId !== "string")
		return "payload" as const;
	const [connection] = await db
		.select({ userId: chatConnection.userId })
		.from(chatConnection)
		.innerJoin(
			account,
			and(
				eq(account.userId, chatConnection.userId),
				eq(account.providerId, "kick"),
			),
		)
		.where(
			and(
				eq(chatConnection.provider, "kick"),
				eq(account.accountId, String(broadcasterId)),
			),
		)
		.limit(1);
	if (!connection) return "disabled" as const;
	const message = normalizeKickMessage(payload);
	if (!message) return "payload" as const;
	chatHub.publish(connection.userId, { type: "message", message });
	return "accepted" as const;
}
