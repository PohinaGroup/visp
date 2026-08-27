import { type AdvisoryLock, tryAdvisoryLock } from "@VISP/api/advisory-lock";
import {
	brbTick,
	customBrbTick,
	recordBrbHighlightPlayed,
} from "@VISP/api/brb";
import {
	applyDirectState,
	DIRECT_PROVIDERS,
	DIRECT_STATES,
	DirectError,
	directDestinationActive,
	resolveDirectDestinations,
	resolveDirectDestinationsV3,
} from "@VISP/api/direct";
import {
	applyCustomDirectState,
	customDirectOutputActive,
} from "@VISP/api/direct-custom";
import {
	authenticateObsControlToken,
	pollObsControl,
	revokeObsControlToken,
	rotateObsControlToken,
} from "@VISP/api/obs-control";
import { fixedWindow } from "@VISP/api/rate-limit";
import {
	applyPathHook,
	authenticateMedia,
	createPublishDevice,
	ensureRelayUser,
	getObsMediaSource,
	listPaths,
	reconcilePathState,
} from "@VISP/api/relay";
import { getSnapshotUploadUrl } from "@VISP/api/snapshots";
import { auth } from "@VISP/auth";
import { db } from "@VISP/db";
import { session as authSession } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { Elysia, status, t } from "elysia";
import {
	directDestinationJsonResponse,
	directDestinationResponse,
	formatLegacyDirectDestinations,
	formatV2DirectDestinations,
	formatV3DirectDestinations,
} from "./direct-hook-contract";

// ponytail: per-instance limit allows N× traffic on N app instances; move to
// Postgres or the cache bus only if a strict global request cap is needed.
const deviceMutations = fixedWindow(20, 60_000);

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
	.post("/api/obs/connect", async ({ headers, request }) => {
		if (!headers.authorization?.startsWith("Bearer ")) {
			return status(401, "unauthorized");
		}
		try {
			const activeSession = await auth.api.getSession({
				headers: request.headers,
			});
			if (!activeSession) return status(401, "unauthorized");
			const relayUser = await ensureRelayUser(
				activeSession.user.id,
				activeSession.user.name,
			);
			await db
				.delete(authSession)
				.where(eq(authSession.id, activeSession.session.id));
			const pairing = await rotateObsControlToken(relayUser.id);
			return {
				account: { handle: relayUser.handle, name: activeSession.user.name },
				// Public HTTPS origin — request.url is http:// behind Caddy TLS termination.
				controlUrl: new URL("/api/obs/control", env.BETTER_AUTH_URL).toString(),
				token: pairing.token,
			};
		} catch (error) {
			if (
				error instanceof Error &&
				error.message === "Streaming account required"
			) {
				return status(403, "streaming account required");
			}
			return status(503, "connection unavailable");
		}
	})
	.get("/api/obs/devices", async ({ headers }) => {
		try {
			const owner = await authenticateObsControlToken(headers.authorization);
			if (!owner) return status(401, "unauthorized");
			const paths = await listPaths(owner.id);
			return {
				account: { handle: owner.handle },
				devices: paths.map((path) => {
					const stale =
						!path.lastEventAt ||
						Date.now() - path.lastEventAt.getTime() > 60_000;
					return {
						id: path.id,
						label: path.label,
						publishing: Boolean(path.publishing) && !stale,
					};
				}),
			};
		} catch {
			return status(503, "devices unavailable");
		}
	})
	.post(
		"/api/obs/devices",
		async ({ body, headers }) => {
			try {
				const owner = await authenticateObsControlToken(headers.authorization);
				if (!owner) return status(401, "unauthorized");
				if (!deviceMutations.take(owner.id)) {
					return status(429, "too many device changes");
				}
				return await createPublishDevice(owner.id, body.label);
			} catch (error) {
				if (error instanceof Error && error.message === "Path limit reached") {
					return status(429, "path limit reached");
				}
				return status(503, "device creation unavailable");
			}
		},
		{
			body: t.Object({
				label: t.String({ minLength: 1, maxLength: 64 }),
			}),
		},
	)
	.post(
		"/api/obs/devices/:pathId/source",
		async ({ headers, params }) => {
			try {
				const owner = await authenticateObsControlToken(headers.authorization);
				if (!owner) return status(401, "unauthorized");
				const source = await getObsMediaSource(owner.id, Number(params.pathId));
				if (!source) return status(404, "publishing device not found");
				if (source.status === "unavailable") {
					return status(
						409,
						"Rotate OBS read credentials once in the VISP dashboard",
					);
				}
				return source;
			} catch {
				return status(503, "media source unavailable");
			}
		},
		{
			params: t.Object({
				pathId: t.String({ pattern: "^[1-9][0-9]*$" }),
			}),
		},
	)
	.post("/api/obs/disconnect", async ({ headers }) => {
		try {
			const owner = await authenticateObsControlToken(headers.authorization);
			if (!owner) return status(401, "unauthorized");
			await revokeObsControlToken(owner.id);
			return status(204);
		} catch {
			return status(503, "disconnect unavailable");
		}
	})
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
				recording: t.Optional(t.Boolean()),
				virtualCam: t.Optional(t.Boolean()),
				replayBuffer: t.Optional(t.Boolean()),
				recordPaused: t.Optional(t.Boolean()),
				scenes: t.Array(t.String({ minLength: 1, maxLength: 512 }), {
					maxItems: 256,
				}),
				currentScene: t.Union([
					t.String({ minLength: 1, maxLength: 512 }),
					t.Null(),
				]),
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
			} catch (error) {
				if (error instanceof DirectError) {
					return status(409, error.message);
				}
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
		"/api/hooks/direct-destinations-v3",
		async ({ body, headers }) => {
			if (!matchesHookSecret(headers["x-hook-secret"])) {
				return status(401, "unauthorized");
			}
			try {
				const { destinations } = await resolveDirectDestinationsV3(
					body.path,
					undefined,
					body.skip,
				);
				return directDestinationJsonResponse(
					await formatV3DirectDestinations(destinations),
				);
			} catch {
				return status(503, "direct destinations unavailable");
			}
		},
		{
			body: t.Object({
				path: t.String({ minLength: 1 }),
				skip: t.Optional(
					t.Array(t.String({ minLength: 1, maxLength: 128 }), {
						maxItems: 32,
					}),
				),
			}),
		},
	)
	.post(
		"/api/hooks/direct-destinations",
		async ({ body, headers }) => {
			if (!matchesHookSecret(headers["x-hook-secret"])) {
				return status(401, "unauthorized");
			}
			try {
				// This two-field endpoint is a deployed relay contract. Keep it exact
				// during rolling upgrades; portrait-aware relays use the v2 endpoint.
				const { destinations } = await resolveDirectDestinations(
					body.path,
					undefined,
					body.skip,
					["landscape"],
				);
				return directDestinationResponse(
					formatLegacyDirectDestinations(destinations),
				);
			} catch {
				return status(503, "direct destinations unavailable");
			}
		},
		{
			body: t.Object({
				path: t.String({ minLength: 1 }),
				// Providers the relay is still forwarding for, held over a drop.
				skip: t.Optional(
					t.Array(t.Union(DIRECT_PROVIDERS.map((name) => t.Literal(name)))),
				),
			}),
		},
	)
	.post(
		"/api/hooks/direct-destinations-v2",
		async ({ body, headers }) => {
			if (!matchesHookSecret(headers["x-hook-secret"])) {
				return status(401, "unauthorized");
			}
			try {
				const { destinations } = await resolveDirectDestinations(
					body.path,
					undefined,
					body.skip,
				);
				return directDestinationResponse(
					formatV2DirectDestinations(destinations),
				);
			} catch {
				return status(503, "direct destinations unavailable");
			}
		},
		{
			body: t.Object({
				path: t.String({ minLength: 1 }),
				skip: t.Optional(
					t.Array(t.Union(DIRECT_PROVIDERS.map((name) => t.Literal(name)))),
				),
			}),
		},
	)
	.post(
		"/api/hooks/brb",
		async ({ body, headers }) => {
			if (!matchesHookSecret(headers["x-hook-secret"])) {
				return status(401, "unauthorized");
			}
			try {
				const tick = await brbTick(body.path, body.provider);
				// One line, same plain-text contract as direct-destinations. The
				// message is base64 so it survives the field split and never
				// reaches a shell word on the relay.
				const message = tick.stop
					? ""
					: Buffer.from(tick.message, "utf8").toString("base64");
				const line = tick.stop
					? "stop\n"
					: tick.highlights
						? `highlights ${message} ${Buffer.from(
								`${tick.highlights.muted ? 1 : 0} ${tick.highlights.overlay ? 1 : 0}\n${tick.highlights.clips
									.map(
										({ id, durationMs, url }) => `${id} ${durationMs} ${url}`,
									)
									.join("\n")}`,
								"utf8",
							).toString(
								"base64",
							)} ${tick.backgroundUrl ?? "-"} ${tick.source}\n`
						: `brb ${message} ${tick.backgroundUrl ?? "-"} ${tick.source}\n`;
				return new Response(line, {
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			} catch {
				return status(503, "brb unavailable");
			}
		},
		{
			body: t.Object({
				path: t.String({ minLength: 1 }),
				provider: t.Union(DIRECT_PROVIDERS.map((name) => t.Literal(name))),
			}),
		},
	)
	.post(
		"/api/hooks/direct-active-v3",
		async ({ body, headers }) => {
			if (!matchesHookSecret(headers["x-hook-secret"])) {
				return status(401, "unauthorized");
			}
			return (await customDirectOutputActive(body.path, body.outputId))
				? status(204)
				: status(410, "stopped");
		},
		{
			body: t.Object({
				path: t.String({ minLength: 1 }),
				outputId: t.String({ minLength: 1, maxLength: 128 }),
			}),
		},
	)
	.post(
		"/api/hooks/direct-active",
		async ({ body, headers }) => {
			if (!matchesHookSecret(headers["x-hook-secret"])) {
				return status(401, "unauthorized");
			}
			return (await directDestinationActive({ ...body, slug: body.path }))
				? status(204)
				: status(410, "stopped");
		},
		{
			body: t.Object({
				path: t.String({ minLength: 1 }),
				provider: t.Union(DIRECT_PROVIDERS.map((name) => t.Literal(name))),
				role: t.Union([t.Literal("landscape"), t.Literal("portrait")]),
				filter: t.Optional(t.String({ maxLength: 512 })),
			}),
		},
	)
	.post(
		"/api/hooks/brb-v3",
		async ({ body, headers }) => {
			if (!matchesHookSecret(headers["x-hook-secret"])) {
				return status(401, "unauthorized");
			}
			try {
				const tick = await customBrbTick(body.path, body.outputId);
				const message = tick.stop
					? ""
					: Buffer.from(tick.message, "utf8").toString("base64");
				const line = tick.stop
					? "stop\n"
					: `brb ${message} ${tick.backgroundUrl ?? "-"} ${tick.source}\n`;
				return new Response(line, {
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			} catch {
				return status(503, "brb unavailable");
			}
		},
		{
			body: t.Object({
				path: t.String({ minLength: 1 }),
				outputId: t.String({ minLength: 1, maxLength: 128 }),
			}),
		},
	)
	.post(
		"/api/hooks/brb-played",
		async ({ body, headers }) => {
			if (!matchesHookSecret(headers["x-hook-secret"])) {
				return status(401, "unauthorized");
			}
			try {
				await recordBrbHighlightPlayed(body.path, body.ordinal);
				return status(204);
			} catch {
				return status(503, "BRB analytics unavailable");
			}
		},
		{
			body: t.Object({
				path: t.String({ minLength: 1 }),
				ordinal: t.Integer({ minimum: 1, maximum: 2_000_000_000 }),
			}),
		},
	)
	.post(
		"/api/hooks/direct-state-v3",
		async ({ body, headers }) => {
			if (!matchesHookSecret(headers["x-hook-secret"])) {
				return status(401, "unauthorized");
			}
			try {
				await applyCustomDirectState({ ...body, slug: body.path });
				return status(204);
			} catch {
				return status(503, "state unavailable");
			}
		},
		{
			body: t.Object({
				path: t.String({ minLength: 1 }),
				outputId: t.String({ minLength: 1, maxLength: 128 }),
				state: t.Union(DIRECT_STATES.map((name) => t.Literal(name))),
				error: t.Optional(t.String({ maxLength: 2048 })),
			}),
		},
	)
	.post(
		"/api/hooks/direct-state",
		async ({ body, headers }) => {
			if (!matchesHookSecret(headers["x-hook-secret"])) {
				return status(401, "unauthorized");
			}
			try {
				await applyDirectState({ ...body, slug: body.path });
				return status(204);
			} catch {
				return status(503, "state unavailable");
			}
		},
		{
			body: t.Object({
				path: t.String({ minLength: 1 }),
				provider: t.Union(DIRECT_PROVIDERS.map((name) => t.Literal(name))),
				role: t.Optional(
					t.Union([t.Literal("landscape"), t.Literal("portrait")]),
				),
				state: t.Union(DIRECT_STATES.map((name) => t.Literal(name))),
				error: t.Optional(t.String({ maxLength: 2048 })),
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
	let acquiring = false;
	let lock: AdvisoryLock | undefined;
	const run = async () => {
		if (!lock) {
			if (acquiring) return;
			acquiring = true;
			try {
				lock =
					(await tryAdvisoryLock("visp:path-reconciler", () => {
						lock = undefined;
					})) ?? undefined;
			} catch (error) {
				console.error("Reconciler lock acquisition failed", error);
				return;
			} finally {
				acquiring = false;
			}
		}
		if (!lock || running) return;
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
	return () => {
		clearInterval(timer);
		void lock?.release();
		lock = undefined;
	};
}
