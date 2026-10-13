import { listChatConnections } from "@VISP/api/chat/connections";
import { chatHub } from "@VISP/api/chat/hub";
import { handleKickWebhook } from "@VISP/api/chat/kick";
import {
	authenticateChatOverlayToken,
	parseChatOverlayToken,
} from "@VISP/api/chat/overlay-token";
import { chatTickets } from "@VISP/api/chat/tickets";
import "@VISP/api/chat/twitch";
import "@VISP/api/chat/youtube";
import { fixedWindow } from "@VISP/api/rate-limit";
import { db } from "@VISP/db";
import { appUser } from "@VISP/db/schema/index";
import { inArray } from "drizzle-orm";
import { Elysia, status, t } from "elysia";
import { nodeAdapter, socketKey } from "./node-adapter";

const subscriptions = new Map<string, () => void>();

// Overlay sockets remember which overlay token minted their ticket, so a
// revoke or rotate can end them. Dashboard tickets come from a session and
// are not tracked here.
const overlayTickets = new Map<
	string,
	{ tokenId: string; expiresAt: number }
>();
const overlaySockets = new Map<
	string,
	{
		userId: string;
		tokenId: string;
		close: (code?: number, reason?: string) => void;
	}
>();

/** How often open overlay sockets are checked against the current token. */
export const CHAT_OVERLAY_REVALIDATE_MS = 60_000;

/**
 * Nothing announces a revoke or rotate to this process, so open overlay
 * sockets are re-checked on a timer and closed once their token is gone.
 */
export async function revalidateChatOverlaySockets() {
	const userIds = [
		...new Set([...overlaySockets.values()].map(({ userId }) => userId)),
	];
	if (!userIds.length) return;
	let current: Map<string, string | null>;
	try {
		const rows = await db
			.select({ id: appUser.id, tokenId: appUser.chatOverlayTokenId })
			.from(appUser)
			.where(inArray(appUser.id, userIds));
		current = new Map(rows.map((row) => [row.id, row.tokenId]));
	} catch {
		// A database blip must not drop every overlay; retry on the next tick.
		return;
	}
	for (const { userId, tokenId, close } of overlaySockets.values()) {
		if (current.get(userId) !== tokenId) {
			close(1008, "Chat overlay credential was revoked");
		}
	}
}

setInterval(
	() => void revalidateChatOverlaySockets(),
	CHAT_OVERLAY_REVALIDATE_MS,
).unref?.();

// The browser source remints on every reconnect, so this only has to be loose
// enough for a backoff loop and tight enough to blunt token guessing.
const overlayMints = fixedWindow(30, 60_000);

function kickHeaders(request: Request) {
	return {
		messageId: request.headers.get("Kick-Event-Message-Id") ?? "",
		signature: request.headers.get("Kick-Event-Signature") ?? "",
		timestamp: request.headers.get("Kick-Event-Message-Timestamp") ?? "",
		type: request.headers.get("Kick-Event-Type") ?? "",
		version: request.headers.get("Kick-Event-Version") ?? "",
	};
}

export const chatRoutes = new Elysia({
	adapter: nodeAdapter,
	name: "chat-routes",
})
	.ws("/api/chat/live", {
		query: t.Object({
			ticket: t.String({ minLength: 20, maxLength: 128 }),
			// Alerts shipped after the 1.4.x app builds, and those treat every
			// non-status frame as a chat message: they read `event.message.id` off
			// an alert and crash the overlay. Old clients never send this, so
			// defaulting it off is what keeps them alive.
			alerts: t.Optional(t.String()),
		}),
		open(ws) {
			const overlay = overlayTickets.get(ws.data.query.ticket);
			overlayTickets.delete(ws.data.query.ticket);
			const userId = chatTickets.consume(ws.data.query.ticket);
			if (!userId) {
				ws.close(1008, "Invalid or expired chat ticket");
				return;
			}
			if (overlay) {
				overlaySockets.set(socketKey(ws), {
					userId,
					tokenId: overlay.tokenId,
					close: (code, reason) => ws.close(code, reason),
				});
			}
			const wantsAlerts = ws.data.query.alerts === "1";
			const unsubscribe = chatHub.subscribe(userId, (event) => {
				if (event.type === "alert" && !wantsAlerts) return;
				try {
					ws.send(JSON.stringify(event));
				} catch {
					// Media streaming is intentionally independent from chat delivery.
				}
			});
			subscriptions.set(socketKey(ws), unsubscribe);
			void listChatConnections(userId)
				.then((connections) => {
					if (
						connections.some(
							({ enabled, provider }) => provider === "kick" && enabled,
						)
					) {
						chatHub.status(userId, "kick", "connected");
					}
				})
				.catch((error) =>
					chatHub.status(
						userId,
						"kick",
						"error",
						error instanceof Error
							? error.message
							: "Kick chat could not be started",
					),
				);
		},
		close(ws) {
			subscriptions.get(socketKey(ws))?.();
			subscriptions.delete(socketKey(ws));
			overlaySockets.delete(socketKey(ws));
		},
	})
	.post(
		"/api/chat/overlay/ticket",
		async ({ body }) => {
			try {
				const userId = await authenticateChatOverlayToken(body.token);
				if (!userId) return status(401, "unauthorized");
				if (!overlayMints.take(userId)) {
					return status(429, "too many overlay tickets");
				}
				const issued = chatTickets.issue(userId);
				const tokenId = parseChatOverlayToken(body.token)?.id;
				const now = Date.now();
				for (const [ticket, entry] of overlayTickets) {
					if (entry.expiresAt <= now) overlayTickets.delete(ticket);
				}
				if (tokenId) {
					overlayTickets.set(issued.ticket, {
						tokenId,
						expiresAt: Date.parse(issued.expiresAt),
					});
				}
				return issued;
			} catch {
				return status(503, "overlay ticket unavailable");
			}
		},
		{ body: t.Object({ token: t.String({ minLength: 1, maxLength: 128 }) }) },
	)
	.post(
		"/api/webhooks/kick",
		async ({ request, status }) => {
			const headers = kickHeaders(request);
			if (Object.values(headers).some((value) => !value)) return status(400);
			const result = await handleKickWebhook(await request.text(), headers);
			if (result === "signature" || result === "timestamp") return status(401);
			if (result === "replay") return status(409);
			if (result === "payload") return status(400);
			return status(204);
		},
		{ parse: "none" },
	);
