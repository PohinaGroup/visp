import {
	BADGE_CHIP_COLOR,
	type ChatBadge,
	type ChatFragment,
	type ChatLiveEvent,
	type ChatMessage,
	type ChatProvider,
	type ChatProviderStatus,
	PROVIDER_CHIP,
	PROVIDER_PRESENTATION,
} from "@VISP/api/chat/contract";
import { env } from "@VISP/env/web";
import { createFileRoute } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { z } from "zod";

/**
 * OBS Browser Source twin of the native floating chat
 * (apps/native/src/components/floating-chat.tsx).
 *
 * ponytail: plain elements and inline styles instead of Astryx. This is a
 * pixel port of a React Native component onto a page that must composite
 * transparently in OBS — a design-system Card would fight both the exact
 * rgba/radius values and the transparent background.
 */

/** Matches FADE_WINDOW_MS in apps/native/src/lib/chat-model.ts. */
const FADE_WINDOW_MS = 12_000;
const CORNERS = [
	"bottom-left",
	"bottom-right",
	"top-left",
	"top-right",
] as const;

/**
 * Everything is optional and `.catch`es back to undefined so a typo in the OBS
 * URL degrades to the default instead of an error boundary on stream. Defaults
 * are applied in the component, not here: a `.default()` rewrites the search
 * params and costs a 307 redirect on every browser-source load.
 */
export const Route = createFileRoute("/overlay")({
	ssr: false,
	validateSearch: z.object({
		t: z.string().optional(),
		corner: z.enum(CORNERS).optional().catch(undefined),
		rows: z.coerce.number().int().min(1).max(20).optional().catch(undefined),
		// Not z.coerce.boolean(): it maps the strings "0" and "false" to true.
		fade: z.unknown().optional(),
		debug: z.unknown().optional(),
	}),
	component: ChatOverlay,
});

function isTruthy(value: unknown) {
	return value === true || value === "1" || value === "true";
}

type BufferedMessage = ChatMessage & { key: string; receivedAt: number };

function serverUrl() {
	return import.meta.env.PROD
		? window.location.origin
		: env.VITE_SERVER_URL.replace(/\/$/, "");
}

function socketUrl(ticket: string) {
	const url = new URL("/api/chat/live", serverUrl());
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("ticket", ticket);
	return url.toString();
}

async function mintTicket(token: string) {
	const response = await fetch(`${serverUrl()}/api/chat/overlay/ticket`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ token }),
	});
	if (response.status === 401) throw new Error("revoked");
	if (!response.ok) throw new Error("unavailable");
	const { ticket } = (await response.json()) as { ticket: string };
	return ticket;
}

/**
 * Mints a ticket, opens the socket, and reconnects with the same backoff the
 * native and obs-remote clients use.
 */
function useOverlayChat(token: string | undefined, rows: number) {
	const [messages, setMessages] = useState<BufferedMessage[]>([]);
	const [phase, setPhase] = useState<
		"connecting" | "live" | "retrying" | "revoked"
	>("connecting");
	const [retryCount, setRetryCount] = useState(0);
	const [statuses, setStatuses] = useState<
		Partial<Record<ChatProvider, ChatProviderStatus>>
	>({});
	const [mintFailure, setMintFailure] = useState<
		"revoked" | "unavailable" | undefined
	>();

	useEffect(() => {
		if (!token) return;
		let disposed = false;
		let socket: WebSocket | undefined;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
		let retry = 0;

		const reconnect = () => {
			if (disposed) return;
			setPhase("retrying");
			const delay = Math.min(15_000, 1_000 * 2 ** Math.min(retry, 4));
			retry += 1;
			setRetryCount(retry);
			reconnectTimer = setTimeout(() => void connect(), delay);
		};

		const connect = async () => {
			if (disposed) return;
			setPhase("connecting");
			let ticket: string;
			try {
				ticket = await mintTicket(token);
			} catch (error) {
				// A revoked token never recovers on its own; stop hammering the API.
				if (error instanceof Error && error.message === "revoked") {
					if (!disposed) {
						setMintFailure("revoked");
						setPhase("revoked");
					}
					return;
				}
				setMintFailure("unavailable");
				reconnect();
				return;
			}
			if (disposed) return;
			setMintFailure(undefined);
			socket = new WebSocket(socketUrl(ticket));
			socket.onopen = () => {
				retry = 0;
				setRetryCount(0);
				setPhase("live");
			};
			socket.onerror = () => socket?.close();
			socket.onclose = reconnect;
			socket.onmessage = ({ data }) => {
				if (typeof data !== "string") return;
				let event: ChatLiveEvent;
				try {
					event = JSON.parse(data) as ChatLiveEvent;
				} catch {
					return;
				}
				if (event.type === "status") {
					setStatuses((current) => ({
						...current,
						[event.status.provider]: event.status,
					}));
					return;
				}
				const message = event.message;
				const key = `${message.provider}-${message.id}`;
				setMessages((current) =>
					[
						...current.filter((entry) => entry.key !== key),
						{ ...message, key, receivedAt: Date.now() },
					].slice(-rows),
				);
			};
		};

		void connect();
		return () => {
			disposed = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			if (socket) {
				socket.onclose = null;
				socket.close();
			}
		};
	}, [token, rows]);

	return { messages, mintFailure, phase, retryCount, setMessages, statuses };
}

/** Drops each message once its CSS fade has finished. */
function useFadeExpiry(
	fade: boolean,
	messages: BufferedMessage[],
	setMessages: (
		update: (current: BufferedMessage[]) => BufferedMessage[],
	) => void,
) {
	const oldest = messages[0]?.receivedAt;
	useEffect(() => {
		if (!fade || oldest === undefined) return;
		const timer = setTimeout(
			() => {
				const cutoff = Date.now() - FADE_WINDOW_MS;
				setMessages((current) =>
					current.filter((entry) => entry.receivedAt > cutoff),
				);
			},
			Math.max(0, oldest + FADE_WINDOW_MS - Date.now()),
		);
		return () => clearTimeout(timer);
	}, [fade, oldest, setMessages]);
}

function Badge({ badge }: { badge: ChatBadge }) {
	const [failed, setFailed] = useState(false);
	if (badge.url && !failed) {
		return (
			<img
				alt={badge.label}
				height={16}
				src={badge.url}
				style={{ height: 16, width: 16 }}
				width={16}
				onError={() => setFailed(true)}
			/>
		);
	}
	return (
		<span
			style={{
				alignItems: "center",
				backgroundColor:
					BADGE_CHIP_COLOR[
						badge.type as keyof Omit<typeof BADGE_CHIP_COLOR, "default">
					] ?? BADGE_CHIP_COLOR.default,
				borderRadius: 4,
				color: "white",
				display: "inline-flex",
				fontSize: 7,
				fontWeight: 900,
				height: 16,
				justifyContent: "center",
				minWidth: 16,
				padding: "0 2px",
			}}
			title={badge.label}
		>
			{badge.label.slice(0, 3).toUpperCase()}
		</span>
	);
}

function Fragment({ fragment }: { fragment: ChatFragment }) {
	const [failed, setFailed] = useState(false);
	if (fragment.type === "emote" && !failed) {
		return (
			<img
				alt={fragment.text}
				height={22}
				src={fragment.url}
				style={{ height: 22, width: 22 }}
				width={22}
				onError={() => setFailed(true)}
			/>
		);
	}
	return <span style={{ color: "white", fontSize: 14 }}>{fragment.text}</span>;
}

function cornerStyle(corner: (typeof CORNERS)[number]): CSSProperties {
	return {
		bottom: corner.startsWith("bottom") ? 0 : undefined,
		justifyContent: corner.startsWith("bottom") ? "flex-end" : "flex-start",
		left: corner.endsWith("left") ? 0 : undefined,
		right: corner.endsWith("right") ? 0 : undefined,
		top: corner.startsWith("top") ? 0 : undefined,
	};
}

function DebugHud({
	corner,
	fade,
	messages,
	mintFailure,
	phase,
	retryCount,
	rows,
	statuses,
}: {
	corner: (typeof CORNERS)[number];
	fade: boolean;
	messages: BufferedMessage[];
	mintFailure: "revoked" | "unavailable" | undefined;
	phase: "connecting" | "live" | "retrying" | "revoked";
	retryCount: number;
	rows: number;
	statuses: Partial<Record<ChatProvider, ChatProviderStatus>>;
}) {
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1_000);
		return () => clearInterval(timer);
	}, []);
	const providers = Object.values(statuses);
	const lastMessageAt = messages.at(-1)?.receivedAt;
	const oppositeCorner = corner
		.replace("top", "TEMP")
		.replace("bottom", "top")
		.replace("TEMP", "bottom")
		.replace("left", "TEMP")
		.replace("right", "left")
		.replace("TEMP", "right") as (typeof CORNERS)[number];

	return (
		<div
			style={{
				...cornerStyle(oppositeCorner),
				background: "#111",
				color: "#fff",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				fontSize: 12,
				lineHeight: 1.5,
				maxWidth: 360,
				padding: 10,
				position: "absolute",
			}}
		>
			<div>phase: {phase}</div>
			<div>retries: {retryCount}</div>
			<div>last mint failure: {mintFailure ?? "none"}</div>
			<div>
				messages: {messages.length} (last:{" "}
				{lastMessageAt
					? `${Math.floor((now - lastMessageAt) / 1_000)}s ago`
					: "never"}
				)
			</div>
			<div>
				corner: {corner} / rows: {rows} / fade: {String(fade)}
			</div>
			{providers.length === 0 ? <div>providers: none</div> : null}
			{providers.map((status) => (
				<div key={status.provider}>
					{status.provider}: {status.state}
					{status.error ? ` — ${status.error}` : ""}
				</div>
			))}
		</div>
	);
}

function ChatOverlay() {
	const search = Route.useSearch();
	const token = search.t;
	const corner = search.corner ?? "bottom-left";
	const rows = search.rows ?? 8;
	const fade = isTruthy(search.fade);
	const debug = isTruthy(search.debug);
	const { messages, mintFailure, phase, retryCount, setMessages, statuses } =
		useOverlayChat(token, rows);
	useFadeExpiry(fade, messages, setMessages);

	if (!token || phase === "revoked") {
		const error = (
			<p
				style={{
					color: "#FF5A5A",
					fontFamily:
						"system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
					fontSize: 13,
					margin: 8,
				}}
			>
				{token
					? "This overlay URL was revoked. Generate a new one in the VISP dashboard."
					: "Missing overlay token. Copy the Browser Source URL from the VISP dashboard."}
			</p>
		);
		if (!debug || !token) return error;
		return (
			<>
				{error}
				<DebugHud
					{...{
						corner,
						fade,
						messages,
						mintFailure,
						phase,
						retryCount,
						rows,
						statuses,
					}}
				/>
			</>
		);
	}

	// An empty buffer must leave the source fully transparent.
	if (messages.length === 0)
		return debug ? (
			<DebugHud
				{...{
					corner,
					fade,
					messages,
					mintFailure,
					phase,
					retryCount,
					rows,
					statuses,
				}}
			/>
		) : null;

	const chat = (
		<div
			style={{
				backgroundColor: "rgba(0,0,0,0.64)",
				borderRadius: 14,
				display: "flex",
				flexDirection: "column",
				fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
				gap: 6,
				maxWidth: 300,
				padding: 10,
				position: "absolute",
				...cornerStyle(corner),
			}}
		>
			{messages.map((message) => (
				<div
					key={message.key}
					style={
						fade
							? {
									animation: `visp-chat-fade ${FADE_WINDOW_MS}ms linear forwards`,
								}
							: undefined
					}
				>
					<div style={{ alignItems: "center", display: "flex", gap: 4 }}>
						<span
							style={{
								alignItems: "center",
								backgroundColor: PROVIDER_CHIP[message.provider].background,
								borderRadius: 4,
								color: PROVIDER_CHIP[message.provider].foreground,
								display: "inline-flex",
								fontSize: 8,
								fontWeight: 900,
								height: 14,
								justifyContent: "center",
								width: 14,
							}}
						>
							{PROVIDER_PRESENTATION[message.provider].initial}
						</span>
						{message.sender.badges.map((badge, index) => (
							<Badge badge={badge} key={`${badge.type}-${index}`} />
						))}
						<span
							style={{
								color: message.sender.color,
								flexShrink: 1,
								fontSize: 13,
								fontWeight: 800,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{message.sender.name}
						</span>
					</div>
					<div
						style={{
							alignItems: "center",
							display: "flex",
							flexWrap: "wrap",
						}}
					>
						{message.fragments.map((fragment, index) => (
							<Fragment fragment={fragment} key={index} />
						))}
					</div>
				</div>
			))}
		</div>
	);
	if (!debug) return chat;
	return (
		<>
			<DebugHud
				{...{
					corner,
					fade,
					messages,
					mintFailure,
					phase,
					retryCount,
					rows,
					statuses,
				}}
			/>
			{chat}
		</>
	);
}
