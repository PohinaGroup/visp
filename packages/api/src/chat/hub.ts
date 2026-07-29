import { randomUUID } from "node:crypto";
import { publishNotification, subscribeNotifications } from "../cache-bus";
import type {
	ChatLiveEvent,
	ChatProvider,
	ChatProviderStatus,
} from "./contract";

type Listener = (event: ChatLiveEvent) => void;
type AudienceListener = (userId: string, count: number) => void;
const CHAT_CHANNEL = "visp_chat";
const MAX_NOTIFY_BYTES = 8_000;
const CHAT_INSTANCE_ID = randomUUID();
let fanoutStarted = false;

class ChatHub {
	private readonly audiences = new Set<AudienceListener>();
	private readonly listeners = new Map<string, Set<Listener>>();
	private readonly statuses = new Map<
		string,
		Map<ChatProvider, ChatProviderStatus>
	>();

	onAudienceChanged(listener: AudienceListener) {
		this.audiences.add(listener);
		return () => this.audiences.delete(listener);
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
	) {
		const statuses = this.statuses.get(userId) ?? new Map();
		const status = { provider, state } satisfies ChatProviderStatus;
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
	return subscribeNotifications(CHAT_CHANNEL, (payload) =>
		chatHub.receiveRemote(payload),
	);
}
