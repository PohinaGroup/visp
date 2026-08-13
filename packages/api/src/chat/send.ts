import { auth } from "@VISP/auth";
import { db } from "@VISP/db";
import { account } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, eq, inArray } from "drizzle-orm";
import { fixedWindow } from "../rate-limit";
import { hasChatWriteScope } from "../scopes";
import { type ChatProvider, chatAuthProvider } from "./contract";
import { findActiveYoutubeChat } from "./youtube";

/**
 * One cap for all three providers. Twitch and Kick allow 500, YouTube 200 —
 * writing to the smallest keeps a single truncation rule instead of three, and
 * a chat line nobody can read in one glance is not a better alert.
 */
export const MAX_SEND_LENGTH = 200;

/**
 * The spend and ban ceiling. A bot that loops is the failure mode that gets an
 * account timed out, so this limiter is the one part of the send path that is
 * not optional. Per instance, which is enough: the bot runtime holds a
 * per-user advisory lock, so only one instance is ever sending for a user.
 */
const sends = fixedWindow(20, 60_000);
const MIN_INTERVAL_MS = 1_500;
const lastSentAt = new Map<string, number>();

const YOUTUBE_CHAT_TTL_MS = 5 * 60_000;
const youtubeChats = new Map<string, { id: string; expiresAt: number }>();

export type SendResult = "sent" | "unauthorized" | "throttled" | "unavailable";

export type SendDependencies = {
	fetch: typeof fetch;
	getAccessToken: (
		providerId: string,
		userId: string,
	) => Promise<{ accessToken: string }>;
	loadAccount: (
		providerId: string,
		userId: string,
	) => Promise<{ accountId: string; scope: string | null } | undefined>;
	liveChatId: (userId: string) => Promise<string | null>;
};

const defaultDependencies: SendDependencies = {
	fetch: globalThis.fetch,
	getAccessToken: (providerId, userId) =>
		auth.api.getAccessToken({ body: { providerId, userId } }),
	loadAccount: async (providerId, userId) =>
		db.query.account.findFirst({
			columns: { accountId: true, scope: true },
			where: and(
				eq(account.userId, userId),
				eq(account.providerId, providerId),
			),
		}),
	liveChatId: async (userId) => {
		const cached = youtubeChats.get(userId);
		if (cached && cached.expiresAt > Date.now()) return cached.id;
		const id = await findActiveYoutubeChat(userId);
		if (id) {
			youtubeChats.set(userId, {
				id,
				expiresAt: Date.now() + YOUTUBE_CHAT_TTL_MS,
			});
		}
		return id;
	},
};

/** Chat is one line: a newline would either be dropped or split the message. */
export function prepareMessage(text: string) {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > MAX_SEND_LENGTH
		? `${flat.slice(0, MAX_SEND_LENGTH - 1).trimEnd()}…`
		: flat;
}

function throttled(userId: string, provider: ChatProvider, now: number) {
	const key = `${userId}:${provider}`;
	if (now - (lastSentAt.get(key) ?? 0) < MIN_INTERVAL_MS) return true;
	if (!sends.take(key, now)) return true;
	lastSentAt.set(key, now);
	return false;
}

export function resetSendLimits() {
	sends.reset();
	lastSentAt.clear();
	youtubeChats.clear();
}

/**
 * Posts one line to one platform as the streamer's own account.
 *
 * Never throws: every caller is a fire-and-forget alert or command reply, and
 * a chat failure must not take a stream event handler down with it.
 */
export async function sendChatMessage(
	userId: string,
	provider: ChatProvider,
	text: string,
	dependencies: SendDependencies = defaultDependencies,
	now = Date.now(),
): Promise<SendResult> {
	const message = prepareMessage(text);
	if (!message) return "unavailable";
	if (throttled(userId, provider, now)) return "throttled";

	const providerId = chatAuthProvider(provider);
	try {
		const linked = await dependencies.loadAccount(providerId, userId);
		if (!linked || !hasChatWriteScope(provider, linked.scope)) {
			return "unauthorized";
		}
		const { accessToken } = await dependencies.getAccessToken(
			providerId,
			userId,
		);
		const response = await sendToProvider(
			{ accessToken, accountId: linked.accountId, message, provider, userId },
			dependencies,
		);
		if (!response) return "unavailable";
		if (response.ok) return "sent";
		return response.status === 401 || response.status === 403
			? "unauthorized"
			: "unavailable";
	} catch {
		return "unavailable";
	}
}

async function sendToProvider(
	input: {
		accessToken: string;
		accountId: string;
		message: string;
		provider: ChatProvider;
		userId: string;
	},
	dependencies: SendDependencies,
) {
	if (input.provider === "twitch") {
		return dependencies.fetch("https://api.twitch.tv/helix/chat/messages", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${input.accessToken}`,
				"Client-Id": env.TWITCH_CLIENT_ID,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				broadcaster_id: input.accountId,
				sender_id: input.accountId,
				message: input.message,
			}),
		});
	}
	if (input.provider === "kick") {
		return dependencies.fetch("https://api.kick.com/public/v1/chat", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${input.accessToken}`,
				"Content-Type": "application/json",
			},
			// "user" posts as the streamer on their own channel, which is what the
			// granted user token authorizes. "bot" would need a separate identity.
			body: JSON.stringify({
				broadcaster_user_id: Number(input.accountId),
				content: input.message,
				type: "user",
			}),
		});
	}
	// YouTube live chat only exists while a broadcast is active, and its id
	// changes with every broadcast.
	const liveChatId = await dependencies.liveChatId(input.userId);
	if (!liveChatId) return null;
	return dependencies.fetch(
		"https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${input.accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				snippet: {
					liveChatId,
					type: "textMessageEvent",
					textMessageDetails: { messageText: input.message },
				},
			}),
		},
	);
}

/** Which providers this account has both enabled for chat and consented to post on. */
export async function sendableProviders(userId: string) {
	const rows = await db
		.select({ provider: account.providerId, scope: account.scope })
		.from(account)
		.where(
			and(
				eq(account.userId, userId),
				inArray(account.providerId, ["twitch", "kick", "google"]),
			),
		);
	return (["twitch", "kick", "youtube"] as const).filter((provider) => {
		const linked = rows.find(
			(row) => row.provider === chatAuthProvider(provider),
		);
		return Boolean(linked) && hasChatWriteScope(provider, linked?.scope);
	});
}
