import { multiChatHub } from "@VISP/api/multichat/hub";
import { authenticateMultiChatOverlayToken } from "@VISP/api/multichat/overlay-token";
import { multiChatTickets } from "@VISP/api/multichat/tickets";
import { fixedWindow } from "@VISP/api/rate-limit";
import { Elysia, status, t } from "elysia";
import { nodeAdapter } from "./node-adapter";

const subscriptions = new Map<string, () => void>();
const sockets = new Map<
	string,
	Set<{ close: (code?: number, reason?: string) => void }>
>();
const socketUsers = new Map<string, string>();
const ticketMints = fixedWindow(30, 60_000);

multiChatHub.onRevoked((userId) => {
	for (const socket of sockets.get(userId) ?? []) {
		socket.close(1008, "Browser-source credential was revoked");
	}
});

export const multiChatRoutes = new Elysia({
	adapter: nodeAdapter,
	name: "multichat-routes",
})
	.ws("/api/multichat/live", {
		query: t.Object({ ticket: t.String({ minLength: 20, maxLength: 128 }) }),
		open(ws) {
			const userId = multiChatTickets.consume(ws.data.query.ticket);
			if (!userId) {
				ws.close(1008, "Invalid or expired multichat ticket");
				return;
			}
			subscriptions.set(
				ws.id,
				multiChatHub.subscribe(userId, (event) => {
					try {
						ws.send(JSON.stringify(event));
					} catch {
						// An OBS source closing must not affect the upstream connector.
					}
				}),
			);
			const userSockets = sockets.get(userId) ?? new Set();
			userSockets.add(ws);
			sockets.set(userId, userSockets);
			socketUsers.set(ws.id, userId);
		},
		close(ws) {
			subscriptions.get(ws.id)?.();
			subscriptions.delete(ws.id);
			const userId = socketUsers.get(ws.id);
			socketUsers.delete(ws.id);
			if (!userId) return;
			const userSockets = sockets.get(userId);
			userSockets?.delete(ws);
			if (userSockets?.size === 0) sockets.delete(userId);
		},
	})
	.post(
		"/api/multichat/overlay/ticket",
		async ({ body }) => {
			const userId = await authenticateMultiChatOverlayToken(body.token);
			if (!userId) return status(401, "unauthorized");
			if (!ticketMints.take(userId))
				return status(429, "too many overlay tickets");
			return multiChatTickets.issue(userId);
		},
		{ body: t.Object({ token: t.String({ minLength: 1, maxLength: 128 }) }) },
	);
