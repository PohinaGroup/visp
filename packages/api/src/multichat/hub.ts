import type {
	MultiChatEvent,
	MultiChatProvider,
	MultiChatStatus,
} from "./contract";

type Listener = (event: MultiChatEvent) => void;
type AudienceListener = (userId: string, count: number) => void;
type RefreshListener = (userId: string) => void;

class MultiChatHub {
	private readonly listeners = new Map<string, Set<Listener>>();
	private readonly statuses = new Map<
		string,
		Map<MultiChatProvider, MultiChatStatus>
	>();
	private readonly audiences = new Set<AudienceListener>();
	private readonly refreshListeners = new Set<RefreshListener>();
	private readonly revokeListeners = new Set<(userId: string) => void>();

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
		};
	}

	publish(userId: string, event: MultiChatEvent) {
		for (const listener of this.listeners.get(userId) ?? []) listener(event);
	}

	status(
		userId: string,
		provider: MultiChatProvider,
		state: MultiChatStatus["state"],
		error?: string,
	) {
		const statuses = this.statuses.get(userId) ?? new Map();
		const status = { provider, state, error } satisfies MultiChatStatus;
		statuses.set(provider, status);
		this.statuses.set(userId, statuses);
		this.publish(userId, { type: "status", status });
	}

	onAudienceChanged(listener: AudienceListener) {
		this.audiences.add(listener);
		return () => this.audiences.delete(listener);
	}

	requestRefresh(userId: string) {
		for (const listener of this.refreshListeners) listener(userId);
	}

	onRefresh(listener: RefreshListener) {
		this.refreshListeners.add(listener);
		return () => this.refreshListeners.delete(listener);
	}

	revoke(userId: string) {
		for (const listener of this.revokeListeners) listener(userId);
	}

	onRevoked(listener: (userId: string) => void) {
		this.revokeListeners.add(listener);
		return () => this.revokeListeners.delete(listener);
	}

	private notifyAudience(userId: string, count: number) {
		for (const listener of this.audiences) listener(userId, count);
	}
}

export const multiChatHub = new MultiChatHub();
