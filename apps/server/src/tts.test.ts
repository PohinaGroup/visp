import "./test-env";

import { describe, expect, test } from "bun:test";

const { ttsRoutes } = await import("./tts");

describe("hosted speech route", () => {
	test("refuses an anonymous caller before reading the body", async () => {
		const response = await ttsRoutes.handle(
			new Request("http://localhost/api/tts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: "hi says Joni", language: "en" }),
			}),
		);

		expect(response.status).toBe(401);
	});

	test("is mounted on the app", async () => {
		const { createApp } = await import("./app");
		expect(createApp().router.static["/api/tts"]?.POST).toBeDefined();
	});
});
