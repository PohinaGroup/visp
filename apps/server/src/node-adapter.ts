import { node } from "@elysia/node";

// One shared Node adapter instance so WebSocket plugin handlers and the root
// listen/upgrade hook use the same crossws context store. Separate `node()`
// calls each create an isolated store, which makes upgrades return HTTP 200
// and clients close with code 1006.
export const nodeAdapter = node();
