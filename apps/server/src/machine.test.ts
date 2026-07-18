import "./test-env";

import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

const { machineRoutes } = await import("./machine");
const { LOG_REDACTION_PATHS } = await import("./app");
const { deleteSnapshotsForPathIds } = await import("@VISP/auth");
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
		).toBe(403);
	});

	test("allows only loopback RTSP reads without media credentials", async () => {
		expect(
			(
				await authRequest({
					action: "read",
					protocol: "rtsp",
				})
			).status,
		).toBe(200);
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
				body: JSON.stringify({ appliedVersion: 0, streaming: false }),
			}),
		);
		expect(response.status).toBe(401);
	});

	test("redacts machine secrets from structured logs", () => {
		expect(LOG_REDACTION_PATHS).toContain("**.password");
		expect(LOG_REDACTION_PATHS).toContain("**.x-hook-secret");
		expect(LOG_REDACTION_PATHS).toContain("**.accessToken");
		expect(LOG_REDACTION_PATHS).toContain("**.ticket");
		expect(LOG_REDACTION_PATHS).toContain("**.authorization");
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
});
