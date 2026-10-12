import {
	authenticateObsControlToken,
	getObsControlCommand,
	getObsControlStatus,
	reportObsControlState,
} from "@VISP/api/obs-control";
import {
	type ObsLivePeer,
	obsLiveHub,
	obsLiveTickets,
} from "@VISP/api/obs-live";
import { Elysia, status, t } from "elysia";
import { nodeAdapter, socketKey } from "./node-adapter";

const connections = new Map<
	string,
	{ peer: ObsLivePeer; reports: Promise<void>; unsubscribe: () => void }
>();

function send(ws: { send(data: string): unknown }, data: unknown) {
	try {
		ws.send(JSON.stringify(data));
	} catch {
		// A closed peer is cleaned up by the close handler.
	}
}

export const obsLiveRoutes = new Elysia({
	adapter: nodeAdapter,
	name: "obs-live-routes",
})
	.post("/api/obs/live-ticket", async ({ headers }) => {
		try {
			const owner = await authenticateObsControlToken(headers.authorization);
			if (!owner?.obsControlTokenId) return status(401, "unauthorized");
			return obsLiveTickets.issue({
				role: "machine",
				userId: owner.id,
				tokenId: owner.obsControlTokenId,
			});
		} catch {
			return status(503, "live ticket unavailable");
		}
	})
	.ws("/api/obs/live", {
		// The Node adapter only runs its built-in JSON decoder when a parser is set.
		parse: () => undefined,
		query: t.Object({ ticket: t.String({ minLength: 20, maxLength: 128 }) }),
		body: t.Object({
			appliedVersion: t.Integer({ minimum: 0 }),
			streaming: t.Boolean(),
			recording: t.Optional(t.Boolean()),
			virtualCam: t.Optional(t.Boolean()),
			replayBuffer: t.Optional(t.Boolean()),
			recordPaused: t.Optional(t.Boolean()),
			scenes: t.Array(t.String({ minLength: 1, maxLength: 512 }), {
				maxItems: 256,
			}),
			currentScene: t.Union([
				t.String({ minLength: 1, maxLength: 512 }),
				t.Null(),
			]),
		}),
		async open(ws) {
			const peer = obsLiveTickets.consume(ws.data.query.ticket);
			if (!peer) {
				ws.close(1008, "Invalid or expired OBS ticket");
				return;
			}

			let delivered = false;
			const unsubscribe =
				peer.role === "user"
					? obsLiveHub.subscribeStatus(peer.userId, (value) => {
							delivered = true;
							send(ws, { type: "status", status: value });
						})
					: obsLiveHub.subscribeCommands(peer.userId, (value, tokenId) => {
							if (tokenId === peer.tokenId) send(ws, value);
						});
			connections.set(socketKey(ws), {
				peer,
				reports: Promise.resolve(),
				unsubscribe,
			});

			try {
				if (peer.role === "user") {
					const current = await getObsControlStatus(peer.userId);
					if (!delivered) send(ws, { type: "status", status: current });
					return;
				}
				if (!(await getObsControlCommand(peer.userId, peer.tokenId))) {
					ws.close(1008, "OBS credential was revoked");
					return;
				}
				// The stored command is not pushed on open: the plugin reports its
				// state right after the handshake and gets the command in reply, by
				// which point a desired flag left behind by a previous OBS session
				// (a stream stopped from OBS, a crash) has been reconciled with the
				// actual state. Pushing it first would start that stale stream.
			} catch {
				ws.close(1011, "OBS live state unavailable");
			}
		},
		async message(ws, message) {
			const connection = connections.get(socketKey(ws));
			const peer = connection?.peer;
			if (!connection || peer?.role !== "machine") {
				ws.close(1008, "Only an OBS machine may report state");
				return;
			}
			connection.reports = connection.reports.then(async () => {
				try {
					const command = await reportObsControlState(
						peer.userId,
						peer.tokenId,
						message,
					);
					if (!command) {
						ws.close(1008, "OBS credential was revoked");
						return;
					}
					send(ws, command);
				} catch {
					ws.close(1011, "OBS state report failed");
				}
			});
			await connection.reports;
		},
		close(ws) {
			connections.get(socketKey(ws))?.unsubscribe();
			connections.delete(socketKey(ws));
		},
	});
