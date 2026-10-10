import "./test-env";
import { describe, expect, test } from "bun:test";
import { node } from "@elysia/node";
import { Elysia } from "elysia";
import { chatRoutes } from "./chat";
import { multiChatRoutes } from "./multichat";
import { nodeAdapter, socketKey } from "./node-adapter";
import { obsLiveRoutes } from "./obs-live";

describe("shared node adapter websocket routes", () => {
	test("registers chat, multichat, and obs live websocket handlers", () => {
		expect(chatRoutes.router.static["/api/chat/live"]?.WS).toBeDefined();
		expect(
			multiChatRoutes.router.static["/api/multichat/live"]?.WS,
		).toBeDefined();
		expect(obsLiveRoutes.router.static["/api/obs/live"]?.WS).toBeDefined();
	});

	test("plugins and app factory share the same adapter instance", async () => {
		const { createApp } = await import("./app");
		const app = createApp();
		expect(app["~adapter"]).toBe(nodeAdapter);
		expect(chatRoutes["~adapter"]).toBe(nodeAdapter);
		expect(obsLiveRoutes["~adapter"]).toBe(nodeAdapter);
	});
});

describe("socketKey", () => {
	// Regression: ws.id is undefined on the Node adapter, so every socket shared
	// one slot and OBS state/commands crossed between accounts.
	test("is unique per connection and stable across open, message, and close", async () => {
		const events: Array<[string, string]> = [];
		const app = new Elysia({ adapter: node() }).ws("/probe", {
			open(ws) {
				events.push(["open", socketKey(ws)]);
				ws.send("ready");
			},
			message(ws) {
				events.push(["message", socketKey(ws)]);
			},
			close(ws) {
				events.push(["close", socketKey(ws)]);
			},
		});
		const server = await new Promise<NonNullable<typeof app.server>>(
			(resolve) =>
				app.listen({ hostname: "127.0.0.1", port: 0 }, (value) =>
					resolve(value),
				),
		);
		const port = (
			server as unknown as {
				raw?: { bun?: { server?: { address?: { port?: number } } } };
			}
		).raw?.bun?.server?.address?.port;
		if (!port) throw new Error("probe server did not start");
		try {
			for (let i = 0; i < 2; i++) {
				await new Promise<void>((resolve, reject) => {
					const client = new WebSocket(`ws://127.0.0.1:${port}/probe`);
					client.onerror = () => reject(new Error("socket error"));
					client.onmessage = () => {
						client.send("{}");
						setTimeout(() => client.close(), 50);
					};
					client.onclose = () => setTimeout(resolve, 50);
				});
			}
		} finally {
			server.stop(true);
		}
		expect(events.map(([kind]) => kind)).toEqual([
			"open",
			"message",
			"close",
			"open",
			"message",
			"close",
		]);
		const keys = events.map(([, key]) => key);
		expect(new Set(keys.slice(0, 3)).size).toBe(1);
		expect(new Set(keys.slice(3)).size).toBe(1);
		expect(keys[0]).not.toBe(keys[3]);
	});
});
