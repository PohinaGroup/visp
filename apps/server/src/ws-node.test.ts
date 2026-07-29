import "./test-env";
import { describe, expect, test } from "bun:test";
import { chatRoutes } from "./chat";
import { obsLiveRoutes } from "./obs-live";

describe("node adapter websocket routes", () => {
	test("registers chat and obs live websocket handlers on plugin instances", () => {
		expect(chatRoutes.router.static["/api/chat/live"]?.WS).toBeDefined();
		expect(obsLiveRoutes.router.static["/api/obs/live"]?.WS).toBeDefined();
	});
});
