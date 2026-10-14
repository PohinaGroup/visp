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
import { type EventSubSocket, SharedTwitchEventSub } from "./twitch-eventsub";

const RETRY_DELAYS = [1_000, 2_000, 5_000, 10_000, 20_000];
/** Coalesces a burst of saves into one rebuild of the provider connections. */
const REFRESH_DEBOUNCE_MS = 1_500;

type Stop = () => void | Promise<void>;
type Source = typeof multiChatSource.$inferSelect;

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
	const token = await getProviderAccessToken(
		"twitch",
		env.VISP_CHAT_BOT_USER_ID,
	);
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
	return id;
}

async function createTwitchSubscription(
	broadcasterId: string,
	sessionId: string,
) {
	const bot = await twitchBot();
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
	const payload = (await response.json().catch(() => null)) as {
		message?: string;
		data?: Array<{ id?: string }>;
	} | null;
	const id = payload?.data?.[0]?.id;
	if (response.ok && id) return id;
	throw new Error(
		payload?.message ?? `Twitch subscription failed (${response.status})`,
	);
}

async function deleteTwitchSubscription(subscriptionId: string) {
	const bot = await twitchBot();
	await fetch(
		`https://api.twitch.tv/helix/eventsub/subscriptions?id=${encodeURIComponent(subscriptionId)}`,
		{
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${bot.accessToken}`,
				"Client-Id": env.TWITCH_CLIENT_ID,
			},
		},
	);
}

const twitchEventSub = new SharedTwitchEventSub({
	connect: (url) => {
		const ws = new WebSocket(url);
		const socket: EventSubSocket = {
			onmessage: null,
			onclose: null,
			onerror: null,
			close: () => ws.close(),
		};
		ws.onmessage = (event) => socket.onmessage?.({ data: event.data });
		ws.onclose = () => socket.onclose?.();
		ws.onerror = () => socket.onerror?.();
		return socket;
	},
	subscribe: createTwitchSubscription,
	unsubscribe: deleteTwitchSubscription,
});

function startTwitch(userId: string, source: Source): Stop {
	let running = true;
	let retry = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let release: (() => void) | undefined;
	const connect = async () => {
		if (!running) return;
		multiChatHub.status(userId, "twitch", "connecting");
		try {
			const broadcasterId = await resolveTwitchChannel(source.channelLogin);
			await db
				.update(multiChatSource)
				.set({ channelId: broadcasterId })
				.where(
					and(
						eq(multiChatSource.userId, userId),
						eq(multiChatSource.provider, "twitch"),
					),
				);
			if (!running) return;
			release = twitchEventSub.add(broadcasterId, {
				onStatus: (state, error) =>
					multiChatHub.status(userId, "twitch", state, error),
				onMessage: (event, sentAt) => {
					const message = normalizeTwitchMessage({
						...event,
						sent_at: sentAt,
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
				},
			});
		} catch (error) {
			multiChatHub.status(userId, "twitch", "error", sourceError(error));
			if (!running) return;
			const delay = RETRY_DELAYS[Math.min(retry, RETRY_DELAYS.length - 1)];
			retry += 1;
			timer = setTimeout(() => {
				timer = undefined;
				void connect();
			}, delay);
		}
	};
	void connect();
	return () => {
		running = false;
		clearTimeout(timer);
		release?.();
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
		// Compare-and-set: a newer start may already have stored its own id.
		await db
			.update(multiChatSource)
			.set({ kickSubscriptionId: null })
			.where(
				and(
					eq(multiChatSource.userId, userId),
					eq(multiChatSource.provider, "kick"),
					eq(multiChatSource.kickSubscriptionId, subscriptionId),
				),
			);
		multiChatHub.status(userId, "kick", "disconnected");
	};
}

type Running = { channelLogin: string; stop: Stop };

/** What `refresh` must change to make `running` match `wanted`. */
export function planSourceChanges<
	T extends { provider: MultiChatProvider; channelLogin: string },
>(
	running: ReadonlyMap<MultiChatProvider, { channelLogin: string }>,
	wanted: readonly T[],
) {
	const wantedBy = new Map(wanted.map((source) => [source.provider, source]));
	const stop = [...running].flatMap(([provider, current]) =>
		wantedBy.get(provider)?.channelLogin === current.channelLogin
			? []
			: [provider],
	);
	const start = wanted.filter(
		(source) =>
			running.get(source.provider)?.channelLogin !== source.channelLogin,
	);
	return { stop, start };
}

class MultiChatSourceManager {
	private readonly audiences = new Map<string, number>();
	private readonly active = new Map<string, Map<MultiChatProvider, Running>>();
	/** Per-user tail of queued work: a stop and a later start never overlap. */
	private readonly queues = new Map<string, Promise<void>>();
	private readonly refreshTimers = new Map<
		string,
		ReturnType<typeof setTimeout>
	>();

	constructor() {
		multiChatHub.onAudienceChanged((userId, count) => {
			this.audiences.set(userId, count);
			if (count === 0) this.audiences.delete(userId);
			this.enqueue(userId, () => this.sync(userId));
		});
		multiChatHub.onRefresh((userId) => this.requestRefresh(userId));
	}

	private requestRefresh(userId: string) {
		clearTimeout(this.refreshTimers.get(userId));
		this.refreshTimers.set(
			userId,
			setTimeout(() => {
				this.refreshTimers.delete(userId);
				this.enqueue(userId, () => this.sync(userId));
			}, REFRESH_DEBOUNCE_MS),
		);
	}

	private enqueue(userId: string, task: () => Promise<void>) {
		const next = (this.queues.get(userId) ?? Promise.resolve())
			.then(task)
			.catch((error) => console.error("Multichat sources failed", error));
		this.queues.set(userId, next);
		void next.finally(() => {
			if (this.queues.get(userId) === next) this.queues.delete(userId);
		});
	}

	/**
	 * Brings the running connections in line with the saved sources. Unchanged
	 * sources keep their connection, so a repeated save costs one SELECT and no
	 * provider calls; a source whose start failed is not running and is retried.
	 */
	private async sync(userId: string) {
		const active = this.active.get(userId) ?? new Map();
		const wanted =
			(this.audiences.get(userId) ?? 0) > 0
				? await db
						.select()
						.from(multiChatSource)
						.where(
							and(
								eq(multiChatSource.userId, userId),
								eq(multiChatSource.enabled, true),
							),
						)
				: [];
		const plan = planSourceChanges(active, wanted);
		await Promise.all(
			plan.stop.map(async (provider) => {
				const running = active.get(provider);
				active.delete(provider);
				await running?.stop();
			}),
		);
		for (const source of plan.start) {
			try {
				const stop =
					source.provider === "twitch"
						? startTwitch(userId, source)
						: source.provider === "tiktok"
							? startTikTok(userId, source)
							: await startKick(userId, source);
				active.set(source.provider, {
					channelLogin: source.channelLogin,
					stop,
				});
			} catch (error) {
				multiChatHub.status(
					userId,
					source.provider,
					"error",
					sourceError(error),
				);
			}
		}
		if (active.size > 0) this.active.set(userId, active);
		else this.active.delete(userId);
	}
}

/** Start once in the API process; browser sources drive its lifetime. */
export function startMultiChatSources() {
	new MultiChatSourceManager();
}
