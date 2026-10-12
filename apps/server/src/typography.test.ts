import "./test-env";

import { auth } from "@VISP/auth";
import { db } from "@VISP/db";
import { describe, expect, spyOn, test } from "bun:test";

const { resetTypographyRateLimits, typographyRoutes } = await import(
	"./typography"
);

const projectUuid = "6dd0339b-d53c-4be6-a4c3-e8b4dd628779";

/** Signs in as "owner" and sets the hosted-subtitles flag typography rides on. */
function signedIn(enabled: boolean) {
	const session = spyOn(auth.api, "getSession").mockResolvedValue({
		session: { token: "browser-token" },
		user: { id: "owner" },
	} as never);
	const flags = spyOn(db, "select").mockReturnValue({
		from: () => ({
			where: () => ({
				limit: async () => [
					{
						betterTts: false,
						betterAudioIsolation: false,
						betterSubtitles: enabled,
					},
				],
			}),
		}),
	} as never);
	return () => {
		session.mockRestore();
		flags.mockRestore();
	};
}

function post(path: string, body?: unknown) {
	return typographyRoutes.handle(
		new Request(`http://localhost/api/typography/projects${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		}),
	);
}

describe("Typography routes", () => {
	test("reports pending exports without a 404 and exposes render failures", async () => {
		const id = "6dd0339b-d53c-4be6-a4c3-e8b4dd628779";
		const session = spyOn(auth.api, "getSession").mockResolvedValue({
			session: { token: "browser-token" },
			user: { id: "owner" },
		} as never);
		const project = spyOn(
			db.query.typographyProject,
			"findFirst",
		).mockResolvedValue({ id, exportKey: null } as never);
		const job = spyOn(db.query.typographyJob, "findFirst").mockResolvedValue({
			state: "queued",
		} as never);
		const poll = () =>
			typographyRoutes.handle(
				new Request(`http://localhost/api/typography/projects/${id}/export`),
			);
		try {
			for (const state of ["queued", "processing"]) {
				job.mockResolvedValue({ state } as never);
				const response = await poll();
				expect(response.status).toBe(202);
				expect(await response.json()).toEqual({ url: null });
			}
			project.mockResolvedValue({
				id,
				exportKey: "typography/owner/export.mp4",
			} as never);
			expect((await poll()).status).toBe(202);
			job.mockResolvedValue({ state: "completed" } as never);
			const ready = await poll();
			expect(ready.status).toBe(200);
			const result = (await ready.json()) as { url: string };
			expect(result.url).toContain("export.mp4");
			job.mockResolvedValue({ state: "failed" } as never);
			const failed = await poll();
			expect(failed.status).toBe(500);
			expect(await failed.json()).toEqual({
				error: "Export failed. Please try again.",
			});
			project.mockResolvedValue(undefined);
			expect((await poll()).status).toBe(404);
		} finally {
			session.mockRestore();
			project.mockRestore();
			job.mockRestore();
		}
	});
	test("refuse spending calls without the feature flag", async () => {
		resetTypographyRateLimits();
		const restore = signedIn(false);
		try {
			for (const response of [
				await post("", {
					filename: "clip.mp4",
					language: "en",
					contentType: "video/mp4",
					byteSize: 1024,
				}),
				await post(`/${projectUuid}/finalize`),
				await post(`/${projectUuid}/export`),
			]) {
				expect(response.status).toBe(403);
				expect(await response.json()).toEqual({
					error: "Typography is not enabled",
				});
			}
		} finally {
			restore();
		}
	});

	test("answer wrong-state calls with 409 and rate limit per user", async () => {
		resetTypographyRateLimits();
		const restore = signedIn(true);
		const project = spyOn(
			db.query.typographyProject,
			"findFirst",
		).mockResolvedValue({ id: projectUuid, state: "processing" } as never);
		try {
			for (let call = 0; call < 10; call += 1) {
				const response = await post(`/${projectUuid}/finalize`);
				expect(response.status).toBe(409);
				expect(await response.json()).toEqual({
					error: "This upload is already being processed",
				});
			}
			const limited = await post(`/${projectUuid}/finalize`);
			expect(limited.status).toBe(429);
			expect(await limited.json()).toEqual({ error: "Too many requests" });

			const notReady = await post(`/${projectUuid}/export`);
			expect(notReady.status).toBe(409);
			expect(await notReady.json()).toEqual({ error: "Project is not ready" });
			project.mockResolvedValue(undefined);
			expect((await post(`/${projectUuid}/export`)).status).toBe(404);
		} finally {
			project.mockRestore();
			restore();
			resetTypographyRateLimits();
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
		expect(
			createApp().router.static["/api/typography/projects"]?.GET,
		).toBeDefined();
	});
});
