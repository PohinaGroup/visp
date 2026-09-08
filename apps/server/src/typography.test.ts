import "./test-env";

import { describe, expect, spyOn, test } from "bun:test";
import { auth } from "@VISP/auth";
import { db } from "@VISP/db";

const { typographyRoutes } = await import("./typography");

describe("Typography routes", () => {
	test("reports pending exports without a 404 and exposes render failures", async () => {
		const id = "6dd0339b-d53c-4be6-a4c3-e8b4dd628779";
		const session = spyOn(auth.api, "getSession").mockResolvedValue({ user: { id: "owner" } } as never);
		const project = spyOn(db.query.typographyProject, "findFirst").mockResolvedValue({ id, exportKey: null } as never);
		const job = spyOn(db.query.typographyJob, "findFirst").mockResolvedValue({ state: "queued" } as never);
		const poll = () => typographyRoutes.handle(new Request(`http://localhost/api/typography/projects/${id}/export`));
		try {
			for (const state of ["queued", "processing"]) {
				job.mockResolvedValue({ state } as never);
				const response = await poll();
				expect(response.status).toBe(202);
				expect(await response.json()).toEqual({ url: null });
			}
			project.mockResolvedValue({ id, exportKey: "typography/owner/export.mp4" } as never);
			expect((await poll()).status).toBe(202);
			job.mockResolvedValue({ state: "completed" } as never);
			const ready = await poll();
			expect(ready.status).toBe(200);
			const result = (await ready.json()) as { url: string };
			expect(result.url).toContain("export.mp4");
			job.mockResolvedValue({ state: "failed" } as never);
			const failed = await poll();
			expect(failed.status).toBe(500);
			expect(await failed.json()).toEqual({ error: "Export failed. Please try again." });
			project.mockResolvedValue(undefined);
			expect((await poll()).status).toBe(404);
		} finally {
			session.mockRestore();
			project.mockRestore();
			job.mockRestore();
		}
	});
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
