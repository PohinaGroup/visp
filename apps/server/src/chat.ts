import { listChatConnections } from "@VISP/api/chat/connections";
import { chatHub } from "@VISP/api/chat/hub";
import { handleKickWebhook } from "@VISP/api/chat/kick";
import { authenticateChatOverlayToken } from "@VISP/api/chat/overlay-token";
import { chatTickets } from "@VISP/api/chat/tickets";
import "@VISP/api/chat/twitch";
import "@VISP/api/chat/youtube";
import { fixedWindow } from "@VISP/api/rate-limit";
import { Elysia, status, t } from "elysia";
import { nodeAdapter } from "./node-adapter";

const subscriptions = new Map<string, () => void>();

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
		query: t.Object({ ticket: t.String({ minLength: 20, maxLength: 128 }) }),
		open(ws) {
			const userId = chatTickets.consume(ws.data.query.ticket);
			if (!userId) {
				ws.close(1008, "Invalid or expired chat ticket");
				return;
			}
			const unsubscribe = chatHub.subscribe(userId, (event) => {
				try {
					ws.send(JSON.stringify(event));
				} catch {
					// Media streaming is intentionally independent from chat delivery.
				}
			});
			subscriptions.set(ws.id, unsubscribe);
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
			subscriptions.get(ws.id)?.();
			subscriptions.delete(ws.id);
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
				return chatTickets.issue(userId);
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
