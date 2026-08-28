import { auth } from "@VISP/auth";
import { db } from "@VISP/db";
import { account, chatConnection } from "@VISP/db/schema/index";
import { and, eq } from "drizzle-orm";
import { type AdvisoryLock, tryAdvisoryLock } from "../advisory-lock";
import type { ChatLiveEvent } from "./contract";
import { chatHub } from "./hub";
import { normalizeYoutubeAlert, normalizeYoutubeMessage } from "./normalize";

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const DISCOVERY_INTERVAL_MS = 15_000;
const RETRY_DELAYS = [1_000, 2_000, 5_000, 10_000, 20_000];

type YoutubeChatDependencies = {
	fetch: typeof fetch;
	getAccessToken: (userId: string) => Promise<{ accessToken: string }>;
};

const defaultDependencies: YoutubeChatDependencies = {
	fetch: globalThis.fetch,
	getAccessToken: (userId) =>
		auth.api.getAccessToken({ body: { providerId: "google", userId } }),
};

type YoutubeChatPage = {
	items?: unknown[];
	nextPageToken?: string;
	offlineAt?: string;
	pollingIntervalMillis?: number;
};

class YoutubeChatError extends Error {
	constructor(
		readonly kind: "ended" | "permission" | "transient",
		message: string,
	) {
		super(message);
	}
}

async function youtubeRequest(
	userId: string,
	path: string,
	dependencies: YoutubeChatDependencies,
) {
	const { accessToken } = await dependencies.getAccessToken(userId);
	const response = await dependencies.fetch(`${YOUTUBE_API}${path}`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (response.ok) return response;
	const payload = (await response.json().catch(() => null)) as {
		error?: { errors?: Array<{ reason?: string }>; message?: string };
	} | null;
	const reason = payload?.error?.errors?.[0]?.reason;
	const message =
		payload?.error?.message ?? `YouTube chat failed (${response.status})`;
	if (reason === "liveChatEnded" || reason === "liveChatNotFound") {
		throw new YoutubeChatError("ended", message);
	}
	if (
		response.status === 401 ||
		(response.status === 403 && reason !== "rateLimitExceeded")
	) {
		throw new YoutubeChatError("permission", message);
	}
	throw new YoutubeChatError("transient", message);
}

export async function findActiveYoutubeChat(
	userId: string,
	dependencies: YoutubeChatDependencies = defaultDependencies,
) {
	const query = new URLSearchParams({
		part: "snippet",
		mine: "true",
		broadcastStatus: "active",
		broadcastType: "all",
		maxResults: "5",
	});
	const response = await youtubeRequest(
		userId,
		`/liveBroadcasts?${query}`,
		dependencies,
	);
	const payload = (await response.json()) as {
		items?: Array<{ snippet?: { liveChatId?: unknown } }>;
	};
	const chatId = payload.items?.find(
		(item) => typeof item.snippet?.liveChatId === "string",
	)?.snippet?.liveChatId;
	if (typeof chatId === "string") return chatId;
	if ((payload.items?.length ?? 0) > 0) {
		throw new YoutubeChatError(
			"permission",
			"YouTube live chat is disabled for the active broadcast",
		);
	}
	return null;
}

export async function fetchYoutubeChatPage(
	userId: string,
	liveChatId: string,
	pageToken?: string,
	dependencies: YoutubeChatDependencies = defaultDependencies,
): Promise<YoutubeChatPage> {
	const query = new URLSearchParams({
		part: "id,snippet,authorDetails",
		liveChatId,
		maxResults: "200",
		profileImageSize: "16",
	});
	if (pageToken) query.set("pageToken", pageToken);
	const response = await youtubeRequest(
		userId,
		`/liveChat/messages?${query}`,
		dependencies,
	);
	return (await response.json()) as YoutubeChatPage;
}

export function youtubePageMessages(page: YoutubeChatPage, initial: boolean) {
	if (initial) return [];
	return (page.items ?? []).flatMap<ChatLiveEvent>((item) => {
		const type =
			item && typeof item === "object"
				? (item as { snippet?: { type?: unknown } }).snippet?.type
				: undefined;
		if (
			type === "newSponsorEvent" ||
			type === "memberMilestoneChatEvent" ||
			type === "membershipGiftingEvent" ||
			type === "giftMembershipReceivedEvent" ||
			type === "superChatEvent" ||
			type === "superStickerEvent"
		) {
			const alert = normalizeYoutubeAlert(item);
			return alert ? [{ type: "alert", alert }] : [];
		}
		const message = normalizeYoutubeMessage(item);
		return message ? [{ type: "message", message }] : [];
	});
}

class YoutubeConnector {
	private chatId?: string;
	private initialPage = true;
	private pageToken?: string;
	private retry = 0;
	private running = true;
	private timer?: ReturnType<typeof setTimeout>;

	constructor(
		private readonly userId: string,
		private readonly dependencies: YoutubeChatDependencies = defaultDependencies,
	) {
		this.schedule(0);
	}

	stop() {
		this.running = false;
		clearTimeout(this.timer);
		chatHub.status(this.userId, "youtube", "disconnected");
	}

	private schedule(delay: number) {
		if (!this.running) return;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => void this.poll(), delay);
	}

	private resetChat() {
		this.chatId = undefined;
		this.pageToken = undefined;
		this.initialPage = true;
	}

	private async poll() {
		if (!this.running) return;
		try {
			if (!this.chatId) {
				chatHub.status(this.userId, "youtube", "connecting");
				this.chatId =
					(await findActiveYoutubeChat(this.userId, this.dependencies)) ??
					undefined;
				if (!this.chatId) {
					this.schedule(DISCOVERY_INTERVAL_MS);
					return;
				}
			}
			// ponytail: REST polling follows YouTube's interval; move to streamList
			// if sustained quota use or latency becomes limiting.
			const page = await fetchYoutubeChatPage(
				this.userId,
				this.chatId,
				this.pageToken,
				this.dependencies,
			);
			if (page.offlineAt) {
				this.resetChat();
				chatHub.status(this.userId, "youtube", "connecting");
				this.schedule(DISCOVERY_INTERVAL_MS);
				return;
			}
			if (!page.nextPageToken) {
				throw new YoutubeChatError(
					"transient",
					"YouTube chat did not return a continuation cursor",
				);
			}
			for (const event of youtubePageMessages(page, this.initialPage)) {
				chatHub.publish(this.userId, event);
			}
			this.initialPage = false;
			this.pageToken = page.nextPageToken;
			this.retry = 0;
			chatHub.status(this.userId, "youtube", "connected");
			this.schedule(
				Math.max(1_000, Math.min(30_000, page.pollingIntervalMillis ?? 5_000)),
			);
		} catch (error) {
			if (!this.running) return;
			if (error instanceof YoutubeChatError && error.kind === "ended") {
				this.resetChat();
				chatHub.status(this.userId, "youtube", "connecting");
				this.schedule(DISCOVERY_INTERVAL_MS);
				return;
			}
			const message =
				error instanceof Error
					? error.message
					: "YouTube chat could not be started";
			if (error instanceof YoutubeChatError && error.kind === "permission") {
				chatHub.status(this.userId, "youtube", "error", message);
				return;
			}
			chatHub.status(this.userId, "youtube", "disconnected", message);
			const delay =
				RETRY_DELAYS[Math.min(this.retry, RETRY_DELAYS.length - 1)] ?? 20_000;
			this.retry += 1;
			this.schedule(delay);
		}
	}
}

class YoutubeConnectorManager {
	private readonly audienceCounts = new Map<string, number>();
	private readonly connectors = new Map<string, YoutubeConnector>();
	private readonly locks = new Map<string, AdvisoryLock>();
	private readonly pending = new Map<string, Promise<void>>();

	constructor() {
		chatHub.onAudienceChanged(
			(userId, count) =>
				void this.audienceChanged(userId, count).catch((error) =>
					chatHub.status(
						userId,
						"youtube",
						"error",
						error instanceof Error
							? error.message
							: "YouTube chat could not be started",
					),
				),
		);
		chatHub.onConnectorRefresh((userId) => void this.refresh(userId));
	}

	private async audienceChanged(userId: string, count: number) {
		this.audienceCounts.set(userId, count);
		if (count === 0) return this.stop(userId);
		await this.ensureStarted(userId);
	}

	private async refresh(userId: string) {
		await this.stop(userId);
		await this.pending.get(userId)?.catch(() => undefined);
		await this.stop(userId);
		await this.ensureStarted(userId).catch((error) =>
			chatHub.status(
				userId,
				"youtube",
				"error",
				error instanceof Error
					? error.message
					: "YouTube chat could not be started",
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
			.select({ id: account.accountId })
			.from(chatConnection)
			.innerJoin(
				account,
				and(
					eq(account.userId, chatConnection.userId),
					eq(account.providerId, "google"),
				),
			)
			.where(
				and(
					eq(chatConnection.userId, userId),
					eq(chatConnection.provider, "youtube"),
				),
			)
			.limit(1);
		if (!enabled || (this.audienceCounts.get(userId) ?? 0) === 0) return;
		const lock = await tryAdvisoryLock(`chat:youtube:${userId}`, () => {
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
		this.connectors.set(userId, new YoutubeConnector(userId));
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

export const youtubeConnectors = new YoutubeConnectorManager();
