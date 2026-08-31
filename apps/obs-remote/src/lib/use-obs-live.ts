import { useNetworkState } from "expo-network";
import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { apiClient } from "./backend";
import {
	COMMAND_TIMEOUT_MS,
	commandAwaitingObs,
	commandTimedOut,
	expireConnection,
	type ObsStatus,
	type PendingCommandWatch,
	parseObsStatus,
	parseStatusFrame,
	pendingCommandWatch,
	reconnectDelay,
} from "./obs-live";

function socketUrl(ticket: string): string {
	const server = process.env.EXPO_PUBLIC_SERVER_URL?.replace(/\/$/, "");
	if (!server) throw new Error("EXPO_PUBLIC_SERVER_URL is not configured");
	const url = new URL("/api/obs/live", server);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("ticket", ticket);
	return url.toString();
}

export type ObsLiveState =
	| "idle"
	| "connecting"
	| "open"
	| "reconnecting"
	| "offline";

export function useObsLive(userId: string | undefined) {
	const currentUserId = useRef(userId);
	currentUserId.current = userId;
	const network = useNetworkState();
	const [appState, setAppState] = useState<AppStateStatus>(
		AppState.currentState,
	);
	const [error, setError] = useState<string>();
	const [liveState, setLiveState] = useState<ObsLiveState>("idle");
	const [status, setStatus] = useState<ObsStatus>();
	const [pendingWatch, setPendingWatch] = useState<PendingCommandWatch | null>(
		null,
	);
	const [now, setNow] = useState(() => Date.now());
	const active =
		Boolean(userId) && appState === "active" && network.isConnected === true;

	useEffect(() => {
		const subscription = AppState.addEventListener("change", setAppState);
		return () => subscription.remove();
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: account changes must discard the previous account's OBS state.
	useEffect(() => {
		setStatus(undefined);
		setError(undefined);
		setLiveState("idle");
		setPendingWatch(null);
	}, [userId]);

	useEffect(() => {
		if (!active) {
			if (userId && appState === "active") setLiveState("offline");
			return;
		}

		let disposed = false;
		let attempt = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let socket: WebSocket | undefined;
		const reconnect = () => {
			if (disposed) return;
			setLiveState("reconnecting");
			timer = setTimeout(connect, reconnectDelay(attempt++));
		};
		const connect = async () => {
			setLiveState(attempt ? "reconnecting" : "connecting");
			try {
				const { ticket } = await apiClient.obs.liveTicket.mutate();
				if (disposed) return;
				const currentSocket = new WebSocket(socketUrl(ticket));
				socket = currentSocket;
				currentSocket.onopen = () => {
					if (disposed) return;
					attempt = 0;
					setError(undefined);
					setLiveState("open");
				};
				currentSocket.onmessage = ({ data }) => {
					if (disposed) return;
					const next = parseStatusFrame(data);
					if (next) setStatus(next);
				};
				currentSocket.onerror = () => currentSocket.close();
				currentSocket.onclose = () => {
					if (!disposed) reconnect();
				};
			} catch (cause) {
				if (disposed) return;
				setError(
					cause instanceof Error ? cause.message : "Could not connect to VISP",
				);
				reconnect();
			}
		};

		void connect();
		return () => {
			disposed = true;
			clearTimeout(timer);
			socket?.close();
		};
	}, [active, appState, userId]);

	useEffect(() => {
		if (!status?.connected || !status.connectedUntil) return;
		const remaining = Date.parse(status.connectedUntil) - Date.now();
		if (remaining <= 0) {
			setStatus((current) => (current ? expireConnection(current) : current));
			return;
		}
		const timer = setTimeout(
			() =>
				setStatus((current) => (current ? expireConnection(current) : current)),
			Math.min(remaining + 25, 2_147_483_647),
		);
		return () => clearTimeout(timer);
	}, [status?.connected, status?.connectedUntil]);

	useEffect(() => {
		setPendingWatch((previous) => pendingCommandWatch(status, previous));
	}, [status]);

	useEffect(() => {
		if (!pendingWatch || !status?.pending) return;
		const remaining =
			COMMAND_TIMEOUT_MS - (Date.now() - pendingWatch.startedAt);
		if (remaining <= 0) {
			setNow(Date.now());
			return;
		}
		const timer = setTimeout(() => setNow(Date.now()), remaining + 25);
		return () => clearTimeout(timer);
	}, [pendingWatch, status?.pending]);

	const awaitingCommand = commandAwaitingObs(status, pendingWatch, now);
	const timedOutCommand = commandTimedOut(status, pendingWatch, now);

	return {
		error,
		liveState,
		status,
		awaitingCommand,
		timedOutCommand,
		acceptStatus(value: unknown, expectedUserId = userId) {
			if (!expectedUserId || currentUserId.current !== expectedUserId)
				return false;
			const next = parseObsStatus(value);
			if (next) setStatus(next);
			return Boolean(next);
		},
		clearError: () => setError(undefined),
		setError,
	};
}
