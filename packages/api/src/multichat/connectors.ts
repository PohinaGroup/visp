import { getProviderAccessToken } from "@VISP/auth/provider-token";
import { db } from "@VISP/db";
import { account, multiChatSource } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, eq } from "drizzle-orm";
import {
	ControlEvent,
	TikTokLiveConnection,
	WebcastEvent,
} from "tiktok-live-connector";
import {
	createKickSubscription,
	deleteKickSubscription,
	resolveKickChannelLogin,
} from "../chat/kick";
import { normalizeTwitchMessage } from "../chat/normalize";
import type { MultiChatProvider } from "./contract";
import { multiChatHub } from "./hub";

const TWITCH_EVENTSUB_URL =
	"wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
const RETRY_DELAYS = [1_000, 2_000, 5_000, 10_000, 20_000];

type Stop = () => void | Promise<void>;
type Source = typeof multiChatSource.$inferSelect;
type TwitchEnvelope = {
	metadata?: {
		message_type?: string;
		message_timestamp?: string;
		subscription_type?: string;
	};
	payload?: {
		event?: Record<string, unknown>;
		session?: { id?: string; reconnect_url?: string | null };
		subscription?: { status?: string };
	};
};

function sourceError(error: unknown) {
	return error instanceof Error ? error.message : "Could not connect to chat";
}

async function twitchBot() {
	const bot = await db.query.account.findFirst({
		columns: { accountId: true },
		where: and(
			eq(account.userId, env.VISP_CHAT_BOT_USER_ID),
			eq(account.providerId, "twitch"),
		),
	});
	if (!bot) throw new Error("VISP Twitch bot is not linked");
	const token = await getProviderAccessToken("twitch", env.VISP_CHAT_BOT_USER_ID);
	return { accountId: bot.accountId, accessToken: token.accessToken };
}

async function resolveTwitchChannel(login: string) {
	const bot = await twitchBot();
	const response = await fetch(
		`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`,
		{
			headers: {
				Authorization: `Bearer ${bot.accessToken}`,
				"Client-Id": env.TWITCH_CLIENT_ID,
			},
		},
	);
	if (!response.ok)
		throw new Error(`Twitch channel lookup failed (${response.status})`);
	const payload = (await response.json()) as { data?: Array<{ id?: string }> };
	const id = payload.data?.[0]?.id;
	if (!id) throw new Error("Twitch channel was not found");
	return { broadcasterId: id, bot };
}

async function createTwitchSubscription(
	broadcasterId: string,
	sessionId: string,
	bot: { accountId: string; accessToken: string },
) {
	const response = await fetch(
		"https://api.twitch.tv/helix/eventsub/subscriptions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${bot.accessToken}`,
				"Client-Id": env.TWITCH_CLIENT_ID,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				type: "channel.chat.message",
				version: "1",
				condition: {
					broadcaster_user_id: broadcasterId,
					user_id: bot.accountId,
				},
				transport: { method: "websocket", session_id: sessionId },
			}),
		},
	);
	if (response.ok) return;
	const payload = (await response.json().catch(() => null)) as {
		message?: string;
	} | null;
	throw new Error(
		payload?.message ?? `Twitch subscription failed (${response.status})`,
	);
}

function startTwitch(userId: string, source: Source): Stop {
	let socket: WebSocket | undefined;
	let retry = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let running = true;
	let subscribed = false;
	const connect = async (url = TWITCH_EVENTSUB_URL) => {
		if (!running) return;
		multiChatHub.status(userId, "twitch", "connecting");
		try {
			const { broadcasterId, bot } = await resolveTwitchChannel(
				source.channelLogin,
			);
			await db
				.update(multiChatSource)
				.set({ channelId: broadcasterId })
				.where(
					and(
						eq(multiChatSource.userId, userId),
						eq(multiChatSource.provider, "twitch"),
					),
				);
			const nextSocket = new WebSocket(url);
			socket = nextSocket;
			nextSocket.onerror = () => nextSocket.close();
			nextSocket.onclose = () => {
				if (socket === nextSocket) schedule();
			};
			nextSocket.onmessage = ({ data }) => {
				if (typeof data !== "string") return;
				void handle(data, broadcasterId, bot);
			};
		} catch (error) {
			multiChatHub.status(userId, "twitch", "error", sourceError(error));
			schedule();
		}
	};
	const schedule = () => {
		if (!running || timer) return;
		multiChatHub.status(userId, "twitch", "disconnected");
		const delay = RETRY_DELAYS[Math.min(retry, RETRY_DELAYS.length - 1)];
		retry += 1;
		timer = setTimeout(() => {
			timer = undefined;
			subscribed = false;
			void connect();
		}, delay);
	};
	const handle = async (
		raw: string,
		broadcasterId: string,
		bot: { accountId: string; accessToken: string },
	) => {
		let envelope: TwitchEnvelope;
		try {
			envelope = JSON.parse(raw) as TwitchEnvelope;
		} catch {
			return;
		}
		if (envelope.metadata?.message_type === "session_welcome") {
			const sessionId = envelope.payload?.session?.id;
			if (!sessionId || subscribed) return;
			try {
				await createTwitchSubscription(broadcasterId, sessionId, bot);
				subscribed = true;
				retry = 0;
				multiChatHub.status(userId, "twitch", "connected");
			} catch (error) {
				multiChatHub.status(userId, "twitch", "error", sourceError(error));
				socket?.close();
			}
			return;
		}
		if (envelope.metadata?.message_type === "session_reconnect") {
			const reconnectUrl = envelope.payload?.session?.reconnect_url;
			if (reconnectUrl?.startsWith("wss://eventsub.wss.twitch.tv/")) {
				const old = socket;
				subscribed = true;
				void connect(reconnectUrl);
				setTimeout(() => old?.close(), 5_000);
			}
			return;
		}
		if (
			envelope.metadata?.message_type !== "notification" ||
			envelope.metadata.subscription_type !== "channel.chat.message"
		)
			return;
		const message = normalizeTwitchMessage({
			...envelope.payload?.event,
			sent_at: envelope.metadata.message_timestamp,
		});
		if (!message) return;
		multiChatHub.publish(userId, {
			type: "message",
			message: {
				id: message.id,
				provider: "twitch",
				sentAt: message.sentAt,
				sender: message.sender.name,
				color: message.sender.color,
				text: message.fragments.map((fragment) => fragment.text).join(""),
			},
		});
	};
	void connect();
	return () => {
		running = false;
		clearTimeout(timer);
		socket?.close();
		multiChatHub.status(userId, "twitch", "disconnected");
	};
}

function startTikTok(userId: string, source: Source): Stop {
	let running = true;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let connection: TikTokLiveConnection | undefined;
	let retry = 0;
	const connect = async () => {
		if (!running) return;
		multiChatHub.status(userId, "tiktok", "connecting");
		connection = new TikTokLiveConnection(source.channelLogin, {
			processInitialData: false,
			...(env.TIKTOK_SIGN_API_KEY && { signApiKey: env.TIKTOK_SIGN_API_KEY }),
		});
		connection.on(WebcastEvent.CHAT, (data: unknown) => {
			const event = data as {
				msgId?: string | number;
				comment?: string;
				user?: { uniqueId?: string; nickname?: string };
			};
			const text = event.comment?.trim();
			const sender = event.user?.nickname ?? event.user?.uniqueId;
			if (!text || !sender) return;
			multiChatHub.publish(userId, {
				type: "message",
				message: {
					id: String(event.msgId ?? `${Date.now()}-${sender}`),
					provider: "tiktok",
					sentAt: new Date().toISOString(),
					sender,
					text: text.slice(0, 500),
				},
			});
		});
		connection.on(ControlEvent.DISCONNECTED, () => schedule());
		try {
			await connection.connect();
			retry = 0;
			multiChatHub.status(userId, "tiktok", "connected");
		} catch (error) {
			multiChatHub.status(userId, "tiktok", "error", sourceError(error));
			schedule();
		}
	};
	const schedule = () => {
		if (!running || timer) return;
		const delay = RETRY_DELAYS[Math.min(retry, RETRY_DELAYS.length - 1)];
		retry += 1;
		timer = setTimeout(() => {
			timer = undefined;
			void connect();
		}, delay);
	};
	void connect();
	return async () => {
		running = false;
		clearTimeout(timer);
		await connection?.disconnect().catch(() => undefined);
		multiChatHub.status(userId, "tiktok", "disconnected");
	};
}

async function startKick(userId: string, source: Source): Promise<Stop> {
	multiChatHub.status(userId, "kick", "connecting");
	const channel = await resolveKickChannelLogin(source.channelLogin);
	const subscriptions = await createKickSubscription(channel.id, [
		"chat.message.sent",
	] as const);
	const subscriptionId = subscriptions.get("chat.message.sent");
	if (!subscriptionId)
		throw new Error("Kick chat subscription was not created");
	await db
		.update(multiChatSource)
		.set({ channelId: channel.id, kickSubscriptionId: subscriptionId })
		.where(
			and(
				eq(multiChatSource.userId, userId),
				eq(multiChatSource.provider, "kick"),
			),
		);
	multiChatHub.status(userId, "kick", "connected");
	return async () => {
		await deleteKickSubscription(subscriptionId).catch(() => undefined);
		await db
			.update(multiChatSource)
			.set({ kickSubscriptionId: null })
			.where(
				and(
					eq(multiChatSource.userId, userId),
					eq(multiChatSource.provider, "kick"),
				),
			);
		multiChatHub.status(userId, "kick", "disconnected");
	};
}

class MultiChatSourceManager {
	private readonly audiences = new Map<string, number>();
	private readonly active = new Map<string, Map<MultiChatProvider, Stop>>();

	constructor() {
		multiChatHub.onAudienceChanged(
			(userId, count) => void this.audienceChanged(userId, count),
		);
		multiChatHub.onRefresh((userId) => void this.refresh(userId));
	}

	private async audienceChanged(userId: string, count: number) {
		this.audiences.set(userId, count);
		if (count === 0) return this.stop(userId);
		await this.start(userId);
	}

	private async refresh(userId: string) {
		await this.stop(userId);
		if ((this.audiences.get(userId) ?? 0) > 0) await this.start(userId);
	}

	private async start(userId: string) {
		if (this.active.has(userId)) return;
		const sources = await db
			.select()
			.from(multiChatSource)
			.where(
				and(
					eq(multiChatSource.userId, userId),
					eq(multiChatSource.enabled, true),
				),
			);
		const active = new Map<MultiChatProvider, Stop>();
		this.active.set(userId, active);
		for (const source of sources) {
			try {
				const stop =
					source.provider === "twitch"
						? startTwitch(userId, source)
						: source.provider === "tiktok"
							? startTikTok(userId, source)
							: await startKick(userId, source);
				active.set(source.provider, stop);
			} catch (error) {
				multiChatHub.status(
					userId,
					source.provider,
					"error",
					sourceError(error),
				);
			}
		}
	}

	private async stop(userId: string) {
		const active = this.active.get(userId);
		this.active.delete(userId);
		await Promise.all([...(active?.values() ?? [])].map((stop) => stop()));
	}
}

/** Start once in the API process; browser sources drive its lifetime. */
export function startMultiChatSources() {
	new MultiChatSourceManager();
}
