/**
 * One EventSub WebSocket per process for every multichat Twitch source.
 *
 * Multichat reads public channels through the single VISP bot token, and
 * Twitch allows only 3 WebSocket sessions with enabled subscriptions per
 * (client id, user token), each holding up to 300 subscriptions. A socket per
 * source therefore broke the fourth overlay; one shared session with a
 * refcounted `channel.chat.message` subscription per broadcaster does not.
 */

export const TWITCH_EVENTSUB_URL =
	"wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
const RETRY_DELAYS = [1_000, 2_000, 5_000, 10_000, 20_000];

export type EventSubStatus =
	| "connecting"
	| "connected"
	| "disconnected"
	| "error";

export type EventSubListener = {
	onMessage: (event: Record<string, unknown>, sentAt?: string) => void;
	onStatus: (state: EventSubStatus, error?: string) => void;
};

/** The subset of WebSocket this module uses, so tests can drive it. */
export type EventSubSocket = {
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: (() => void) | null;
	onerror: (() => void) | null;
	close: () => void;
};

export type EventSubDependencies = {
	connect: (url: string) => EventSubSocket;
	/** Creates the subscription on `sessionId` and returns its id. */
	subscribe: (broadcasterId: string, sessionId: string) => Promise<string>;
	unsubscribe: (subscriptionId: string) => Promise<void>;
};

type Envelope = {
	metadata?: {
		message_type?: string;
		message_timestamp?: string;
		subscription_type?: string;
	};
	payload?: {
		event?: Record<string, unknown>;
		session?: {
			id?: string;
			reconnect_url?: string | null;
			keepalive_timeout_seconds?: number | null;
		};
		subscription?: {
			id?: string;
			status?: string;
			condition?: { broadcaster_user_id?: string };
		};
	};
};

type Entry = {
	listeners: Set<EventSubListener>;
	subscriptionId?: string;
	/** Session generation `subscriptionId` belongs to. */
	generation?: number;
	/** Generation a create call is in flight for. */
	subscribing?: number;
	retry: number;
	retryTimer?: ReturnType<typeof setTimeout>;
};

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Could not connect to chat";
}

export class SharedTwitchEventSub {
	private readonly entries = new Map<string, Entry>();
	private socket?: EventSubSocket;
	/** The reconnect_url socket until its welcome arrives. */
	private handoff?: EventSubSocket;
	private sessionId?: string;
	/**
	 * Bumped whenever subscriptions are lost (a fresh session). A reconnect
	 * handoff keeps it: Twitch moves the subscriptions to the new socket.
	 */
	private generation = 0;
	private retry = 0;
	private reconnectTimer?: ReturnType<typeof setTimeout>;
	private keepaliveTimer?: ReturnType<typeof setTimeout>;

	constructor(private readonly deps: EventSubDependencies) {}

	/** Starts listening to `broadcasterId`; the returned function stops it. */
	add(broadcasterId: string, listener: EventSubListener) {
		let entry = this.entries.get(broadcasterId);
		if (!entry) {
			entry = { listeners: new Set(), retry: 0 };
			this.entries.set(broadcasterId, entry);
		}
		entry.listeners.add(listener);
		if (this.sessionId && entry.generation === this.generation) {
			listener.onStatus("connected");
		} else {
			listener.onStatus("connecting");
			if (this.sessionId) void this.subscribeEntry(broadcasterId, entry);
		}
		this.ensureSocket();
		let released = false;
		return () => {
			if (released) return;
			released = true;
			this.remove(broadcasterId, listener);
		};
	}

	/** Broadcasters with at least one listener, for tests and diagnostics. */
	get size() {
		return this.entries.size;
	}

	private remove(broadcasterId: string, listener: EventSubListener) {
		const entry = this.entries.get(broadcasterId);
		if (!entry) return;
		entry.listeners.delete(listener);
		if (entry.listeners.size > 0) return;
		this.entries.delete(broadcasterId);
		clearTimeout(entry.retryTimer);
		// A subscription on a live session keeps counting toward the 300 cap.
		if (entry.subscriptionId && entry.generation === this.generation) {
			void this.deps.unsubscribe(entry.subscriptionId).catch(() => undefined);
		}
		if (this.entries.size === 0) this.shutdown();
	}

	private shutdown() {
		const socket = this.socket;
		const handoff = this.handoff;
		this.socket = undefined;
		this.handoff = undefined;
		this.sessionId = undefined;
		this.generation += 1;
		this.retry = 0;
		clearTimeout(this.reconnectTimer);
		this.reconnectTimer = undefined;
		clearTimeout(this.keepaliveTimer);
		socket?.close();
		handoff?.close();
	}

	private ensureSocket() {
		if (this.socket || this.reconnectTimer || this.entries.size === 0) return;
		this.open(TWITCH_EVENTSUB_URL, false);
	}

	private open(url: string, isHandoff: boolean) {
		let socket: EventSubSocket;
		try {
			socket = this.deps.connect(url);
		} catch {
			if (!isHandoff) this.lost();
			return;
		}
		if (isHandoff) {
			this.handoff?.close();
			this.handoff = socket;
		} else {
			this.socket = socket;
		}
		socket.onerror = () => socket.close();
		socket.onclose = () => {
			if (socket === this.socket) this.lost();
			else if (socket === this.handoff) this.handoff = undefined;
		};
		socket.onmessage = ({ data }) => {
			if (typeof data === "string") this.handle(socket, data);
		};
	}

	private handle(socket: EventSubSocket, raw: string) {
		if (socket !== this.socket && socket !== this.handoff) return;
		let envelope: Envelope;
		try {
			envelope = JSON.parse(raw) as Envelope;
		} catch {
			return;
		}
		const type = envelope.metadata?.message_type;
		if (type === "session_welcome") {
			const sessionId = envelope.payload?.session?.id;
			if (!sessionId) return;
			if (socket === this.handoff) {
				// Subscriptions moved with the session; only the socket changes.
				const old = this.socket;
				this.socket = socket;
				this.handoff = undefined;
				this.sessionId = sessionId;
				this.resetKeepalive(
					envelope.payload?.session?.keepalive_timeout_seconds,
				);
				old?.close();
				return;
			}
			this.sessionId = sessionId;
			this.resetKeepalive(envelope.payload?.session?.keepalive_timeout_seconds);
			for (const [broadcasterId, entry] of this.entries) {
				void this.subscribeEntry(broadcasterId, entry);
			}
			return;
		}
		if (socket === this.socket) this.resetKeepalive();
		if (type === "session_reconnect") {
			const reconnectUrl = envelope.payload?.session?.reconnect_url;
			if (
				socket === this.socket &&
				reconnectUrl?.startsWith("wss://eventsub.wss.twitch.tv/")
			) {
				this.open(reconnectUrl, true);
			}
			return;
		}
		if (type === "revocation") {
			const broadcasterId =
				envelope.payload?.subscription?.condition?.broadcaster_user_id;
			const entry = broadcasterId ? this.entries.get(broadcasterId) : undefined;
			if (!entry || entry.subscriptionId !== envelope.payload?.subscription?.id)
				return;
			entry.subscriptionId = undefined;
			entry.generation = undefined;
			const reason = envelope.payload?.subscription?.status;
			for (const listener of entry.listeners) {
				listener.onStatus(
					"error",
					reason
						? `Twitch chat revoked: ${reason.replaceAll("_", " ")}`
						: "Twitch revoked the chat subscription",
				);
			}
			return;
		}
		if (
			type !== "notification" ||
			envelope.metadata?.subscription_type !== "channel.chat.message"
		)
			return;
		const event = envelope.payload?.event;
		const broadcasterId = event?.broadcaster_user_id;
		if (!event || typeof broadcasterId !== "string") return;
		for (const listener of this.entries.get(broadcasterId)?.listeners ?? []) {
			listener.onMessage(event, envelope.metadata?.message_timestamp);
		}
	}

	private async subscribeEntry(broadcasterId: string, entry: Entry) {
		const generation = this.generation;
		const sessionId = this.sessionId;
		if (
			!sessionId ||
			entry.generation === generation ||
			entry.subscribing === generation
		)
			return;
		clearTimeout(entry.retryTimer);
		entry.retryTimer = undefined;
		entry.subscribing = generation;
		try {
			const subscriptionId = await this.deps.subscribe(
				broadcasterId,
				sessionId,
			);
			if (generation !== this.generation) return; // Session died meanwhile.
			if (this.entries.get(broadcasterId) !== entry) {
				// Every listener left while the create was in flight.
				void this.deps.unsubscribe(subscriptionId).catch(() => undefined);
				return;
			}
			entry.subscribing = undefined;
			entry.subscriptionId = subscriptionId;
			entry.generation = generation;
			entry.retry = 0;
			// A session is only good once something subscribed on it.
			this.retry = 0;
			for (const listener of entry.listeners) listener.onStatus("connected");
		} catch (error) {
			if (generation !== this.generation) return;
			if (this.entries.get(broadcasterId) !== entry) return;
			entry.subscribing = undefined;
			for (const listener of entry.listeners) {
				listener.onStatus("error", errorMessage(error));
			}
			// A session nothing subscribed on (dead bot token, session cap) is one
			// Twitch closes in 10 s anyway: drop it now and let the session
			// backoff grow, instead of per-entry retries racing that close.
			if (!this.anySubscribed(generation)) {
				this.socket?.close();
				return;
			}
			// Retry this broadcaster only; the shared socket stays up for the rest.
			const delay =
				RETRY_DELAYS[Math.min(entry.retry, RETRY_DELAYS.length - 1)];
			entry.retry += 1;
			entry.retryTimer = setTimeout(() => {
				entry.retryTimer = undefined;
				if (this.entries.get(broadcasterId) === entry)
					void this.subscribeEntry(broadcasterId, entry);
			}, delay);
		}
	}

	private anySubscribed(generation: number) {
		for (const entry of this.entries.values()) {
			if (entry.generation === generation || entry.subscribing === generation)
				return true;
		}
		return false;
	}

	private resetKeepalive(seconds?: number | null) {
		clearTimeout(this.keepaliveTimer);
		const timeout = Math.max(10, seconds ?? 30) * 1000 + 5_000;
		const socket = this.socket;
		this.keepaliveTimer = setTimeout(() => {
			if (socket === this.socket) socket?.close();
		}, timeout);
	}

	/** The session is gone and every subscription on it with it. */
	private lost() {
		const handoff = this.handoff;
		this.socket = undefined;
		this.handoff = undefined;
		this.sessionId = undefined;
		this.generation += 1;
		clearTimeout(this.keepaliveTimer);
		handoff?.close();
		for (const entry of this.entries.values()) {
			entry.subscriptionId = undefined;
			entry.generation = undefined;
			entry.subscribing = undefined;
			clearTimeout(entry.retryTimer);
			entry.retryTimer = undefined;
			for (const listener of entry.listeners) listener.onStatus("disconnected");
		}
		if (this.entries.size === 0 || this.reconnectTimer) return;
		const delay = RETRY_DELAYS[Math.min(this.retry, RETRY_DELAYS.length - 1)];
		this.retry += 1;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined;
			this.ensureSocket();
		}, delay);
	}
}
