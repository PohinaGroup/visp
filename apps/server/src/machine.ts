import { pollObsControl } from "@VISP/api/obs-control";
import {
	applyPathHook,
	authenticateMedia,
	reconcilePathState,
} from "@VISP/api/relay";
import { getSnapshotUploadUrl } from "@VISP/api/snapshots";
import { env } from "@VISP/env/server";
import { timingSafeEqual } from "node:crypto";
import { Elysia, status, t } from "elysia";

function matchesHookSecret(value: string | undefined) {
	if (!value) {
		return false;
	}
	const provided = Buffer.from(value);
	const expected = Buffer.from(env.HOOK_SECRET);
	return (
		provided.length === expected.length && timingSafeEqual(provided, expected)
	);
}

export const machineRoutes = new Elysia({ name: "machine-routes" })
	.post(
		"/api/obs/control",
		async ({ body, headers }) => {
			try {
				const command = await pollObsControl(headers.authorization, body);
				return command ? command : status(401, "unauthorized");
			} catch {
				return status(503, "control unavailable");
			}
		},
		{
			body: t.Object({
				appliedVersion: t.Integer({ minimum: 0 }),
				streaming: t.Boolean(),
			}),
		},
	)
	.post(
		"/api/mediamtx/auth",
		async ({ body }) => {
			if (
				body.action === "read" &&
				body.protocol === "rtsp" &&
				(body.ip === "127.0.0.1" || body.ip === "::1")
			) {
				return status(200, "ok");
			}
			if (!body.user || !body.password) {
				return status(401, "credentials required");
			}
			if (
				body.protocol !== "srt" &&
				body.protocol !== "rtmp" &&
				!(body.protocol === "webrtc" && body.action === "publish")
			) {
				return status(403, "forbidden");
			}
			if (body.action !== "publish" && body.action !== "read") {
				return status(403, "forbidden");
			}

			try {
				const allowed = await authenticateMedia({
					action: body.action,
					password: body.password,
					path: body.path,
					user: body.user,
				});
				return allowed ? status(200, "ok") : status(401, "unauthorized");
			} catch {
				return status(503, "authentication unavailable");
			}
		},
		{
			body: t.Object({
				user: t.String(),
				password: t.String(),
				token: t.Optional(t.String()),
				ip: t.String(),
				action: t.String(),
				path: t.String(),
				protocol: t.String(),
				id: t.Optional(t.String()),
				query: t.Optional(t.String()),
				userAgent: t.Optional(t.String()),
			}),
		},
	)
	.post(
		"/api/hooks/snapshot-upload/:path",
		async ({ headers, params }) => {
			if (!matchesHookSecret(headers["x-hook-secret"])) {
				return status(401, "unauthorized");
			}
			try {
				const url = await getSnapshotUploadUrl(params.path);
				return url ?? status(404, "path is not live");
			} catch {
				return status(503, "snapshot storage unavailable");
			}
		},
		{
			params: t.Object({
				path: t.String({ minLength: 1 }),
			}),
		},
	)
	.post(
		"/api/hooks/:event",
		async ({ body, headers, params }) => {
			if (!matchesHookSecret(headers["x-hook-secret"])) {
				return status(401, "unauthorized");
			}
			try {
				await applyPathHook(params.event, body);
				return status(204);
			} catch {
				return status(503, "state unavailable");
			}
		},
		{
			params: t.Object({
				event: t.Union([
					t.Literal("ready"),
					t.Literal("not-ready"),
					t.Literal("read"),
					t.Literal("unread"),
				]),
			}),
			body: t.Object({
				path: t.String({ minLength: 1 }),
				sourceType: t.Optional(t.String()),
				readerId: t.Optional(t.String()),
			}),
		},
	);

export function startReconciler() {
	let running = false;
	const run = async () => {
		if (running) {
			return;
		}
		running = true;
		try {
			await reconcilePathState();
		} catch (error) {
			console.error("MediaMTX reconciliation failed", error);
		} finally {
			running = false;
		}
	};

	void run();
	const timer = setInterval(run, 10_000);
	return () => clearInterval(timer);
}
