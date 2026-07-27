export type ObsStatus = {
	configured: boolean;
	connected: boolean;
	connectedUntil: string | null;
	streaming: boolean;
	desiredStreaming: boolean;
	recording: boolean;
	virtualCam: boolean;
	replayBuffer: boolean;
	recordPaused: boolean;
	scenes: string[];
	currentScene: string | null;
	desiredScene: string | null;
	pending: boolean;
	lastSeenAt: string | null;
	commandVersion: number;
	appliedVersion: number;
};

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
	return value === null || typeof value === "string";
}

// Toggle actuals are optional so an older server (pre-Phase-1) still parses.
function optionalBool(value: unknown): value is boolean | undefined {
	return value === undefined || typeof value === "boolean";
}

function timestamp(value: unknown): value is string | null {
	return (
		value === null ||
		(typeof value === "string" && Number.isFinite(Date.parse(value)))
	);
}

export function parseObsStatus(value: unknown): ObsStatus | null {
	if (
		!record(value) ||
		typeof value.configured !== "boolean" ||
		typeof value.connected !== "boolean" ||
		!timestamp(value.connectedUntil) ||
		typeof value.streaming !== "boolean" ||
		typeof value.desiredStreaming !== "boolean" ||
		!optionalBool(value.recording) ||
		!optionalBool(value.virtualCam) ||
		!optionalBool(value.replayBuffer) ||
		!optionalBool(value.recordPaused) ||
		!Array.isArray(value.scenes) ||
		!value.scenes.every((scene) => typeof scene === "string") ||
		!nullableString(value.currentScene) ||
		!nullableString(value.desiredScene) ||
		typeof value.pending !== "boolean" ||
		!timestamp(value.lastSeenAt) ||
		!Number.isSafeInteger(value.commandVersion) ||
		!Number.isSafeInteger(value.appliedVersion)
	)
		return null;

	return {
		...value,
		recording: value.recording ?? false,
		virtualCam: value.virtualCam ?? false,
		replayBuffer: value.replayBuffer ?? false,
		recordPaused: value.recordPaused ?? false,
	} as ObsStatus;
}

export function parseStatusFrame(value: unknown): ObsStatus | null {
	if (typeof value !== "string") return null;
	try {
		const frame: unknown = JSON.parse(value);
		return record(frame) && frame.type === "status"
			? parseObsStatus(frame.status)
			: null;
	} catch {
		return null;
	}
}

export function expireConnection(
	status: ObsStatus,
	now = Date.now(),
): ObsStatus {
	return status.connected &&
		status.connectedUntil !== null &&
		Date.parse(status.connectedUntil) <= now
		? { ...status, connected: false }
		: status;
}

/** How long the remote UI waits for OBS to acknowledge a command. */
export const COMMAND_TIMEOUT_MS = 15_000;

export type PendingCommandWatch = {
	commandVersion: number;
	startedAt: number;
};

export function pendingCommandWatch(
	status: ObsStatus | undefined,
	previous: PendingCommandWatch | null,
	now = Date.now(),
): PendingCommandWatch | null {
	if (!status?.pending) return null;
	if (previous?.commandVersion === status.commandVersion) return previous;
	return { commandVersion: status.commandVersion, startedAt: now };
}

export function commandAwaitingObs(
	status: ObsStatus | undefined,
	watch: PendingCommandWatch | null,
	now = Date.now(),
): boolean {
	return Boolean(
		status?.pending &&
			watch &&
			watch.commandVersion === status.commandVersion &&
			now - watch.startedAt < COMMAND_TIMEOUT_MS,
	);
}

export function commandTimedOut(
	status: ObsStatus | undefined,
	watch: PendingCommandWatch | null,
	now = Date.now(),
): boolean {
	return Boolean(
		status?.pending &&
			watch &&
			watch.commandVersion === status.commandVersion &&
			now - watch.startedAt >= COMMAND_TIMEOUT_MS,
	);
}

export function reconnectDelay(attempt: number): number {
	return Math.min(15_000, 500 * 2 ** Math.min(Math.max(0, attempt), 5));
}
