import { LiveTicketStore } from "./live-tickets";

export type ObsStatus = {
	configured: boolean;
	connected: boolean;
	connectedUntil: string | null;
	streaming: boolean;
	desiredStreaming: boolean;
	scenes: string[];
	currentScene: string | null;
	desiredScene: string | null;
	pending: boolean;
	lastSeenAt: string | null;
	commandVersion: number;
	appliedVersion: number;
};

export type ObsCommand = Pick<
	ObsStatus,
	"commandVersion" | "desiredStreaming" | "desiredScene"
>;

export type ObsStateReport = Pick<
	ObsStatus,
	"appliedVersion" | "streaming" | "scenes" | "currentScene"
>;

export type ObsLivePeer =
	| { role: "user"; userId: string }
	| { role: "machine"; userId: string; tokenId: string };

type StatusListener = (status: ObsStatus) => void;
type CommandListener = (command: ObsCommand, tokenId: string) => void;

export class ObsLiveHub {
	private readonly statusListeners = new Map<string, Set<StatusListener>>();
	private readonly commandListeners = new Map<string, Set<CommandListener>>();

	subscribeStatus(userId: string, listener: StatusListener) {
		return this.subscribe(this.statusListeners, userId, listener);
	}

	subscribeCommands(userId: string, listener: CommandListener) {
		return this.subscribe(this.commandListeners, userId, listener);
	}

	publishStatus(userId: string, status: ObsStatus) {
		for (const listener of this.statusListeners.get(userId) ?? [])
			listener(status);
	}

	publishCommand(userId: string, tokenId: string, command: ObsCommand) {
		for (const listener of this.commandListeners.get(userId) ?? []) {
			listener(command, tokenId);
		}
	}

	private subscribe<Args extends unknown[]>(
		listenersByUser: Map<string, Set<(...args: Args) => void>>,
		userId: string,
		listener: (...args: Args) => void,
	) {
		const listeners = listenersByUser.get(userId) ?? new Set();
		listeners.add(listener);
		listenersByUser.set(userId, listeners);
		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) listenersByUser.delete(userId);
		};
	}
}

export const obsLiveHub = new ObsLiveHub();
export const obsLiveTickets = new LiveTicketStore<ObsLivePeer>((peer) =>
	peer.role === "user" ? `user:${peer.userId}` : `machine:${peer.userId}`,
);
