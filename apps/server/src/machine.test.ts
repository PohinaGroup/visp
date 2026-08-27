import "./test-env";

import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

const { machineRoutes, studioScopedCredential } = await import("./machine");
const { createApp, LOG_REDACTION_PATHS } = await import("./app");
const { deleteBrbHighlightUploadsForUser, deleteSnapshotsForPathIds } =
	await import("@VISP/auth");
const app = new Elysia().use(machineRoutes);

function authRequest(overrides: Record<string, unknown> = {}) {
	return app.handle(
		new Request("http://localhost/api/mediamtx/auth", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				user: "",
				password: "",
				ip: "127.0.0.1",
				action: "publish",
				path: "streamer-1",
				protocol: "srt",
				...overrides,
			}),
		}),
	);
}

describe("machine endpoints", () => {
	test("challenges empty credentials", async () => {
		expect((await authRequest()).status).toBe(401);
	});

	test("forbids unsupported protocols and actions", async () => {
		expect(
			(await authRequest({ user: "u", password: "p", protocol: "hls" })).status,
		).toBe(403);
		expect(
			(await authRequest({ user: "u", password: "p", action: "api" })).status,
		).toBe(403);
		expect(
			(
				await authRequest({
					action: "read",
					password: "p",
					protocol: "webrtc",
					user: "u",
				})
			).status,
		).not.toBe(200);
	});

	test("binds loopback Studio media credentials to one exact path", async () => {
		const password = studioScopedCredential(
			"test-studio-media-password-at-least-32-chars",
			"streamer-1",
			"media",
		);
		expect(
			(
				await authRequest({
					action: "read",
					password,
					protocol: "rtsp",
					user: "studio:streamer-1",
				})
			).status,
		).toBe(200);
		expect(
			(
				await authRequest({
					action: "read",
					path: "streamer-2",
					password,
					protocol: "rtsp",
					user: "studio:streamer-1",
				})
			).status,
		).not.toBe(200);
		expect(
			(
				await authRequest({
					action: "read",
					ip: "203.0.113.10",
					password: "p",
					protocol: "rtsp",
					user: "u",
				})
			).status,
		).toBe(403);
	});

	test("allows only the compositor credential to publish a local Studio RTSP path", async () => {
		const password = studioScopedCredential(
			"test-studio-media-password-at-least-32-chars",
			"streamer-1",
			"media",
		);
		expect(
			(
				await authRequest({
					action: "publish",
					ip: "127.0.0.1",
					path: "studio/streamer-1",
					password,
					protocol: "rtsp",
					user: "studio:streamer-1",
				})
			).status,
		).toBe(200);
		for (const overrides of [
			{ ip: "203.0.113.10" },
			{ path: "streamer-1" },
			{ password: "wrong-password" },
		]) {
			expect(
				(
					await authRequest({
						action: "publish",
						ip: "127.0.0.1",
						path: "studio/streamer-1",
						password,
						protocol: "rtsp",
						user: "studio:streamer-1",
						...overrides,
					})
				).status,
			).not.toBe(200);
		}
	});

	test("binds every Studio worker hook token to its body path", async () => {
		const token = studioScopedCredential(
			"test-hook-secret-that-is-at-least-32-characters",
			"streamer-1",
			"hook",
		);
		const routes = [
			["desired-state", { path: "streamer-2" }],
			["relay-plan", { path: "streamer-2" }],
			["health", { path: "streamer-2", healthy: false }],
			[
				"browser-failure",
				{ path: "streamer-2", layerId: "11111111-1111-4111-8111-111111111111" },
			],
			["alert", { path: "streamer-2", event: "follow" }],
		] as const;
		for (const [route, body] of routes) {
			const response = await app.handle(
				new Request(`http://localhost/api/hooks/studio/${route}`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-studio-token": token,
					},
					body: JSON.stringify(body),
				}),
			);
			expect(response.status).toBe(401);
		}
	});

	test("rejects hooks without the shared secret", async () => {
		const response = await app.handle(
			new Request("http://localhost/api/hooks/read", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ path: "streamer-1" }),
			}),
		);
		expect(response.status).toBe(401);
	});

	test("rejects OBS control without a pairing token", async () => {
		const response = await app.handle(
			new Request("http://localhost/api/obs/control", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					appliedVersion: 0,
					streaming: false,
					scenes: [],
					currentScene: null,
				}),
			}),
		);
		expect(response.status).toBe(401);
	});

	test("redacts machine secrets from structured logs", () => {
		expect(LOG_REDACTION_PATHS).toContain("**.password");
		expect(LOG_REDACTION_PATHS).toContain("**.x-hook-secret");
		expect(LOG_REDACTION_PATHS).toContain("**.accessToken");
		expect(LOG_REDACTION_PATHS).toContain("**.access_token");
		expect(LOG_REDACTION_PATHS).toContain("**.ticket");
		expect(LOG_REDACTION_PATHS).toContain("**.token");
		expect(LOG_REDACTION_PATHS).toContain("**.device_code");
		expect(LOG_REDACTION_PATHS).toContain("**.authorization");
		expect(LOG_REDACTION_PATHS).toContain("**.applicantName");
		expect(LOG_REDACTION_PATHS).toContain("**.email");
		expect(LOG_REDACTION_PATHS).toContain("**.audienceAndSetup");
	});

	test("forwards Google's accepted localhost callback to Better Auth", async () => {
		const response = await createApp().handle(
			new Request(
				"http://localhost:3000/api/auth/google-local-callback?code=code&state=state",
			),
		);
		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe(
			"http://127.0.0.1:3000/api/auth/callback/google?code=code&state=state",
		);
	});

	test("deletes every account snapshot and propagates storage failures", async () => {
		const deleted: string[] = [];
		const client = {
			delete: async (path: string) => {
				deleted.push(path);
			},
		} as unknown as Parameters<typeof deleteSnapshotsForPathIds>[1];
		await deleteSnapshotsForPathIds([2, 7], client);
		expect(deleted).toEqual(["snapshots/2.jpg", "snapshots/7.jpg"]);

		await expect(
			deleteSnapshotsForPathIds([2], {
				delete: async () => {
					throw new Error("storage unavailable");
				},
			} as unknown as Parameters<typeof deleteSnapshotsForPathIds>[1]),
		).rejects.toThrow("storage unavailable");
	});

	test("deletes every abandoned highlight upload for an account", async () => {
		const deleted: string[] = [];
		let listedPrefix = "";
		await deleteBrbHighlightUploadsForUser("user-a", {
			list: async (prefix) => {
				listedPrefix = prefix;
				return [`${prefix}first.mp4`, `${prefix}second.mp4`];
			},
			delete: async (key) => void deleted.push(key),
		});

		expect(listedPrefix).toBe("brb/user-a/highlights/uploads/");
		expect(deleted).toEqual([
			"brb/user-a/highlights/uploads/first.mp4",
			"brb/user-a/highlights/uploads/second.mp4",
		]);
	});
});
