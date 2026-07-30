import type {
	ChatLiveEvent,
	ChatMessage,
	ChatProviderStatus,
} from "@VISP/api/chat/contract";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "./backend";
import { visibleChatMessages } from "./chat-model";

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
	disappearingMessages: boolean,
	/**
	 * Every arriving message, before the render state below drops all but the
	 * last three. Read-aloud needs the full stream, so it cannot use the
	 * returned arrays.
	 */
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
	const [now, setNow] = useState(Date.now());

	useEffect(() => {
		if (!active || !userId) {
			// #region agent log
			fetch('http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24a310'},body:JSON.stringify({sessionId:'24a310',location:'live-chat.ts:inactive',message:'chat hook inactive',data:{active,hasUserId:Boolean(userId)},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
			// #endregion
			setMessages([]);
			setStatuses({});
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
				// #region agent log
				fetch('http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24a310'},body:JSON.stringify({sessionId:'24a310',location:'live-chat.ts:ticket',message:'live ticket obtained',data:{retry,wsHost:new URL(url).host},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
				// #endregion
				socket = new WebSocket(url);
				socket.onopen = () => {
					retry = 0;
					// #region agent log
					fetch('http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24a310'},body:JSON.stringify({sessionId:'24a310',location:'live-chat.ts:open',message:'websocket open',data:{},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
					// #endregion
				};
				socket.onmessage = ({ data }) => {
					if (typeof data !== "string") return;
					try {
						const event: unknown = JSON.parse(data);
						if (!liveEvent(event)) return;
						if (event.type === "status") {
							// #region agent log
							fetch('http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24a310'},body:JSON.stringify({sessionId:'24a310',location:'live-chat.ts:status',message:'provider status',data:{provider:event.status.provider,state:event.status.state},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
							// #endregion
							setStatuses((current) => ({
								...current,
								[event.status.provider]: event.status.state,
							}));
							return;
						}
						const receivedAt = Date.now();
						// #region agent log
						fetch('http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24a310'},body:JSON.stringify({sessionId:'24a310',location:'live-chat.ts:message',message:'chat message received',data:{provider:event.message.provider,id:event.message.id,sender:event.message.sender.name},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
						// #endregion
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
				socket.onclose = (closeEvent) => {
					if (disposed) return;
					// #region agent log
					fetch('http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24a310'},body:JSON.stringify({sessionId:'24a310',location:'live-chat.ts:close',message:'websocket closed',data:{code:closeEvent.code,reason:closeEvent.reason,retry},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
					// #endregion
					setStatuses({});
					const delay = Math.min(15_000, 1_000 * 2 ** Math.min(retry, 4));
					retry += 1;
					reconnectTimer = setTimeout(() => void connect(), delay);
				};
			} catch (error) {
				// #region agent log
				fetch('http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24a310'},body:JSON.stringify({sessionId:'24a310',location:'live-chat.ts:connect-error',message:'connect failed',data:{error:error instanceof Error?error.message:'unknown'},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
				// #endregion
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

	useEffect(() => {
		if (!active || !disappearingMessages) return;
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(timer);
	}, [active, disappearingMessages]);

	const visible = visibleChatMessages(messages, disappearingMessages, now);
	// #region agent log
	useEffect(() => {
		fetch('http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'24a310'},body:JSON.stringify({sessionId:'24a310',location:'live-chat.ts:visible',message:'visible messages snapshot',data:{rawCount:messages.length,visibleCount:visible.length,disappearingMessages,statuses},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
	}, [messages.length, visible.length, disappearingMessages, statuses]);
	// #endregion

	return {
		messages: visible,
		recentMessages: messages,
		statuses,
	};
}
