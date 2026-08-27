import { randomUUID } from "node:crypto";
import { publishNotification, subscribeNotifications } from "../cache-bus";
import type {
	ChatLiveEvent,
	ChatProvider,
	ChatProviderStatus,
} from "./contract";

type Listener = (event: ChatLiveEvent) => void;
type AudienceListener = (userId: string, count: number) => void;
type ConnectorRefreshListener = (userId: string) => void;
type PublishedListener = (
	userId: string,
	event: ChatLiveEvent,
) => void | Promise<void>;
const CHAT_CHANNEL = "visp_chat";
const CHAT_REFRESH_CHANNEL = "visp_chat_refresh";
const MAX_NOTIFY_BYTES = 8_000;
const CHAT_INSTANCE_ID = randomUUID();
let fanoutStarted = false;

class ChatHub {
	private readonly audiences = new Set<AudienceListener>();
	private readonly connectorRefreshListeners =
		new Set<ConnectorRefreshListener>();
	private readonly listeners = new Map<string, Set<Listener>>();
	private readonly publishedListeners = new Set<PublishedListener>();
	private readonly statuses = new Map<
		string,
		Map<ChatProvider, ChatProviderStatus>
	>();

	onAudienceChanged(listener: AudienceListener) {
		this.audiences.add(listener);
		return () => this.audiences.delete(listener);
	}

	onConnectorRefresh(listener: ConnectorRefreshListener) {
		this.connectorRefreshListeners.add(listener);
		return () => this.connectorRefreshListeners.delete(listener);
	}

	requestConnectorRefresh(userId: string) {
		for (const listener of this.connectorRefreshListeners) listener(userId);
		if (!fanoutStarted) return;
		void publishNotification(
			CHAT_REFRESH_CHANNEL,
			JSON.stringify({ source: CHAT_INSTANCE_ID, userId }),
		).catch((error) => {
			console.error("Chat connector refresh fan-out failed", error);
		});
	}

	receiveRemoteRefresh(payload: string) {
		try {
			const decoded = JSON.parse(payload) as {
				source?: string;
				userId?: string;
			};
			if (!decoded.userId || decoded.source === CHAT_INSTANCE_ID) return;
			for (const listener of this.connectorRefreshListeners) {
				listener(decoded.userId);
			}
		} catch {
			// Ignore malformed notifications from the shared database channel.
		}
	}

	subscribe(userId: string, listener: Listener) {
		const listeners = this.listeners.get(userId) ?? new Set<Listener>();
		listeners.add(listener);
		this.listeners.set(userId, listeners);
		for (const status of this.statuses.get(userId)?.values() ?? []) {
			listener({ type: "status", status });
		}
		this.notifyAudience(userId, listeners.size);
		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) this.listeners.delete(userId);
			this.notifyAudience(userId, listeners.size);
			if (listeners.size === 0) this.statuses.delete(userId);
		};
	}

	publish(userId: string, event: ChatLiveEvent) {
		for (const listener of this.publishedListeners) {
			try {
				void Promise.resolve(listener(userId, event)).catch((error) =>
					console.error("Published chat listener failed", error),
				);
			} catch (error) {
				console.error("Published chat listener failed", error);
			}
		}
		this.publishLocal(userId, event);
		if (!fanoutStarted) return;
		const payload = JSON.stringify({
			event,
			source: CHAT_INSTANCE_ID,
			userId,
		});
		if (Buffer.byteLength(payload) >= MAX_NOTIFY_BYTES) return;
		void publishNotification(CHAT_CHANNEL, payload).catch((error) => {
			console.error("Chat fan-out publish failed", error);
		});
	}

	onPublished(listener: PublishedListener) {
		this.publishedListeners.add(listener);
		return () => this.publishedListeners.delete(listener);
	}

	receiveRemote(payload: string) {
		try {
			const decoded = JSON.parse(payload) as {
				event?: ChatLiveEvent;
				source?: string;
				userId?: string;
			};
			if (
				!decoded.userId ||
				!decoded.event ||
				decoded.source === CHAT_INSTANCE_ID
			)
				return;
			if (decoded.event.type === "status") {
				const statuses = this.statuses.get(decoded.userId) ?? new Map();
				statuses.set(decoded.event.status.provider, decoded.event.status);
				this.statuses.set(decoded.userId, statuses);
			}
			this.publishLocal(decoded.userId, decoded.event);
		} catch {
			// Ignore malformed notifications from the shared database channel.
		}
	}

	private publishLocal(userId: string, event: ChatLiveEvent) {
		for (const listener of this.listeners.get(userId) ?? []) listener(event);
	}

	status(
		userId: string,
		provider: ChatProvider,
		state: ChatProviderStatus["state"],
		error?: string,
	) {
		const statuses = this.statuses.get(userId) ?? new Map();
		const status = { provider, state, error } satisfies ChatProviderStatus;
		statuses.set(provider, status);
		this.statuses.set(userId, statuses);
		this.publish(userId, { type: "status", status });
	}

	private notifyAudience(userId: string, count: number) {
		for (const listener of this.audiences) listener(userId, count);
	}
}

export const chatHub = new ChatHub();

export function startChatFanout() {
	fanoutStarted = true;
	const stopChat = subscribeNotifications(CHAT_CHANNEL, (payload) =>
		chatHub.receiveRemote(payload),
	);
	const stopRefresh = subscribeNotifications(CHAT_REFRESH_CHANNEL, (payload) =>
		chatHub.receiveRemoteRefresh(payload),
	);
	return () => {
		stopChat();
		stopRefresh();
	};
}
