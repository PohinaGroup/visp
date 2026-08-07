import "./test-env";
import { describe, expect, test } from "bun:test";
import { chatRoutes } from "./chat";
import { nodeAdapter } from "./node-adapter";
import { obsLiveRoutes } from "./obs-live";

describe("shared node adapter websocket routes", () => {
	test("registers chat and obs live websocket handlers", () => {
		expect(chatRoutes.router.static["/api/chat/live"]?.WS).toBeDefined();
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
