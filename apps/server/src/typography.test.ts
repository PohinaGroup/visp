import "./test-env";

import { describe, expect, test } from "bun:test";

const { typographyRoutes } = await import("./typography");

describe("Typography routes", () => {
	test("refuse anonymous projects", async () => {
		const response = await typographyRoutes.handle(
			new Request("http://localhost/api/typography/projects"),
		);
		expect(response.status).toBe(401);
	});

	test("are mounted on the app", async () => {
		const { createApp } = await import("./app");
		expect(createApp().router.static["/api/typography/projects"]?.GET).toBeDefined();
	});
});
