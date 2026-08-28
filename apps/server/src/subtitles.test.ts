import "./test-env";

import { describe, expect, test } from "bun:test";

const { subtitlesRoutes } = await import("./subtitles");

describe("subtitles token route", () => {
	test("refuses an anonymous caller before reading the body", async () => {
		const response = await subtitlesRoutes.handle(
			new Request("http://localhost/api/subtitles/token", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ language: "en" }),
			}),
		);

		expect(response.status).toBe(401);
	});

	test("is mounted on the app", async () => {
		const { createApp } = await import("./app");
		expect(
			createApp().router.static["/api/subtitles/token"]?.POST,
		).toBeDefined();
	});
});
