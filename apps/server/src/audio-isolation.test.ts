import "./test-env";

import { describe, expect, test } from "bun:test";

const { audioIsolationRoutes } = await import("./audio-isolation");

describe("audio isolation route", () => {
	test("refuses an anonymous caller before reading the body", async () => {
		const response = await audioIsolationRoutes.handle(
			new Request("http://localhost/api/audio-isolation", {
				method: "POST",
				headers: { "Content-Type": "application/octet-stream" },
				body: new Uint8Array([1, 2, 3]),
			}),
		);

		expect(response.status).toBe(401);
	});

	test("is mounted on the app", async () => {
		const { createApp } = await import("./app");
		expect(createApp().router.static["/api/audio-isolation"]?.POST).toBeDefined();
	});
});
