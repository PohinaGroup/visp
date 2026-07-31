import { auth } from "@VISP/auth";
import { db } from "@VISP/db";
import { account, chatConnection } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, eq } from "drizzle-orm";
import { type AdvisoryLock, tryAdvisoryLock } from "../advisory-lock";
import { chatHub } from "./hub";
import { normalizeTwitchMessage } from "./normalize";
import { loadTwitchBadges } from "./twitch-badges";

const EVENTSUB_URL =
	"wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
const RETRY_DELAYS = [1_000, 2_000, 5_000, 10_000, 20_000];

type EventSubEnvelope = {
	metadata?: {
		message_timestamp?: string;
		message_type?: string;
		subscription_type?: string;
	};
	payload?: {
		event?: Record<string, unknown>;
		session?: {
			id?: string;
			keepalive_timeout_seconds?: number | null;
			reconnect_url?: string | null;
		};
		subscription?: { status?: string };
	};
};

type TwitchSubscriptionDependencies = {
	fetch: typeof fetch;
	getAccessToken: (userId: string) => Promise<{ accessToken: string }>;
};

export async function createTwitchChatSubscription(
	input: { broadcasterId: string; sessionId: string; userId: string },
	dependencies: TwitchSubscriptionDependencies = {
		fetch: globalThis.fetch,
		getAccessToken: (userId) =>
			auth.api.getAccessToken({ body: { providerId: "twitch", userId } }),
	},
) {
	const token = await dependencies.getAccessToken(input.userId);
	const response = await dependencies.fetch(
		"https://api.twitch.tv/helix/eventsub/subscriptions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token.accessToken}`,
				"Client-Id": env.TWITCH_CLIENT_ID,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				type: "channel.chat.message",
				version: "1",
				condition: {
					broadcaster_user_id: input.broadcasterId,
					user_id: input.broadcasterId,
				},
				transport: { method: "websocket", session_id: input.sessionId },
			}),
		},
	);
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as {
			message?: unknown;
		} | null;
		throw new Error(
			typeof payload?.message === "string"
				? payload.message
				: `Twitch subscription failed (${response.status})`,
		);
	}
}

class TwitchConnector {
	private badges = new Map<string, string>();
	private keepaliveTimer?: ReturnType<typeof setTimeout>;
	private reconnectTimer?: ReturnType<typeof setTimeout>;
	private retry = 0;
	private running = true;
	private socket?: WebSocket;

	constructor(
		private readonly userId: string,
		private readonly broadcasterId: string,
	) {
		this.connect(EVENTSUB_URL, true);
	}

	stop() {
		this.running = false;
		clearTimeout(this.keepaliveTimer);
		clearTimeout(this.reconnectTimer);
		this.socket?.close(1000, "No active VISP chat viewers");
		this.socket = undefined;
		chatHub.status(this.userId, "twitch", "disconnected");
	}

	private connect(url: string, subscribe: boolean) {
		if (!this.running) return;
		chatHub.status(this.userId, "twitch", "connecting");
		let socket: WebSocket;
		try {
			socket = new WebSocket(url);
		} catch {
			this.scheduleReconnect();
			return;
		}
		this.socket = socket;
		socket.onmessage = (event) => void this.onMessage(event.data, subscribe);
		socket.onerror = () => socket.close();
		socket.onclose = () => {
			if (this.socket === socket) this.scheduleReconnect();
		};
	}

	private async onMessage(raw: unknown, subscribe: boolean) {
		if (typeof raw !== "string") return;
		let message: EventSubEnvelope;
		try {
			message = JSON.parse(raw) as EventSubEnvelope;
		} catch {
			return;
		}
		this.resetKeepalive(message.payload?.session?.keepalive_timeout_seconds);
		switch (message.metadata?.message_type) {
			case "session_welcome": {
				this.retry = 0;
				const sessionId = message.payload?.session?.id;
				if (!sessionId) return;
				if (subscribe) {
					try {
						await this.subscribe(sessionId);
					} catch (error) {
						chatHub.status(
							this.userId,
							"twitch",
							"error",
							error instanceof Error
								? error.message
								: "Twitch chat could not be started",
						);
						this.socket?.close();
						return;
					}
				}
				void loadTwitchBadges(this.userId, this.broadcasterId).then(
					(badges) => {
						this.badges = badges;
					},
				);
				chatHub.status(this.userId, "twitch", "connected");
				break;
			}
			case "notification": {
				if (message.metadata.subscription_type !== "channel.chat.message")
					return;
				const normalized = normalizeTwitchMessage(
					{
						...message.payload?.event,
						sent_at: message.metadata.message_timestamp,
					},
					(setId, versionId) => this.badges.get(`${setId}/${versionId}`),
				);
				if (normalized)
					chatHub.publish(this.userId, {
						type: "message",
						message: normalized,
					});
				break;
			}
			case "session_reconnect": {
				const reconnectUrl = message.payload?.session?.reconnect_url;
				if (reconnectUrl?.startsWith("wss://eventsub.wss.twitch.tv/")) {
					const old = this.socket;
					this.connect(reconnectUrl, false);
					setTimeout(() => old?.close(1000, "EventSub handoff"), 5_000);
				}
				break;
			}
			case "revocation": {
				const reason = message.payload?.subscription?.status;
				chatHub.status(
					this.userId,
					"twitch",
					"error",
					reason
						? `Twitch chat revoked: ${reason.replaceAll("_", " ")}`
						: "Twitch revoked the chat subscription",
				);
				break;
			}
		}
	}

	private async subscribe(sessionId: string) {
		await createTwitchChatSubscription({
			broadcasterId: this.broadcasterId,
			sessionId,
			userId: this.userId,
		});
	}

	private resetKeepalive(seconds?: number | null) {
		clearTimeout(this.keepaliveTimer);
		const timeout = Math.max(10, seconds ?? 30) * 1000 + 5_000;
		this.keepaliveTimer = setTimeout(() => this.socket?.close(), timeout);
	}

	private scheduleReconnect() {
		if (!this.running || this.reconnectTimer) return;
		chatHub.status(this.userId, "twitch", "disconnected");
		const delay = RETRY_DELAYS[Math.min(this.retry, RETRY_DELAYS.length - 1)];
		this.retry += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined;
			this.connect(EVENTSUB_URL, true);
		}, delay);
	}
}

class TwitchConnectorManager {
	private readonly connectors = new Map<string, TwitchConnector>();
	private readonly locks = new Map<string, AdvisoryLock>();
	private readonly audienceCounts = new Map<string, number>();
	private readonly pending = new Map<string, Promise<void>>();

	constructor() {
		chatHub.onAudienceChanged(
			(userId, count) =>
				void this.audienceChanged(userId, count).catch((error) =>
					chatHub.status(
						userId,
						"twitch",
						"error",
						error instanceof Error
							? error.message
							: "Twitch chat could not be started",
					),
				),
		);
		chatHub.onConnectorRefresh((userId) => {
			void this.refresh(userId);
		});
	}

	private async audienceChanged(userId: string, count: number) {
		this.audienceCounts.set(userId, count);
		if (count === 0) {
			await this.stop(userId);
			return;
		}
		await this.ensureStarted(userId);
	}

	async refresh(userId: string) {
		await this.stop(userId);
		await this.pending.get(userId)?.catch(() => undefined);
		await this.stop(userId);
		await this.ensureStarted(userId).catch((error) =>
			chatHub.status(
				userId,
				"twitch",
				"error",
				error instanceof Error
					? error.message
					: "Twitch chat could not be started",
			),
		);
	}

	private async ensureStarted(userId: string) {
		if (
			(this.audienceCounts.get(userId) ?? 0) === 0 ||
			this.connectors.has(userId) ||
			this.pending.has(userId)
		)
			return;
		const start = this.start(userId).finally(() => this.pending.delete(userId));
		this.pending.set(userId, start);
		await start;
	}

	private async start(userId: string) {
		const [enabled] = await db
			.select({ broadcasterId: account.accountId })
			.from(chatConnection)
			.innerJoin(
				account,
				and(
					eq(account.userId, chatConnection.userId),
					eq(account.providerId, "twitch"),
				),
			)
			.where(
				and(
					eq(chatConnection.userId, userId),
					eq(chatConnection.provider, "twitch"),
				),
			)
			.limit(1);
		if (
			(this.audienceCounts.get(userId) ?? 0) > 0 &&
			enabled &&
			!this.connectors.has(userId)
		) {
			const lock = await tryAdvisoryLock(`chat:${userId}`, () => {
				void this.lockLost(userId);
			});
			if (!lock) {
				setTimeout(() => void this.ensureStarted(userId), 10_000);
				return;
			}
			if (
				(this.audienceCounts.get(userId) ?? 0) === 0 ||
				this.connectors.has(userId)
			) {
				await lock.release();
				return;
			}
			this.locks.set(userId, lock);
			this.connectors.set(
				userId,
				new TwitchConnector(userId, enabled.broadcasterId),
			);
		}
	}

	private async stop(userId: string) {
		this.connectors.get(userId)?.stop();
		this.connectors.delete(userId);
		const lock = this.locks.get(userId);
		this.locks.delete(userId);
		await lock?.release();
	}

	private async lockLost(userId: string) {
		this.connectors.get(userId)?.stop();
		this.connectors.delete(userId);
		this.locks.delete(userId);
		if ((this.audienceCounts.get(userId) ?? 0) > 0) {
			setTimeout(() => void this.ensureStarted(userId), 1_000);
		}
	}
}

export const twitchConnectors = new TwitchConnectorManager();
