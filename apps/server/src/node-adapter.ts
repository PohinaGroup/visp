import { node } from "@elysia/node";

// One shared Node adapter instance so WebSocket plugin handlers and the root
// listen/upgrade hook use the same crossws context store. Separate `node()`
// calls each create an isolated store, which makes upgrades return HTTP 200
// and clients close with code 1006.
export const nodeAdapter = node();

/**
 * A stable, unique key for one WebSocket connection.
 *
 * Do not use `ws.id` with this adapter: ElysiaWS reads it from the request
 * context, which the Node adapter never sets, so it is `undefined` for every
 * socket. Keying per-connection state by it makes all sockets share one slot,
 * which mixed OBS machines and users across accounts. The underlying crossws
 * peer is the same object for open, message, and close, and has a random UUID.
 */
export function socketKey(ws: { raw: unknown }): string {
	const id = (ws.raw as { id?: unknown } | undefined)?.id;
	if (typeof id !== "string" || id.length === 0) {
		throw new Error("WebSocket peer has no id");
	}
	return id;
}
