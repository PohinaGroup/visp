import { getProviderAccessToken } from "@VISP/auth/provider-token";
import { db } from "@VISP/db";
import { account, type chatBotSenderModes } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, eq, inArray } from "drizzle-orm";
import { fixedWindow } from "../rate-limit";
import { hasChatWriteScope, hasTwitchBotChannelScope } from "../scopes";
import { type ChatProvider, chatAuthProvider } from "./contract";
import { getEffectiveBotSenderMode } from "./sender";
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
type BotSenderMode = (typeof chatBotSenderModes)[number];

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
	loadSenderMode: (userId: string) => Promise<BotSenderMode | undefined>;
	liveChatId: (userId: string) => Promise<string | null>;
};

/** Exported so the AI moderator can pin the sender to the shared bot. */
export const sendDependencies: SendDependencies = {
	fetch: globalThis.fetch,
	getAccessToken: (providerId, userId) =>
		getProviderAccessToken(providerId, userId),
	loadAccount: async (providerId, userId) =>
		db.query.account.findFirst({
			columns: { accountId: true, scope: true },
			where: and(
				eq(account.userId, userId),
				eq(account.providerId, providerId),
			),
		}),
	loadSenderMode: getEffectiveBotSenderMode,
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
 * Posts one line to one platform. Twitch defaults to VISP's shared bot;
 * Kick, YouTube, and Twitch compatibility mode post as the streamer.
 *
 * Never throws: every caller is a fire-and-forget alert or command reply, and
 * a chat failure must not take a stream event handler down with it.
 */
export async function sendChatMessage(
	userId: string,
	provider: ChatProvider,
	text: string,
	dependencies: SendDependencies = sendDependencies,
	now = Date.now(),
): Promise<SendResult> {
	const message = prepareMessage(text);
	if (!message) return "unavailable";
	if (throttled(userId, provider, now)) return "throttled";

	const providerId = chatAuthProvider(provider);
	// Every caller drops the result, so the reason is only ever seen here.
	const fail = (result: SendResult, reason: string) => {
		console.warn(`Chat send to ${provider} failed for ${userId}: ${reason}`);
		return result;
	};
	try {
		const linked = await dependencies.loadAccount(providerId, userId);
		if (!linked) return fail("unauthorized", `no linked ${providerId} account`);

		let sender = linked;
		let credentialUserId = userId;
		if (provider === "twitch") {
			const senderMode = (await dependencies.loadSenderMode(userId)) ?? "visp";
			if (senderMode === "visp") {
				if (!hasTwitchBotChannelScope(linked.scope))
					return fail("unauthorized", "streamer has not granted channel:bot");
				const bot = await dependencies.loadAccount(
					"twitch",
					env.VISP_CHAT_BOT_USER_ID,
				);
				if (!bot || !hasChatWriteScope("twitch", bot.scope)) {
					return fail(
						"unauthorized",
						bot
							? "shared bot account lacks user:write:chat"
							: `no Twitch account linked to VISP_CHAT_BOT_USER_ID (${env.VISP_CHAT_BOT_USER_ID})`,
					);
				}
				sender = bot;
				credentialUserId = env.VISP_CHAT_BOT_USER_ID;
			} else if (!hasChatWriteScope("twitch", linked.scope)) {
				return fail("unauthorized", "streamer lacks user:write:chat");
			}
		} else if (!hasChatWriteScope(provider, linked.scope)) {
			return fail("unauthorized", "streamer lacks the chat write scope");
		}
		const { accessToken } = await dependencies.getAccessToken(
			providerId,
			credentialUserId,
		);
		const response = await sendToProvider(
			{
				accessToken,
				broadcasterId: linked.accountId,
				message,
				provider,
				senderId: sender.accountId,
				userId,
			},
			dependencies,
		);
		if (!response) return fail("unavailable", "no active live chat");
		if (response.ok) {
			if (provider !== "twitch") return "sent";
			// Twitch answers 200 even when it drops the line (AutoMod, shield
			// mode, a bot it does not trust here); only `is_sent` says it posted.
			const sent = (await response
				.clone()
				.json()
				.catch(() => null)) as {
				data?: { is_sent?: boolean; drop_reason?: { message?: string } }[];
			} | null;
			const row = sent?.data?.[0];
			if (row?.is_sent !== false) return "sent";
			return fail(
				"unavailable",
				`Twitch dropped it: ${row.drop_reason?.message ?? "no reason given"}`,
			);
		}
		const body = await response.text().catch(() => "");
		return fail(
			response.status === 401 || response.status === 403
				? "unauthorized"
				: "unavailable",
			`HTTP ${response.status} ${body.slice(0, 300)}`,
		);
	} catch (error) {
		return fail("unavailable", String(error));
	}
}

async function sendToProvider(
	input: {
		accessToken: string;
		broadcasterId: string;
		message: string;
		provider: ChatProvider;
		senderId: string;
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
				broadcaster_id: input.broadcasterId,
				sender_id: input.senderId,
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
				broadcaster_user_id: Number(input.broadcasterId),
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
	const senderMode = await getEffectiveBotSenderMode(userId);
	const userIds =
		senderMode === "visp" ? [userId, env.VISP_CHAT_BOT_USER_ID] : [userId];
	const rows = await db
		.select({
			provider: account.providerId,
			scope: account.scope,
			userId: account.userId,
		})
		.from(account)
		.where(
			and(
				inArray(account.userId, userIds),
				inArray(account.providerId, ["twitch", "kick", "google"]),
			),
		);
	return (["twitch", "kick", "youtube"] as const).filter((provider) => {
		const linked = rows.find(
			(row) =>
				row.provider === chatAuthProvider(provider) && row.userId === userId,
		);
		if (provider === "twitch" && senderMode === "visp") {
			const bot = rows.find(
				(row) =>
					row.provider === "twitch" && row.userId === env.VISP_CHAT_BOT_USER_ID,
			);
			return (
				Boolean(linked) &&
				hasTwitchBotChannelScope(linked?.scope) &&
				Boolean(bot) &&
				hasChatWriteScope("twitch", bot?.scope)
			);
		}
		return Boolean(linked) && hasChatWriteScope(provider, linked?.scope);
	});
}
