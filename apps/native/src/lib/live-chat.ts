import type {
	ChatLiveEvent,
	ChatMessage,
	ChatProviderStatus,
} from "@VISP/api/chat/contract";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "./backend";

export type { VisibleChatMessage } from "./chat-model";

function socketUrl(ticket: string) {
	const server = process.env.EXPO_PUBLIC_SERVER_URL?.replace(/\/$/, "");
	if (!server) throw new Error("EXPO_PUBLIC_SERVER_URL is not configured");
	const url = new URL("/api/chat/live", server);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("ticket", ticket);
	return url.toString();
}

function liveEvent(value: unknown): value is ChatLiveEvent {
	return Boolean(value && typeof value === "object" && "type" in value);
}

export function useLiveChat(
	userId: string | undefined,
	active: boolean,
	onMessage?: (message: ChatMessage) => void,
) {
	const onMessageRef = useRef(onMessage);
	useEffect(() => {
		onMessageRef.current = onMessage;
	});
	const [messages, setMessages] = useState<
		Array<ChatMessage & { receivedAt: number }>
	>([]);
	const [statuses, setStatuses] = useState<
		Partial<Record<"twitch" | "kick", ChatProviderStatus["state"]>>
	>({});
	const [errors, setErrors] = useState<
		Partial<Record<"twitch" | "kick", string>>
	>({});

	useEffect(() => {
		if (!active || !userId) {
			setMessages([]);
			setStatuses({});
			setErrors({});
			return;
		}
		let disposed = false;
		let retry = 0;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
		let socket: WebSocket | undefined;

		const connect = async () => {
			setMessages([]);
			try {
				const { ticket } = await apiClient.chat.liveTicket.mutate();
				if (disposed) return;
				const url = socketUrl(ticket);
				socket = new WebSocket(url);
				socket.onopen = () => {
					retry = 0;
				};
				socket.onmessage = ({ data }) => {
					if (typeof data !== "string") return;
					try {
						const event: unknown = JSON.parse(data);
						if (!liveEvent(event)) return;
						if (event.type === "status") {
							setStatuses((current) => ({
								...current,
								[event.status.provider]: event.status.state,
							}));
							setErrors((current) => ({
								...(event.status.state === "connected"
									? { ...current, [event.status.provider]: undefined }
									: event.status.state === "error"
										? {
												...current,
												[event.status.provider]:
													event.status.error ??
													(event.status.provider === "twitch"
														? "Twitch chat could not be started"
														: "Kick chat could not be started"),
											}
										: event.status.error
											? {
													...current,
													[event.status.provider]: event.status.error,
												}
											: current),
							}));
							return;
						}
						const receivedAt = Date.now();
						onMessageRef.current?.(event.message);
						setMessages((current) =>
							[
								...current.filter(
									(message) =>
										message.id !== event.message.id ||
										message.provider !== event.message.provider,
								),
								{ ...event.message, receivedAt },
							].slice(-3),
						);
					} catch {
						// Invalid chat frames are ignored and never affect the media stream.
					}
				};
				socket.onclose = () => {
					if (disposed) return;
					setStatuses({});
					setErrors({});
					const delay = Math.min(15_000, 1_000 * 2 ** Math.min(retry, 4));
					retry += 1;
					reconnectTimer = setTimeout(() => void connect(), delay);
				};
			} catch {
				if (!disposed) reconnectTimer = setTimeout(() => void connect(), 5_000);
			}
		};

		void connect();
		return () => {
			disposed = true;
			clearTimeout(reconnectTimer);
			socket?.close();
		};
	}, [active, userId]);

	return {
		errors,
		messages,
		recentMessages: messages,
		statuses,
	};
}
