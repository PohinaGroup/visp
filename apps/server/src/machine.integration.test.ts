import "./test-env";

import { brbTick, stopBrb } from "@VISP/api/brb";
import {
	publishInvalidation,
	subscribeInvalidations,
} from "@VISP/api/cache-bus";
import { setBotSettings } from "@VISP/api/chat/bot";
import {
	disableChatConnection,
	enableChatConnection,
	listChatConnections,
} from "@VISP/api/chat/connections";
import type { ChatLiveEvent } from "@VISP/api/chat/contract";
import { chatHub } from "@VISP/api/chat/hub";
import {
	handleVerifiedKickPayload,
	reconcileKickSubscriptions,
} from "@VISP/api/chat/kick";
import {
	authenticateChatOverlayToken,
	issueChatOverlayToken,
	revokeChatOverlayToken,
} from "@VISP/api/chat/overlay-token";
import {
	applyDirectState,
	directDestinationActive,
	prepareDirect,
	resolveDirectDestinations,
} from "@VISP/api/direct";
import {
	getObsControlStatus,
	rotateObsControlToken,
	setObsScene,
	setObsStreaming,
} from "@VISP/api/obs-control";
import { hashSecret } from "@VISP/api/password";
import {
	applyPathHook,
	authenticateMedia,
	claimNativePublishDevice,
	clearAuthCacheForTests,
	completeOnboarding,
	createPath,
	createPublishDevice,
	ensureRelayUser,
	listPaths,
	reconcilePathState,
	revealPublishPath,
	revokePath,
	rotatePublishPath,
	rotateReadSecret,
} from "@VISP/api/relay";
import { chooseRelay, ensureDefaultRelay } from "@VISP/api/relays";
import { appRouter } from "@VISP/api/routers/index";
import { listSnapshots, snapshotKey } from "@VISP/api/snapshots";
import { auth } from "@VISP/auth";
import { db } from "@VISP/db";
import {
	account,
	appUser,
	session as authSession,
	chatBotAlert,
	chatConnection,
	directDestination,
	pathState,
	relay,
	relayPath,
	relayStreamSession,
	user,
} from "@VISP/db/schema/index";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq, ne } from "drizzle-orm";
import { Elysia } from "elysia";
import { machineRoutes } from "./machine";
import { nodeAdapter } from "./node-adapter";
import { obsLiveRoutes } from "./obs-live";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const originalFetch = globalThis.fetch;
const app = new Elysia().use(machineRoutes);

async function seed() {
	const publishA = "publish-a";
	const readA = "read-a";
	const publishB = "publish-b";
	const readB = "read-b";
	await db.insert(user).values([
		{ id: "user-a", name: "Alpha", email: "alpha@example.test" },
		{ id: "user-b", name: "Beta", email: "beta@example.test" },
	]);
	await db.insert(appUser).values([
		{
			id: "user-a",
			handle: "alpha",
			publishSecretHash: await hashSecret(publishA),
			readSecretHash: await hashSecret(readA),
		},
		{
			id: "user-b",
			handle: "beta",
			publishSecretHash: await hashSecret(publishB),
			readSecretHash: await hashSecret(readB),
		},
	]);
	const defaultRelay = await db.query.relay.findFirst({
		where: eq(relay.name, "default"),
	});
	if (!defaultRelay) throw new Error("default test relay was not created");
	const [pathA, pathB] = await db
		.insert(relayPath)
		.values([
			{
				relayId: defaultRelay.id,
				userId: "user-a",
				seq: 1,
				slug: "alpha-1",
				label: "main",
			},
			{
				relayId: defaultRelay.id,
				userId: "user-b",
				seq: 1,
				slug: "beta-1",
				label: "main",
			},
		])
		.returning();
	if (!pathA || !pathB) throw new Error("test paths were not created");
	return { pathA, pathB, publishA, readA, publishB, readB };
}

/**
 * Alerts are fire-and-forget by design — a chat outage must not fail a path
 * hook — so the tests wait for them rather than assuming they land inline.
 */
async function alertsFor(pathId: number, expected: number) {
	let rows = await db.query.chatBotAlert.findMany({
		where: eq(chatBotAlert.pathId, pathId),
	});
	for (let attempt = 0; attempt < 40 && rows.length < expected; attempt += 1) {
		await Bun.sleep(25);
		rows = await db.query.chatBotAlert.findMany({
			where: eq(chatBotAlert.pathId, pathId),
		});
	}
	return rows.map((row) => row.event).sort();
}

/** Give a claim that should never happen time to happen before ruling it out. */
function settleAlerts() {
	return Bun.sleep(150);
}

function machineAuth(input: {
	action: "publish" | "read";
	password: string;
	path: string;
	protocol: "srt" | "rtmp" | "webrtc";
	user: string;
}) {
	return app.handle(
		new Request("http://localhost/api/mediamtx/auth", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...input, ip: "127.0.0.1" }),
		}),
	);
}

integration("relay PostgreSQL integration", () => {
	beforeEach(async () => {
		clearAuthCacheForTests();
		await db.delete(user);
		await ensureDefaultRelay();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("denies cross-tenant publish credentials for SRT, RTMP, and WebRTC", async () => {
		const data = await seed();
		for (const protocol of ["srt", "rtmp", "webrtc"] as const) {
			expect(
				(
					await machineAuth({
						action: "publish",
						password: data.publishA,
						path: data.pathB.slug,
						protocol,
						user: "alpha",
					})
				).status,
			).toBe(401);
		}
	});

	test("rejects revoked paths and invalidates cached hashes on rotation", async () => {
		const data = await seed();
		expect(
			(
				await machineAuth({
					action: "publish",
					password: data.publishA,
					path: data.pathA.slug,
					protocol: "webrtc",
					user: "alpha",
				})
			).status,
		).toBe(200);
		expect(
			await authenticateMedia({
				action: "read",
				password: data.readA,
				path: data.pathA.slug,
				user: "alpha",
			}),
		).toBe(true);

		const rotated = await rotateReadSecret("user-a");
		expect(
			await authenticateMedia({
				action: "read",
				password: data.readA,
				path: data.pathA.slug,
				user: "alpha",
			}),
		).toBe(false);
		expect(
			await authenticateMedia({
				action: "read",
				password: rotated.revealed.read ?? "",
				path: data.pathA.slug,
				user: "alpha",
			}),
		).toBe(true);

		await revokePath("user-a", data.pathA.id);
		expect(
			(
				await machineAuth({
					action: "publish",
					password: data.publishA,
					path: data.pathA.slug,
					protocol: "webrtc",
					user: "alpha",
				})
			).status,
		).toBe(401);
		expect(
			await authenticateMedia({
				action: "read",
				password: rotated.revealed.read ?? "",
				path: data.pathA.slug,
				user: "alpha",
			}),
		).toBe(false);
	});

	test("delivers cache invalidations through a dedicated Postgres listener", async () => {
		let ready: (() => void) | undefined;
		let delivered: ((payload: unknown) => void) | undefined;
		const connected = new Promise<void>((resolve) => {
			ready = resolve;
		});
		const notification = new Promise<unknown>((resolve) => {
			delivered = resolve;
		});
		const stop = subscribeInvalidations((payload) => {
			if (payload.type === "full") ready?.();
			if (payload.type === "slug") delivered?.(payload);
		});
		await connected;
		await publishInvalidation({ type: "slug", slug: "alpha-1" });
		expect(await notification).toEqual({ type: "slug", slug: "alpha-1" });
		stop();
	});

	test("isolates publish credentials by device and reveals only to the owner", async () => {
		await seed();
		const first = await createPublishDevice("user-a", "phone");
		const second = await createPublishDevice("user-a", "backup");
		const firstSecret = new URL(first.urls.srt).searchParams
			.get("streamid")
			?.split(":")
			.at(-1);
		const secondSecret = new URL(second.urls.srt).searchParams
			.get("streamid")
			?.split(":")
			.at(-1);
		if (!firstSecret || !secondSecret)
			throw new Error("missing publish secret");

		expect(
			await authenticateMedia({
				action: "publish",
				password: firstSecret,
				path: first.path.slug,
				user: "alpha",
			}),
		).toBe(true);
		const stored = await db.query.relayPath.findFirst({
			where: eq(relayPath.id, first.path.id),
		});
		expect(stored?.publishSecretEncrypted).not.toContain(firstSecret);
		expect(stored?.publishSecretHash).not.toBe(firstSecret);
		expect(stored?.publishLastConnectedAt).toBeInstanceOf(Date);
		expect(
			await authenticateMedia({
				action: "publish",
				password: firstSecret,
				path: second.path.slug,
				user: "alpha",
			}),
		).toBe(false);
		expect((await revealPublishPath("user-a", first.path.id))?.urls).toEqual(
			first.urls,
		);
		expect(await revealPublishPath("user-b", first.path.id)).toBeNull();

		const rotated = await rotatePublishPath("user-a", first.path.id);
		expect(rotated).not.toBeNull();
		expect(
			await authenticateMedia({
				action: "publish",
				password: firstSecret,
				path: first.path.slug,
				user: "alpha",
			}),
		).toBe(false);
		expect(
			await authenticateMedia({
				action: "publish",
				password: secondSecret,
				path: second.path.slug,
				user: "alpha",
			}),
		).toBe(true);
	});

	test("links a saved Native URL without rotating it and claims idempotently", async () => {
		const data = await seed();
		const installationId = "3b946de4-bf8b-4d2b-a59e-dc768444eb8d";
		const legacyUrl = `srt://relay.test:8890?streamid=publish:${data.pathA.slug}:alpha:${data.publishA}&pkt_size=1316`;
		const claimed = await claimNativePublishDevice({
			installationId,
			label: "Joni's iPhone",
			legacyUrl,
			userId: "user-a",
		});
		expect(claimed?.path.id).toBe(data.pathA.id);
		expect(claimed?.urls.srt).toContain(`:${data.publishA}&`);
		expect(
			await authenticateMedia({
				action: "publish",
				password: data.publishA,
				path: data.pathA.slug,
				user: "alpha",
			}),
		).toBe(true);

		const repeated = await claimNativePublishDevice({
			installationId,
			label: "ignored",
			userId: "user-a",
		});
		expect(repeated?.path.id).toBe(data.pathA.id);
		expect(repeated?.urls).toEqual(claimed?.urls);
		expect(
			await claimNativePublishDevice({
				installationId: "be6179a6-e470-4dc0-ae94-b21a26451cf7",
				label: "attacker",
				legacyUrl,
				userId: "user-b",
			}),
		).toBeNull();
	});

	test("lets the Native app create its own device after onboarding", async () => {
		const data = await seed();
		await revokePath("user-a", data.pathA.id);

		const onboarding = await completeOnboarding("user-a", {
			software: "visp",
			useCase: "phone_to_obs",
			destination: "twitch",
			advancedMode: false,
			direct: { twitch: false, kick: false, youtube: false },
			prepareObs: false,
			createDevice: false,
		});
		expect(onboarding.urls.publish).toEqual([]);
		expect(await listPaths("user-a")).toHaveLength(0);

		await claimNativePublishDevice({
			installationId: "df01a142-0f32-4e93-a768-c81e95ea5ceb",
			label: "Joni's iPhone",
			userId: "user-a",
		});
		expect(await listPaths("user-a")).toHaveLength(1);
	});

	test("logs streaming clients out when setup is redone with a wipe", async () => {
		await seed();
		await db
			.update(appUser)
			.set({ onboardedAt: new Date() })
			.where(eq(appUser.id, "user-a"));
		await db.insert(authSession).values([
			{
				id: "dashboard-session",
				token: "dashboard-token",
				userId: "user-a",
				expiresAt: new Date(Date.now() + 60_000),
				updatedAt: new Date(),
			},
			{
				id: "streaming-session",
				token: "streaming-token",
				userId: "user-a",
				expiresAt: new Date(Date.now() + 60_000),
				updatedAt: new Date(),
			},
		]);
		const headers = new Headers({ authorization: "Bearer dashboard-token" });
		const session = await auth.api.getSession({ headers });
		if (!session) throw new Error("dashboard session was not created");

		await appRouter
			.createCaller({ auth: null, headers, session })
			.onboarding.complete({
				software: "visp",
				useCase: "phone_to_obs",
				destination: "twitch",
				advancedMode: false,
				direct: { twitch: false, kick: false, youtube: false },
				prepareObs: false,
				createDevice: false,
				redoMode: "wipe",
			});

		const sessions = await db.query.session.findMany({
			where: eq(authSession.userId, "user-a"),
		});
		expect(sessions.map(({ token }) => token)).toEqual(["dashboard-token"]);
	});

	test("clamps reader counts and ignores unknown paths", async () => {
		const data = await seed();
		const authenticatedHook = await app.handle(
			new Request("http://localhost/api/hooks/read", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-hook-secret": process.env.HOOK_SECRET ?? "",
				},
				body: JSON.stringify({ path: data.pathA.slug, readerId: "reader-1" }),
			}),
		);
		expect(authenticatedHook.status).toBe(204);
		expect(await applyPathHook("unread", { path: data.pathA.slug })).toBe(true);
		expect(await applyPathHook("unread", { path: data.pathA.slug })).toBe(true);
		const state = await db.query.pathState.findFirst({
			where: eq(pathState.pathId, data.pathA.id),
		});
		expect(state?.readerCount).toBe(0);
		expect(await applyPathHook("ready", { path: "unknown" })).toBe(false);
	});

	test("tracks relay sessions idempotently across hooks and reconciliation", async () => {
		const data = await seed();
		await applyPathHook("ready", {
			path: data.pathA.slug,
			sourceType: "srtConn",
		});
		await applyPathHook("ready", {
			path: data.pathA.slug,
			sourceType: "srtConn",
		});
		expect(
			await db.query.relayStreamSession.findMany({
				where: eq(relayStreamSession.pathId, data.pathA.id),
			}),
		).toHaveLength(1);

		await applyPathHook("not-ready", { path: data.pathA.slug });
		await applyPathHook("not-ready", { path: data.pathA.slug });
		const [closed] = await db.query.relayStreamSession.findMany({
			where: eq(relayStreamSession.pathId, data.pathA.id),
		});
		expect(closed?.endedAt).toBeInstanceOf(Date);

		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					items: [
						{
							name: data.pathA.slug,
							ready: true,
							source: { type: "rtmpConn" },
						},
					],
				}),
				{ status: 200 },
			)) as unknown as typeof fetch;
		await reconcilePathState("http://relay.test:9997");
		await reconcilePathState("http://relay.test:9997");
		const sessions = await db.query.relayStreamSession.findMany({
			where: eq(relayStreamSession.pathId, data.pathA.id),
		});
		expect(sessions).toHaveLength(2);
		expect(sessions.filter(({ endedAt }) => !endedAt)).toHaveLength(1);
		await db.delete(user).where(eq(user.id, "user-a"));
		expect(
			await db.query.relayStreamSession.findMany({
				where: eq(relayStreamSession.pathId, data.pathA.id),
			}),
		).toHaveLength(0);
	});

	test("announces each stream transition once, however often it is reported", async () => {
		const data = await seed();
		await setBotSettings("user-a", {
			enabled: true,
			commandsEnabled: true,
			prefix: "!",
			targets: { twitch: true, kick: true, youtube: true },
			alerts: { live: true, brb: true, back: true, offline: true },
			messages: { live: null, brb: null, back: null, offline: null },
		});
		// The ready hook fires again on every publisher keepalive, and the
		// reconciler re-reports the same state every ten seconds.
		await applyPathHook("ready", {
			path: data.pathA.slug,
			sourceType: "srtConn",
		});
		await applyPathHook("ready", {
			path: data.pathA.slug,
			sourceType: "srtConn",
		});
		expect(await alertsFor(data.pathA.id, 1)).toEqual(["live"]);

		// BRB is off for this account, so a lost source is the end of the stream.
		await applyPathHook("not-ready", { path: data.pathA.slug });
		await applyPathHook("not-ready", { path: data.pathA.slug });
		expect(await alertsFor(data.pathA.id, 2)).toEqual(["live", "offline"]);

		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ items: [] }), {
				status: 200,
			})) as unknown as typeof fetch;
		await reconcilePathState("http://relay.test:9997");
		await settleAlerts();
		expect(await alertsFor(data.pathA.id, 2)).toEqual(["live", "offline"]);

		// A stream that never announces cannot be told about.
		await setBotSettings("user-b", {
			enabled: false,
			commandsEnabled: true,
			prefix: "!",
			targets: { twitch: true, kick: true, youtube: true },
			alerts: { live: true, brb: true, back: true, offline: true },
			messages: { live: null, brb: null, back: null, offline: null },
		});
		await applyPathHook("ready", {
			path: data.pathB.slug,
			sourceType: "srtConn",
		});
		await settleAlerts();
		expect(
			await db.query.chatBotAlert.findMany({
				where: eq(chatBotAlert.pathId, data.pathB.id),
			}),
		).toHaveLength(0);
	});

	test("holds the stream on a BRB card and says so exactly once", async () => {
		const data = await seed();
		await db
			.update(appUser)
			.set({ brbEnabled: true })
			.where(eq(appUser.id, "user-a"));
		await db
			.update(relayPath)
			.set({ directTwitch: true })
			.where(eq(relayPath.id, data.pathA.id));
		await setBotSettings("user-a", {
			enabled: true,
			commandsEnabled: true,
			prefix: "!",
			targets: { twitch: true, kick: true, youtube: true },
			alerts: { live: true, brb: true, back: true, offline: true },
			messages: { live: null, brb: null, back: null, offline: null },
		});
		await applyPathHook("ready", {
			path: data.pathA.slug,
			sourceType: "srtConn",
		});
		await db
			.update(pathState)
			.set({ directTwitchState: "live" })
			.where(eq(pathState.pathId, data.pathA.id));

		await applyPathHook("not-ready", { path: data.pathA.slug });
		const held = await db.query.pathState.findFirst({
			where: eq(pathState.pathId, data.pathA.id),
		});
		expect(held?.brbSince).toBeInstanceOf(Date);

		// The reconciler re-reports the same missing source every tick; the card
		// keeps its original drop time and chat is not told twice.
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ items: [] }), {
				status: 200,
			})) as unknown as typeof fetch;
		await reconcilePathState("http://relay.test:9997");
		const stillHeld = await db.query.pathState.findFirst({
			where: eq(pathState.pathId, data.pathA.id),
		});
		expect(stillHeld?.brbSince?.getTime()).toBe(held?.brbSince?.getTime());
		await settleAlerts();
		expect(
			(
				await db.query.chatBotAlert.findMany({
					where: eq(chatBotAlert.pathId, data.pathA.id),
				})
			)
				.map((row) => row.event)
				.sort(),
		).toEqual(["brb", "live"]);
	});

	test("protects admin data and lets a break-glass admin ban users", async () => {
		await seed();
		await db.insert(user).values({
			id: "break-glass-admin",
			name: "Admin",
			email: "admin@example.test",
		});
		await db.insert(authSession).values([
			{
				id: "user-session",
				token: "user-token",
				userId: "user-a",
				expiresAt: new Date(Date.now() + 60_000),
				updatedAt: new Date(),
			},
			{
				id: "admin-session",
				token: "admin-token",
				userId: "break-glass-admin",
				expiresAt: new Date(Date.now() + 60_000),
				updatedAt: new Date(),
			},
		]);

		const userHeaders = new Headers({ authorization: "Bearer user-token" });
		const userSession = await auth.api.getSession({ headers: userHeaders });
		if (!userSession) throw new Error("user session was not created");
		await expect(
			appRouter
				.createCaller({
					auth: null,
					headers: userHeaders,
					session: userSession,
				})
				.admin.overview(),
		).rejects.toMatchObject({ code: "FORBIDDEN" });

		const adminHeaders = new Headers({ authorization: "Bearer admin-token" });
		const adminSession = await auth.api.getSession({ headers: adminHeaders });
		if (!adminSession) throw new Error("admin session was not created");
		const caller = appRouter.createCaller({
			auth: null,
			headers: adminHeaders,
			session: adminSession,
		});
		expect((await caller.admin.overview()).totalUsers).toBe(3);
		await applyPathHook("ready", {
			path: "alpha-1",
			sourceType: "srtConn",
		});
		const listed = await caller.admin.users.list({
			query: "Alpha",
			usage: "live",
			limit: 50,
		});
		expect(listed.items).toHaveLength(1);
		expect(listed.items[0]?.id).toBe("user-a");
		const detail = await caller.admin.users.get({ userId: "user-a" });
		expect(detail.usage).toMatchObject({
			everStreamed: true,
			live: true,
			trackedSessions: 1,
		});
		const streams = await caller.admin.users.streams({
			userId: "user-a",
			limit: 50,
		});
		expect(streams.items[0]).toMatchObject({
			deviceLabel: "main",
			live: true,
			sourceType: "srtConn",
		});
		await caller.admin.users.setRole({
			userId: "break-glass-admin",
			role: "admin",
		});
		expect(
			(await auth.api.getSession({ headers: adminHeaders }))?.user.role,
		).toBe("admin");
		await expect(
			auth.api.removeUser({
				body: { userId: "user-b" },
				headers: adminHeaders,
			}),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
		await caller.admin.users.ban({
			userId: "user-a",
			reason: "integration test",
		});
		expect(
			await db.query.session.findMany({
				where: eq(authSession.userId, "user-a"),
			}),
		).toHaveLength(0);
		expect(
			(
				await db.query.user.findFirst({
					where: eq(user.id, "user-a"),
				})
			)?.banned,
		).toBe(true);
	});

	test("issues snapshot uploads only for live paths", async () => {
		const data = await seed();
		const requestUpload = (
			path: string,
			secret = process.env.HOOK_SECRET ?? "",
		) =>
			app.handle(
				new Request(`http://localhost/api/hooks/snapshot-upload/${path}`, {
					method: "POST",
					headers: { "x-hook-secret": secret },
				}),
			);

		expect((await requestUpload(data.pathA.slug, "wrong-secret")).status).toBe(
			401,
		);
		expect((await requestUpload(data.pathA.slug)).status).toBe(404);

		await applyPathHook("ready", { path: data.pathA.slug });
		const live = await requestUpload(data.pathA.slug);
		expect(live.status).toBe(200);
		expect(new URL(await live.text()).pathname).toEndWith(
			`/${snapshotKey(data.pathA.id)}`,
		);

		await applyPathHook("not-ready", { path: data.pathA.slug });
		expect((await requestUpload(data.pathA.slug)).status).toBe(404);
		await revokePath("user-a", data.pathA.id);
		expect((await requestUpload(data.pathA.slug)).status).toBe(404);
	});

	test("lists only the owner's fresh live snapshots", async () => {
		const data = await seed();
		const stale = await createPath("user-a", "stale camera");
		const missing = await createPath("user-a", "missing camera");
		for (const path of [data.pathA, data.pathB, stale, missing]) {
			await applyPathHook("ready", { path: path.slug });
		}

		const client = {
			presign: (path: string) => `https://signed.test/${path}`,
			stat: async (path: string) => {
				if (path === snapshotKey(missing.id)) throw new Error("not found");
				return {
					etag: "etag",
					lastModified:
						path === snapshotKey(stale.id)
							? new Date(Date.now() - 121_000)
							: new Date(),
					size: 100,
					type: "image/jpeg",
				};
			},
		} as unknown as Parameters<typeof listSnapshots>[1];
		const snapshots = await listSnapshots("user-a", client);

		expect(snapshots.map((snapshot) => snapshot.pathId)).toEqual([
			data.pathA.id,
			stale.id,
			missing.id,
		]);
		expect(snapshots[0]?.url).toBe(
			`https://signed.test/${snapshotKey(data.pathA.id)}`,
		);
		expect(snapshots[1]).toMatchObject({
			capturedAt: expect.any(String),
			url: null,
		});
		expect(snapshots[2]).toMatchObject({ capturedAt: null, url: null });
	});

	test("delivers and acknowledges authenticated OBS commands", async () => {
		await seed();
		const pairing = await rotateObsControlToken("user-a");
		await setObsStreaming("user-a", true);
		const command = await app.handle(
			new Request("http://localhost/api/obs/control", {
				method: "POST",
				headers: {
					authorization: `Bearer ${pairing.token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					appliedVersion: 0,
					streaming: false,
					scenes: ["Main", "Be right back"],
					currentScene: "Main",
				}),
			}),
		);
		expect(command.status).toBe(200);
		expect(await command.json()).toMatchObject({
			commandVersion: 1,
			desiredStreaming: true,
			desiredScene: null,
		});
		expect(await setObsScene("user-a", "Missing")).toBeNull();
		expect(await setObsScene("user-a", "Be right back")).toMatchObject({
			desiredScene: "Be right back",
			pending: true,
		});

		await app.handle(
			new Request("http://localhost/api/obs/control", {
				method: "POST",
				headers: {
					authorization: `Bearer ${pairing.token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					appliedVersion: 2,
					streaming: true,
					scenes: ["Main", "Be right back"],
					currentScene: "Be right back",
				}),
			}),
		);
		expect(await getObsControlStatus("user-a")).toMatchObject({
			connected: true,
			currentScene: "Be right back",
			desiredScene: "Be right back",
			pending: false,
			scenes: ["Main", "Be right back"],
			streaming: true,
		});
		await app.handle(
			new Request("http://localhost/api/obs/control", {
				method: "POST",
				headers: {
					authorization: `Bearer ${pairing.token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					appliedVersion: 2,
					streaming: true,
					scenes: ["Main", "Renamed scene"],
					currentScene: "Main",
				}),
			}),
		);
		expect(await getObsControlStatus("user-a")).toMatchObject({
			currentScene: "Main",
			desiredScene: "Main",
			pending: false,
			scenes: ["Main", "Renamed scene"],
		});

		await rotateObsControlToken("user-a");
		expect(await getObsControlStatus("user-a")).toMatchObject({
			currentScene: null,
			desiredScene: null,
			scenes: [],
		});
	});

	test("authenticates and pushes commands over the OBS WebSocket", async () => {
		await seed();
		const pairing = await rotateObsControlToken("user-a");
		const liveApp = new Elysia({ adapter: nodeAdapter }).use(obsLiveRoutes);
		const liveServer = await new Promise<NonNullable<typeof liveApp.server>>(
			(resolve, reject) => {
				try {
					liveApp.listen(
						{
							hostname: "127.0.0.1",
							port: 0,
						},
						(server) => resolve(server),
					);
				} catch (error) {
					reject(error);
				}
			},
		);
		try {
			const address = (
				liveServer as unknown as {
					raw?: { bun?: { server?: { address?: { port?: number } } } };
				}
			).raw?.bun?.server?.address;
			const port = address?.port;
			if (!port) throw new Error("OBS live test server did not start");
			const ticketResponse = await fetch(
				`http://127.0.0.1:${port}/api/obs/live-ticket`,
				{
					method: "POST",
					headers: { authorization: `Bearer ${pairing.token}` },
				},
			);
			expect(ticketResponse.status).toBe(200);
			const { ticket } = (await ticketResponse.json()) as { ticket: string };
			const socket = new WebSocket(
				`ws://127.0.0.1:${port}/api/obs/live?ticket=${encodeURIComponent(ticket)}`,
			);
			const messages: Array<(value: Record<string, unknown>) => void> = [];
			const buffered: Record<string, unknown>[] = [];
			socket.onmessage = ({ data }) => {
				const value = JSON.parse(String(data)) as Record<string, unknown>;
				const resolve = messages.shift();
				if (resolve) resolve(value);
				else buffered.push(value);
			};
			const nextMessage = () => {
				const value = buffered.shift();
				return value
					? Promise.resolve(value)
					: new Promise<Record<string, unknown>>((resolve) =>
							messages.push(resolve),
						);
			};
			await new Promise<void>((resolve, reject) => {
				socket.onopen = () => resolve();
				socket.onerror = () => reject(new Error("OBS WebSocket did not open"));
			});
			expect(await nextMessage()).toMatchObject({ commandVersion: 0 });

			socket.send(
				JSON.stringify({
					appliedVersion: 0,
					streaming: false,
					scenes: ["Main"],
					currentScene: "Main",
				}),
			);
			expect(await nextMessage()).toMatchObject({ commandVersion: 0 });
			await setObsStreaming("user-a", true);
			expect(await nextMessage()).toMatchObject({
				commandVersion: 1,
				desiredStreaming: true,
			});
			socket.close();
		} finally {
			liveServer.stop(true);
		}
	});

	test("authorizes OBS in the browser and scopes device management to its owner", async () => {
		const data = await seed();
		const revoked = await createPath("user-a", "revoked");
		await revokePath("user-a", revoked.id);
		for (const request of [
			new Request("http://localhost/api/obs/devices"),
			new Request("http://localhost/api/obs/devices", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ label: "Unauthorized" }),
			}),
			new Request(`http://localhost/api/obs/devices/${data.pathA.id}/source`, {
				method: "POST",
			}),
		]) {
			expect((await app.handle(request)).status).toBe(401);
		}
		await db.insert(authSession).values({
			id: "browser-session",
			token: "browser-session-token",
			userId: "user-a",
			expiresAt: new Date(Date.now() + 60_000),
			updatedAt: new Date(),
		});

		const authRequest = (
			path: string,
			body?: Record<string, unknown>,
			authorization?: string,
		) =>
			auth.handler(
				new Request(`http://127.0.0.1:3000/api/auth${path}`, {
					method: body ? "POST" : "GET",
					headers: {
						...(authorization ? { authorization } : {}),
						...(body ? { "content-type": "application/json" } : {}),
					},
					body: body ? JSON.stringify(body) : undefined,
				}),
			);

		const codeResponse = await authRequest("/device/code", {
			client_id: "visp-obs",
			scope: "obs",
		});
		expect(codeResponse.status).toBe(200);
		expect(
			(
				await authRequest("/device/code", {
					client_id: "untrusted-client",
					scope: "obs",
				})
			).status,
		).toBe(400);
		const code = (await codeResponse.json()) as {
			device_code: string;
			user_code: string;
		};
		const browserAuthorization = "Bearer browser-session-token";
		expect(
			(
				await authRequest(
					`/device?user_code=${encodeURIComponent(code.user_code)}`,
					undefined,
					browserAuthorization,
				)
			).status,
		).toBe(200);
		expect(
			(
				await authRequest(
					"/device/approve",
					{ userCode: code.user_code },
					browserAuthorization,
				)
			).status,
		).toBe(200);
		const tokenResponse = await authRequest("/device/token", {
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			device_code: code.device_code,
			client_id: "visp-obs",
		});
		expect(tokenResponse.status).toBe(200);
		const temporary = (await tokenResponse.json()) as { access_token: string };

		const connect = await app.handle(
			new Request("http://localhost/api/obs/connect", {
				method: "POST",
				headers: { authorization: `Bearer ${temporary.access_token}` },
			}),
		);
		expect(connect.status).toBe(200);
		const connected = (await connect.json()) as {
			token: string;
			controlUrl: string;
		};
		expect(connected.controlUrl).toBe(
			new URL("/api/obs/control", process.env.BETTER_AUTH_URL).toString(),
		);
		expect(
			await db.query.session.findFirst({
				where: eq(authSession.token, temporary.access_token),
			}),
		).toBeUndefined();

		const list = await app.handle(
			new Request("http://localhost/api/obs/devices", {
				headers: { authorization: `Bearer ${connected.token}` },
			}),
		);
		expect(list.status).toBe(200);
		expect(await list.json()).toMatchObject({
			account: { handle: "alpha" },
			devices: [{ id: data.pathA.id, label: "main" }],
		});

		const forbidden = await app.handle(
			new Request(`http://localhost/api/obs/devices/${data.pathB.id}/source`, {
				method: "POST",
				headers: { authorization: `Bearer ${connected.token}` },
			}),
		);
		expect(forbidden.status).toBe(404);

		const legacyHash = await db.query.appUser.findFirst({
			columns: { readSecretHash: true },
			where: eq(appUser.id, "user-a"),
		});
		if (!legacyHash) throw new Error("seeded relay user is missing");
		const legacySource = await app.handle(
			new Request(`http://localhost/api/obs/devices/${data.pathA.id}/source`, {
				method: "POST",
				headers: { authorization: `Bearer ${connected.token}` },
			}),
		);
		expect(legacySource.status).toBe(409);
		expect(
			await db.query.appUser.findFirst({
				columns: { readSecretEncrypted: true, readSecretHash: true },
				where: eq(appUser.id, "user-a"),
			}),
		).toEqual({
			readSecretEncrypted: null,
			readSecretHash: legacyHash.readSecretHash,
		});

		await db
			.update(appUser)
			.set({ readSecretHash: null })
			.where(eq(appUser.id, "user-a"));
		const source = await app.handle(
			new Request(`http://localhost/api/obs/devices/${data.pathA.id}/source`, {
				method: "POST",
				headers: { authorization: `Bearer ${connected.token}` },
			}),
		);
		expect(source.status).toBe(200);
		expect(await source.json()).toMatchObject({
			pathId: data.pathA.id,
			source: {
				id: "ffmpeg_source",
				settings: { visp_path_id: String(data.pathA.id) },
			},
		});

		const created = await app.handle(
			new Request("http://localhost/api/obs/devices", {
				method: "POST",
				headers: {
					authorization: `Bearer ${connected.token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ label: "OBS" }),
			}),
		);
		expect(created.status).toBe(200);
		expect(await created.json()).toMatchObject({
			path: { label: "OBS" },
			urls: { srt: expect.stringContaining("streamid=publish:") },
		});

		expect(
			(
				await app.handle(
					new Request("http://localhost/api/obs/disconnect", {
						method: "POST",
						headers: { authorization: `Bearer ${connected.token}` },
					}),
				)
			).status,
		).toBe(204);
		expect(
			(
				await app.handle(
					new Request("http://localhost/api/obs/devices", {
						headers: { authorization: `Bearer ${connected.token}` },
					}),
				)
			).status,
		).toBe(401);
	});

	test("reconciles drift and preserves timestamps when the API fails", async () => {
		const data = await seed();
		const oldTimestamp = new Date("2024-01-01T00:00:00.000Z");
		await db.insert(pathState).values({
			pathId: data.pathA.id,
			publishing: false,
			readerCount: 0,
			lastEventAt: oldTimestamp,
		});
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					items: [
						{
							name: data.pathA.slug,
							ready: true,
							readers: [{ id: "reader" }],
							source: { type: "srtConn" },
						},
					],
				}),
				{ status: 200 },
			)) as unknown as typeof fetch;
		await reconcilePathState("http://relay.test:9997");
		const reconciled = await db.query.pathState.findFirst({
			where: eq(pathState.pathId, data.pathA.id),
		});
		expect(reconciled).toMatchObject({ publishing: true, readerCount: 1 });

		const reconciledAt = reconciled?.lastEventAt;
		globalThis.fetch = (async () =>
			new Response("down", { status: 503 })) as unknown as typeof fetch;
		await reconcilePathState("http://relay.test:9997");
		const preserved = await db.query.pathState.findFirst({
			where: eq(pathState.pathId, data.pathA.id),
		});
		expect(preserved?.lastEventAt).toEqual(reconciledAt);
	});

	test("reconciles healthy relays without clearing a failed relay", async () => {
		const data = await seed();
		const [defaultRelay] = await db
			.update(relay)
			.set({ apiUrl: "http://relay-one.test:9997" })
			.where(eq(relay.name, "default"))
			.returning();
		const [secondRelay] = await db
			.insert(relay)
			.values({
				name: "integration-two",
				host: "relay-two.test",
				apiUrl: "http://relay-two.test:9997",
				pingUrl: "https://relay-two.test/ping",
				region: "test-two",
				capacityPaths: 10,
				maxForwarders: 2,
				publicIp: "192.0.2.2",
			})
			.onConflictDoUpdate({
				target: relay.name,
				set: {
					apiUrl: "http://relay-two.test:9997",
					enabled: true,
					drainedAt: null,
				},
			})
			.returning();
		if (!defaultRelay || !secondRelay) throw new Error("test relays missing");
		await db
			.update(relayPath)
			.set({ relayId: secondRelay.id })
			.where(eq(relayPath.id, data.pathB.id));
		const oldTimestamp = new Date("2024-01-01T00:00:00.000Z");
		await db.insert(pathState).values({
			pathId: data.pathB.id,
			publishing: true,
			readerCount: 1,
			lastEventAt: oldTimestamp,
		});
		globalThis.fetch = (async (input) => {
			const url = String(input);
			if (url.startsWith(defaultRelay.apiUrl)) {
				return new Response(
					JSON.stringify({
						items: [{ name: data.pathA.slug, ready: true }],
					}),
					{ status: 200 },
				);
			}
			return new Response("down", { status: 503 });
		}) as typeof fetch;

		await reconcilePathState();

		expect(
			await db.query.pathState.findFirst({
				where: eq(pathState.pathId, data.pathA.id),
			}),
		).toMatchObject({ publishing: true });
		expect(
			await db.query.pathState.findFirst({
				where: eq(pathState.pathId, data.pathB.id),
			}),
		).toMatchObject({ publishing: true, lastEventAt: oldTimestamp });
	});

	test("ranks preferred, colocated, and least-loaded relays and excludes unavailable ones", async () => {
		await db
			.update(relay)
			.set({ enabled: false })
			.where(ne(relay.name, "default"));
		const data = await seed();
		const created = await db
			.insert(relay)
			.values([
				{
					name: "ranking-a",
					host: "ranking-a.test",
					apiUrl: "http://ranking-a.test:9997",
					pingUrl: "https://ranking-a.test/ping",
					region: "a",
					capacityPaths: 10,
					maxForwarders: 2,
					publicIp: "192.0.2.10",
				},
				{
					name: "ranking-b",
					host: "ranking-b.test",
					apiUrl: "http://ranking-b.test:9997",
					pingUrl: "https://ranking-b.test/ping",
					region: "b",
					capacityPaths: 1,
					maxForwarders: 2,
					publicIp: "192.0.2.11",
				},
			])
			.onConflictDoUpdate({
				target: relay.name,
				set: { enabled: true, drainedAt: null },
			})
			.returning();
		const [relayA, relayB] = created;
		if (!relayA || !relayB) throw new Error("ranking relays missing");

		expect((await chooseRelay("new-user", relayB.id))?.id).toBe(relayB.id);
		expect((await chooseRelay("user-a"))?.id).toBe(data.pathA.relayId);
		expect((await chooseRelay("new-user"))?.id).toBe(relayA.id);

		await db
			.update(relay)
			.set({ drainedAt: new Date() })
			.where(eq(relay.id, relayA.id));
		await db
			.update(relayPath)
			.set({ relayId: relayB.id })
			.where(eq(relayPath.id, data.pathB.id));
		expect((await chooseRelay("new-user"))?.id).toBe(data.pathA.relayId);
	});

	test("allocates concurrent monotonic sequences and never reuses revoked ones", async () => {
		const data = await seed();
		const [second, third] = await Promise.all([
			createPath("user-a", "second"),
			createPath("user-a", "third"),
		]);
		expect([second.seq, third.seq].sort()).toEqual([2, 3]);
		await revokePath("user-a", second.id);
		const fourth = await createPath("user-a", "fourth");
		expect(fourth.seq).toBe(4);
		expect(data.pathA.seq).toBe(1);
	});

	test("rejects the N+1 path through tRPC and OBS device creation", async () => {
		await seed();
		for (let index = 2; index <= 10; index += 1) {
			await createPath("user-a", `device-${index}`);
		}
		await db.insert(authSession).values({
			id: "quota-session",
			token: "quota-token",
			userId: "user-a",
			expiresAt: new Date(Date.now() + 60_000),
			updatedAt: new Date(),
		});
		const headers = new Headers({ authorization: "Bearer quota-token" });
		const session = await auth.api.getSession({ headers });
		if (!session) throw new Error("quota session missing");
		await expect(
			appRouter
				.createCaller({ auth: null, headers, session })
				.paths.create({ label: "too-many" }),
		).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

		const pairing = await rotateObsControlToken("user-a");
		const response = await app.handle(
			new Request("http://localhost/api/obs/devices", {
				method: "POST",
				headers: {
					authorization: `Bearer ${pairing.token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ label: "still-too-many" }),
			}),
		);
		expect(response.status).toBe(429);
	});

	test("provisions relay users from Twitch, Kick, Google, and linked accounts", async () => {
		await db.insert(user).values([
			{ id: "twitch-only", name: "Twitch Only", email: "twitch@example.test" },
			{ id: "kick-only", name: "Kick Only", email: "kick@example.test" },
			{ id: "google-only", name: "Google Only", email: "google@example.test" },
			{ id: "linked", name: "Linked", email: "linked@example.test" },
		]);
		await db.insert(account).values([
			{
				id: "account-twitch",
				accountId: "twitch-1",
				providerId: "twitch",
				userId: "twitch-only",
			},
			{
				id: "account-kick",
				accountId: "kick-1",
				providerId: "kick",
				userId: "kick-only",
			},
			{
				id: "account-google",
				accountId: "google-1",
				providerId: "google",
				userId: "google-only",
			},
			{
				id: "account-linked-twitch",
				accountId: "twitch-2",
				providerId: "twitch",
				userId: "linked",
			},
			{
				id: "account-linked-kick",
				accountId: "kick-2",
				providerId: "kick",
				userId: "linked",
			},
		]);

		const provisioned = await Promise.all([
			ensureRelayUser("twitch-only", "Twitch Only"),
			ensureRelayUser("kick-only", "Kick Only"),
			ensureRelayUser("google-only", "Google Only"),
			ensureRelayUser("linked", "Linked"),
		]);
		expect(provisioned.map(({ id }) => id).sort()).toEqual([
			"google-only",
			"kick-only",
			"linked",
			"twitch-only",
		]);
		for (const owner of provisioned) {
			const paths = await db.query.relayPath.findMany({
				where: eq(relayPath.userId, owner.id),
			});
			expect(paths).toHaveLength(1);
		}
	});

	test("scopes the chat overlay token to its owner and drops it on revoke", async () => {
		await seed();
		const { token } = await issueChatOverlayToken("user-a");
		expect(await authenticateChatOverlayToken(token)).toBe("user-a");

		const [id, secret] = token.split(".");
		expect(
			await authenticateChatOverlayToken(`${id}.${"0".repeat(64)}`),
		).toBeNull();
		expect(
			await authenticateChatOverlayToken(`${"0".repeat(24)}.${secret}`),
		).toBeNull();

		// Reissuing invalidates the URL already pasted into OBS.
		const reissued = await issueChatOverlayToken("user-a");
		expect(await authenticateChatOverlayToken(token)).toBeNull();
		expect(await authenticateChatOverlayToken(reissued.token)).toBe("user-a");

		// The OBS control pairing is a separate credential and survives.
		const pairing = await rotateObsControlToken("user-a");
		expect(await authenticateChatOverlayToken(reissued.token)).toBe("user-a");
		expect(await revokeChatOverlayToken("user-a")).toBe(true);
		expect(await authenticateChatOverlayToken(reissued.token)).toBeNull();
		expect((await getObsControlStatus("user-a")).configured).toBeTrue();
		expect(pairing.token).not.toBe(reissued.token);
	});

	test("enables and disables Twitch and Kick chat without persisting messages", async () => {
		await db.insert(user).values({
			id: "chat-user",
			name: "Chat User",
			email: "chat@example.test",
		});
		await db.insert(account).values([
			{
				id: "chat-twitch",
				accountId: "twitch-chat",
				providerId: "twitch",
				scope: "user:read:chat",
				userId: "chat-user",
			},
			{
				id: "chat-kick",
				accountId: "12345",
				providerId: "kick",
				scope: "user:read",
				userId: "chat-user",
			},
		]);
		globalThis.fetch = (async (input, init) => {
			const url = String(input);
			if (url === "https://id.kick.com/oauth/token") {
				return Response.json({ access_token: "app-token", expires_in: 3600 });
			}
			if (url.endsWith("/events/subscriptions") && init?.method === "POST") {
				const body = JSON.parse(String(init.body)) as {
					events: Array<{ name: string }>;
				};
				return Response.json({
					data: body.events.map(({ name }, index) => ({
						name,
						subscription_id: `kick-subscription-${index}`,
					})),
				});
			}
			if (url.endsWith("/events/subscriptions") && !init?.method) {
				return Response.json({ data: [] });
			}
			if (url.includes("/events/subscriptions?") && init?.method === "DELETE") {
				return new Response(null, { status: 204 });
			}
			return new Response(null, { status: 500 });
		}) as typeof fetch;

		await enableChatConnection("chat-user", "twitch");
		await enableChatConnection("chat-user", "kick");
		expect(await listChatConnections("chat-user")).toEqual([
			{
				provider: "twitch",
				linked: true,
				enabled: true,
				grantedScopes: ["user:read:chat"],
				needsConsent: false,
				needsAlertConsent: true,
				canManageChannel: false,
				canReadStreamKey: false,
			},
			{
				provider: "kick",
				linked: true,
				enabled: true,
				grantedScopes: ["user:read"],
				needsConsent: false,
				needsAlertConsent: false,
				canManageChannel: false,
				canReadStreamKey: false,
			},
			{
				provider: "youtube",
				linked: false,
				enabled: false,
				grantedScopes: [],
				needsConsent: false,
				needsAlertConsent: false,
				canManageChannel: false,
				canReadStreamKey: false,
			},
		]);
		expect(await db.select().from(chatConnection)).toHaveLength(2);

		await disableChatConnection("chat-user", "twitch");
		await disableChatConnection("chat-user", "kick");
		expect(await db.select().from(chatConnection)).toHaveLength(0);
	});

	test("reconciles Kick subscriptions and drops disabled broadcasters", async () => {
		await db.insert(user).values({
			id: "kick-reconcile",
			name: "Kick Reconcile",
			email: "kick-reconcile@example.test",
		});
		await db.insert(account).values({
			id: "kick-reconcile-account",
			accountId: "67890",
			providerId: "kick",
			scope: "user:read",
			userId: "kick-reconcile",
		});
		await db.insert(chatConnection).values({
			provider: "kick",
			userId: "kick-reconcile",
		});
		globalThis.fetch = (async (input, init) => {
			const url = String(input);
			if (url === "https://id.kick.com/oauth/token") {
				return Response.json({ access_token: "app-token", expires_in: 3600 });
			}
			if (url.endsWith("/events/subscriptions") && !init?.method) {
				return Response.json({ data: [] });
			}
			if (url.endsWith("/events/subscriptions") && init?.method === "POST") {
				const body = JSON.parse(String(init.body)) as {
					events: Array<{ name: string }>;
				};
				return Response.json({
					data: body.events.map(({ name }, index) => ({
						name,
						subscription_id:
							name === "chat.message.sent"
								? "reconciled-sub"
								: `reconciled-alert-${index}`,
					})),
				});
			}
			return new Response(null, { status: 500 });
		}) as typeof fetch;

		await reconcileKickSubscriptions();
		const enabled = await db.query.chatConnection.findFirst({
			where: eq(chatConnection.userId, "kick-reconcile"),
		});
		expect(enabled?.kickSubscriptionId).toBe("reconciled-sub");

		const events: ChatLiveEvent[] = [];
		const unsubscribe = chatHub.subscribe("kick-reconcile", (event) =>
			events.push(event),
		);
		const payload = {
			broadcaster: { user_id: 67890 },
			content: "Hello",
			created_at: "2026-07-17T10:00:00.000Z",
			message_id: "kick-message",
			sender: { user_id: 12, username: "Viewer" },
		};
		expect(await handleVerifiedKickPayload(payload)).toBe("accepted");
		expect(
			events.some(
				(event) =>
					event.type === "message" && event.message.id === "kick-message",
			),
		).toBe(true);
		expect(
			await handleVerifiedKickPayload(
				{
					broadcaster: { user_id: 67890 },
					follower: { username: "Follower" },
				},
				"channel.followed",
				"kick-follow",
				"2026-07-17T10:00:00.000Z",
			),
		).toBe("accepted");
		expect(
			events.some(
				(event) => event.type === "alert" && event.alert.id === "kick-follow",
			),
		).toBe(true);

		await db
			.delete(chatConnection)
			.where(eq(chatConnection.userId, "kick-reconcile"));
		expect(await handleVerifiedKickPayload(payload)).toBe("disabled");
		unsubscribe();
	});
});

integration("VISP Direct boundaries", () => {
	beforeEach(async () => {
		clearAuthCacheForTests();
		await db.delete(user);
		await ensureDefaultRelay();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	async function callerFor(userId: string) {
		await db.insert(authSession).values({
			id: `${userId}-direct-session`,
			token: `${userId}-direct-token`,
			userId,
			expiresAt: new Date(Date.now() + 60_000),
			updatedAt: new Date(),
		});
		const headers = new Headers({
			authorization: `Bearer ${userId}-direct-token`,
		});
		const session = await auth.api.getSession({ headers });
		if (!session) throw new Error(`no session for ${userId}`);
		return appRouter.createCaller({ auth: null, headers, session });
	}

	async function seedDirect() {
		const data = await seed();
		// ensureRelayUser refuses accounts with no streaming provider linked.
		await db.insert(account).values([
			{
				id: "direct-twitch-a",
				accountId: "tw-a",
				providerId: "twitch",
				scope: "user:read:email openid channel:read:stream_key",
				userId: "user-a",
			},
			{
				id: "direct-kick-a",
				accountId: "42",
				providerId: "kick",
				scope: "user:read channel:write streamkey:read channel:read",
				userId: "user-a",
			},
			{
				id: "direct-google-a",
				accountId: "google-a",
				providerId: "google",
				scope: "openid https://www.googleapis.com/auth/youtube.force-ssl",
				userId: "user-a",
			},
			{
				id: "direct-twitch-b",
				accountId: "tw-b",
				providerId: "twitch",
				scope: "user:read:email openid",
				userId: "user-b",
			},
		]);
		return data;
	}

	let youtubeBroadcastCreates = 0;
	// Completing a broadcast cannot be undone, so BRB must never trigger one.
	let youtubeBroadcastCompletes = 0;
	const providerFetch = (async (
		input: Parameters<typeof fetch>[0],
		init?: RequestInit,
	) => {
		const url = String(input);
		if (url.includes("/streams/key"))
			return Response.json({ data: [{ stream_key: "live_a_secret" }] });
		if (url.includes("/channels"))
			return Response.json({
				data: [
					{ stream: { url: "rtmps://stream.kick.com/99", key: "kick_secret" } },
				],
			});
		if (url.includes("/liveStreams?part=snippet"))
			return Response.json({
				id: "youtube-stream",
				cdn: {
					ingestionInfo: {
						rtmpsIngestionAddress: "rtmps://a.rtmp.youtube.com/live2",
						streamName: "youtube_secret",
					},
				},
			});
		if (url.includes("/liveStreams?part=cdn"))
			return Response.json({
				items: [
					{
						id: "youtube-stream",
						cdn: {
							ingestionInfo: {
								rtmpsIngestionAddress: "rtmps://a.rtmp.youtube.com/live2",
								streamName: "youtube_secret",
							},
						},
					},
				],
			});
		if (url.includes("/liveBroadcasts?part=status"))
			return Response.json({
				items: [
					{
						id: "youtube-broadcast",
						contentDetails: { boundStreamId: "youtube-stream" },
						status: { lifeCycleStatus: "ready" },
					},
				],
			});
		if (url.includes("/liveBroadcasts?part=")) {
			if (init?.method === "POST") youtubeBroadcastCreates += 1;
			return Response.json({ id: "youtube-broadcast" });
		}
		if (url.includes("/liveBroadcasts/bind"))
			return Response.json({ id: "youtube-broadcast" });
		if (url.includes("/liveBroadcasts/transition")) {
			if (url.includes("broadcastStatus=complete"))
				youtubeBroadcastCompletes += 1;
			return Response.json({ id: "youtube-broadcast" });
		}
		return new Response(null, { status: 404 });
	}) as typeof fetch;

	const directDeps = (maxForwarders = 4) => ({
		fetch: providerFetch,
		getAccessToken: async () => ({ accessToken: "provider-token" }),
		maxForwarders,
	});

	test("Direct is open and an existing user starts unconfigured", async () => {
		const data = await seedDirect();
		const caller = await callerFor("user-a");
		expect((await caller.direct.list()).mode).toBe("unconfigured");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		expect((await caller.direct.list()).mode).toBe("direct");
		const [path] = await db
			.select()
			.from(relayPath)
			.where(eq(relayPath.id, data.pathA.id));
		expect(path?.directTwitch).toBe(true);
	});

	test("new onboarding stores Direct intent without assigning a device", async () => {
		await seedDirect();
		const caller = await callerFor("user-a");
		const result = await caller.onboarding.complete({
			software: "visp",
			useCase: "direct",
			destination: "twitch",
			advancedMode: false,
			direct: { twitch: true, kick: false, youtube: false },
			prepareObs: false,
			createDevice: false,
		});
		expect(result.urls.read).toEqual([]);
		expect(result.sceneCollection).toBeNull();
		expect((await caller.direct.list()).desired).toEqual({
			twitch: true,
			kick: false,
			youtube: false,
		});
		expect((await caller.direct.list()).ownerPathId.twitch).toBeNull();
	});

	test("explicit OBS-only mode persists", async () => {
		const data = await seedDirect();
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: false,
			kick: false,
			youtube: false,
		});
		expect((await caller.direct.list()).mode).toBe("obs");
	});

	test("a path without a reservation receives no relay destination URLs", async () => {
		const data = await seedDirect();
		await db
			.update(relayPath)
			.set({ directTwitch: true, directKick: true })
			.where(eq(relayPath.id, data.pathA.id));

		const resolved = await resolveDirectDestinations("alpha-1", directDeps());
		expect(resolved.destinations).toEqual([]);

		const [state] = await db
			.select()
			.from(pathState)
			.where(eq(pathState.pathId, data.pathA.id));
		expect(state?.directTwitchState).toBe("failed");
		expect(state?.directTwitchError).toBe(
			"Direct reservation expired, reconnect the publisher",
		);
	});

	test("returns reserved destination URLs and never a bare key", async () => {
		const data = await seedDirect();
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: true,
			youtube: false,
		});
		await prepareDirect("user-a", data.pathA.id);

		const { destinations } = await resolveDirectDestinations(
			"alpha-1",
			directDeps(),
		);
		expect(destinations).toEqual([
			{
				filter: null,
				provider: "twitch",
				role: "landscape",
				url: "rtmps://ingest.global-contribute.live-video.net/app/live_a_secret",
			},
			{
				filter: null,
				provider: "kick",
				role: "landscape",
				url: "rtmps://stream.kick.com/99/kick_secret",
			},
		]);

		// The key is built in memory and never stored as its own value.
		const [state] = await db
			.select()
			.from(pathState)
			.where(eq(pathState.pathId, data.pathA.id));
		expect(JSON.stringify(state)).not.toContain("live_a_secret");
		expect(JSON.stringify(state)).not.toContain("kick_secret");
		expect(state?.directTwitchState).toBe("starting");
	});

	test("starts landscape passthrough and portrait crop as separate slots", async () => {
		const data = await seedDirect();
		await db
			.update(appUser)
			.set({ directDualOutput: true })
			.where(eq(appUser.id, "user-a"));
		await db.update(relay).set({ maxForwarders: 2 });
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		await caller.direct.setRole({
			pathId: data.pathA.id,
			provider: "kick",
			role: "portrait",
		});
		await prepareDirect("user-a", data.pathA.id);

		const { destinations } = await resolveDirectDestinations(
			"alpha-1",
			directDeps(),
		);
		expect(
			destinations.map(({ provider, role, filter }) => ({
				provider,
				role,
				filter,
			})),
		).toEqual([
			{ provider: "twitch", role: "landscape", filter: null },
			{
				provider: "kick",
				role: "portrait",
				filter: "crop=iw*0.3164:ih*1:iw*0.3418:ih*0,scale=1080:1920",
			},
		]);
	});

	test("keeps old relay output compatible while v2 carries portrait geometry", async () => {
		const data = await seedDirect();
		await db
			.update(appUser)
			.set({ directDualOutput: true })
			.where(eq(appUser.id, "user-a"));
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		await caller.direct.setRole({
			pathId: data.pathA.id,
			provider: "kick",
			role: "portrait",
		});
		await prepareDirect("user-a", data.pathA.id);
		const hook = (version = "") =>
			app.handle(
				new Request(
					`http://localhost/api/hooks/direct-destinations${version}`,
					{
						method: "POST",
						headers: {
							"content-type": "application/json",
							"x-hook-secret": process.env.HOOK_SECRET ?? "",
						},
						body: JSON.stringify({ path: "alpha-1", skip: [] }),
					},
				),
			);

		expect(await (await hook()).text()).toBe(
			"twitch rtmps://ingest.global-contribute.live-video.net/app/live_a_secret\n",
		);
		expect(await (await hook("-v2")).text()).toBe(
			"twitch landscape - rtmps://ingest.global-contribute.live-video.net/app/live_a_secret\n" +
				"kick portrait crop=iw*0.3164:ih*1:iw*0.3418:ih*0,scale=1080:1920 rtmps://stream.kick.com/99/kick_secret\n",
		);
	});

	test("soft-warns for portrait capacity and starts landscape with portrait failed", async () => {
		const data = await seedDirect();
		await db
			.update(appUser)
			.set({ directDualOutput: true })
			.where(eq(appUser.id, "user-a"));
		await db.update(relay).set({ maxForwarders: 1 });
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		expect(
			await caller.direct.setRole({
				pathId: data.pathA.id,
				provider: "kick",
				role: "portrait",
			}),
		).toMatchObject({ overCapacity: true });

		expect(await prepareDirect("user-a", data.pathA.id)).toMatchObject({
			outputs: ["twitch"],
			portraitOutputs: [],
		});
		const listed = await caller.direct.list();
		expect(
			listed.destinations.find(
				(destination) => destination.role === "portrait",
			),
		).toMatchObject({
			state: "failed",
			error: "No free Direct slot for portrait. Landscape can still go live.",
		});
	});

	test("invalid portrait crop is blocked at go-live without blocking landscape", async () => {
		const data = await seedDirect();
		await db
			.update(appUser)
			.set({ directDualOutput: true })
			.where(eq(appUser.id, "user-a"));
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		await caller.direct.setRole({
			pathId: data.pathA.id,
			provider: "kick",
			role: "portrait",
		});
		await db
			.update(directDestination)
			.set({ crop: { x: 0.8, y: 0, w: 0.3, h: 1, aspect: "9:16" } })
			.where(eq(directDestination.userId, "user-a"));

		expect(await prepareDirect("user-a", data.pathA.id)).toMatchObject({
			outputs: ["twitch"],
			portraitOutputs: [],
		});
		const listed = await caller.direct.list();
		expect(
			listed.destinations.find(
				(destination) => destination.role === "portrait",
			),
		).toMatchObject({ state: "failed" });
	});

	test("lists legacy landscape defaults and portrait failures independently", async () => {
		const data = await seedDirect();
		await db
			.update(appUser)
			.set({ directDualOutput: true })
			.where(eq(appUser.id, "user-a"));
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		await caller.direct.setRole({
			pathId: data.pathA.id,
			provider: "kick",
			role: "portrait",
		});
		await db
			.update(directDestination)
			.set({ state: "failed", error: "portrait failed" })
			.where(eq(directDestination.userId, "user-a"));
		const listed = await caller.direct.list();

		expect(listed.destinations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					provider: "twitch",
					role: "landscape",
					crop: null,
				}),
				expect.objectContaining({
					provider: "kick",
					role: "portrait",
					state: "failed",
					error: "portrait failed",
				}),
			]),
		);
	});

	test("does not reuse a removed portrait slot until the relay acknowledges stop", async () => {
		const data = await seedDirect();
		await db
			.update(appUser)
			.set({ directDualOutput: true })
			.where(eq(appUser.id, "user-a"));
		await db.update(relay).set({ maxForwarders: 2 });
		await db
			.update(account)
			.set({ scope: "user:read:email openid channel:read:stream_key" })
			.where(eq(account.id, "direct-twitch-b"));
		const owner = await callerFor("user-a");
		const waiting = await callerFor("user-b");
		await owner.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		await owner.direct.setRole({
			pathId: data.pathA.id,
			provider: "kick",
			role: "portrait",
		});
		await prepareDirect("user-a", data.pathA.id);
		await applyPathHook("ready", { path: "alpha-1", sourceType: "srtConn" });
		await resolveDirectDestinations("alpha-1", directDeps());
		await waiting.direct.setOutputs({
			pathId: data.pathB.id,
			twitch: true,
			kick: false,
			youtube: false,
		});

		await owner.direct.setRole({
			pathId: data.pathA.id,
			provider: "kick",
			role: "landscape",
		});
		await applyDirectState({
			slug: "alpha-1",
			provider: "kick",
			role: "portrait",
			state: "live",
		});
		expect(
			(await owner.direct.list()).destinations.find(
				(destination) => destination.role === "portrait",
			),
		).toMatchObject({ state: "stopping" });
		expect(
			await directDestinationActive({
				slug: "alpha-1",
				provider: "kick",
				role: "portrait",
				filter: "crop=iw*0.3164:ih*1:iw*0.3418:ih*0,scale=1080:1920",
			}),
		).toBe(false);
		await applyDirectState({
			slug: "alpha-1",
			provider: "kick",
			role: "portrait",
			state: "stopping",
			error: "rtmps://secret.example/live/key encoder did not exit",
		});
		expect(
			(await owner.direct.list()).destinations.find(
				(destination) => destination.role === "portrait",
			),
		).toMatchObject({ state: "stopping", error: "[url] encoder did not exit" });
		await expect(prepareDirect("user-b", data.pathB.id)).rejects.toMatchObject({
			code: "capacity",
		});

		await applyDirectState({
			slug: "alpha-1",
			provider: "kick",
			role: "portrait",
			state: "stopped",
		});
		expect(
			(await owner.direct.list()).destinations.some(
				(destination) => destination.role === "portrait",
			),
		).toBe(false);
		expect(await prepareDirect("user-b", data.pathB.id)).toMatchObject({
			outputs: ["twitch"],
		});
	});

	test("immediately frees an unstarted portrait while landscape is live", async () => {
		const data = await seedDirect();
		await db
			.update(appUser)
			.set({ directDualOutput: true })
			.where(eq(appUser.id, "user-a"));
		await db.update(relay).set({ maxForwarders: 2 });
		await db
			.update(account)
			.set({ scope: "user:read:email openid channel:read:stream_key" })
			.where(eq(account.id, "direct-twitch-b"));
		const owner = await callerFor("user-a");
		const waiting = await callerFor("user-b");
		await owner.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		await owner.direct.setRole({
			pathId: data.pathA.id,
			provider: "kick",
			role: "portrait",
		});
		await prepareDirect("user-a", data.pathA.id);
		await applyPathHook("ready", { path: "alpha-1", sourceType: "srtConn" });
		await waiting.direct.setOutputs({
			pathId: data.pathB.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		await expect(prepareDirect("user-b", data.pathB.id)).rejects.toMatchObject({
			code: "capacity",
		});

		await expect(
			owner.direct.setRole({
				pathId: data.pathA.id,
				provider: "kick",
				role: "landscape",
			}),
		).resolves.toMatchObject({ removalPending: false });
		expect(
			(await owner.direct.list()).destinations.some(
				(destination) => destination.role === "portrait",
			),
		).toBe(false);
		expect(await prepareDirect("user-b", data.pathB.id)).toMatchObject({
			outputs: ["twitch"],
		});
	});

	test("does not resurrect a stopped portrait during removal", async () => {
		const data = await seedDirect();
		await db
			.update(appUser)
			.set({ directDualOutput: true })
			.where(eq(appUser.id, "user-a"));
		const owner = await callerFor("user-a");
		await owner.direct.setRole({
			pathId: data.pathA.id,
			provider: "kick",
			role: "portrait",
		});
		await applyPathHook("ready", { path: "alpha-1", sourceType: "srtConn" });
		await db
			.update(directDestination)
			.set({ state: "stopped", reservedUntil: null })
			.where(eq(directDestination.userId, "user-a"));

		await expect(
			owner.direct.setRole({
				pathId: data.pathA.id,
				provider: "kick",
				role: "landscape",
			}),
		).resolves.toMatchObject({ removalPending: false });
		expect(
			(await owner.direct.list()).destinations.some(
				(destination) => destination.role === "portrait",
			),
		).toBe(false);
	});

	test("creates one YouTube broadcast for repeated destination resolution", async () => {
		youtubeBroadcastCreates = 0;
		const data = await seedDirect();
		await db.update(relay).set({ maxForwarders: 3 });
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: true,
			youtube: true,
		});
		await prepareDirect("user-a", data.pathA.id);

		const first = await resolveDirectDestinations("alpha-1", directDeps());
		const second = await resolveDirectDestinations("alpha-1", directDeps());
		expect(first.destinations).toHaveLength(3);
		expect(second.destinations).toEqual(first.destinations);
		expect(youtubeBroadcastCreates).toBe(1);
		expect(first.destinations[2]).toEqual({
			filter: null,
			provider: "youtube",
			role: "landscape",
			url: "rtmps://a.rtmp.youtube.com/live2/youtube_secret",
		});

		const [state] = await db
			.select()
			.from(pathState)
			.where(eq(pathState.pathId, data.pathA.id));
		expect(state?.directYoutubeBroadcastId).toBe("youtube-broadcast");
		expect(state?.directYoutubeState).toBe("starting");
		expect(JSON.stringify(state)).not.toContain("youtube_secret");
	});

	test("a user can configure only their own paths", async () => {
		const data = await seedDirect();
		const caller = await callerFor("user-a");

		await expect(
			caller.direct.setOutputs({
				pathId: data.pathB.id,
				twitch: true,
				kick: false,
				youtube: false,
			}),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("the latest offline device takes the desired Direct outputs", async () => {
		await seedDirect();
		const second = await createPath("user-a", "phone two");
		const caller = await callerFor("user-a");
		const first = (await caller.direct.list()).paths[0];
		if (!first) throw new Error("no path to configure");

		await caller.direct.setOutputs({
			pathId: first.id,
			twitch: true,
			kick: true,
			youtube: false,
		});
		await prepareDirect("user-a", second.id);
		const listed = await caller.direct.list();
		expect(listed.ownerPathId).toEqual({
			twitch: second.id,
			kick: second.id,
			youtube: null,
		});
	});

	test("the latest device cannot steal a live Direct output", async () => {
		const data = await seedDirect();
		const second = await createPath("user-a", "phone two");
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		await prepareDirect("user-a", data.pathA.id);
		await applyPathHook("ready", { path: "alpha-1", sourceType: "srtConn" });

		await expect(prepareDirect("user-a", second.id)).rejects.toMatchObject({
			code: "provider-taken",
		});
	});

	test("outputs cannot change while the device is publishing", async () => {
		const data = await seedDirect();
		await applyPathHook("ready", { path: "alpha-1", sourceType: "srtConn" });
		const caller = await callerFor("user-a");

		await expect(
			caller.direct.setOutputs({
				pathId: data.pathA.id,
				twitch: true,
				kick: false,
				youtube: false,
			}),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	test("a revoked path owns no provider", async () => {
		const data = await seedDirect();
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: true,
			youtube: false,
		});

		await revokePath("user-a", data.pathA.id);

		const [revoked] = await db
			.select()
			.from(relayPath)
			.where(eq(relayPath.id, data.pathA.id));
		expect(revoked?.directTwitch).toBe(false);
		expect(revoked?.directKick).toBe(false);
		expect(
			(await resolveDirectDestinations("alpha-1", directDeps())).destinations,
		).toEqual([]);
	});

	test("a missing provider scope returns reauthorize without exposing tokens", async () => {
		const data = await seedDirect();
		await db
			.update(relayPath)
			.set({ directTwitch: true })
			.where(eq(relayPath.id, data.pathB.id));
		await db
			.insert(pathState)
			.values({
				pathId: data.pathB.id,
				directTwitchReservedUntil: new Date(Date.now() + 60_000),
			})
			.onConflictDoUpdate({
				target: pathState.pathId,
				set: { directTwitchReservedUntil: new Date(Date.now() + 60_000) },
			});

		const { destinations } = await resolveDirectDestinations("beta-1", {
			...directDeps(),
			// Twitch refuses the key call once consent is missing or revoked.
			fetch: (async () =>
				new Response("token expired", {
					status: 401,
				})) as unknown as typeof fetch,
		});
		expect(destinations).toEqual([]);

		const [state] = await db
			.select()
			.from(pathState)
			.where(eq(pathState.pathId, data.pathB.id));
		expect(state?.directTwitchState).toBe("failed");
		expect(state?.directTwitchError).toBe(
			"Twitch stream key permission is required",
		);
		expect(state?.directTwitchError).not.toContain("token");
	});

	test("a provider failure frees only its reservation", async () => {
		const data = await seedDirect();
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: true,
			youtube: false,
		});
		await prepareDirect("user-a", data.pathA.id);
		await resolveDirectDestinations("alpha-1", {
			...directDeps(),
			fetch: (async (input) =>
				String(input).includes("/streams/key")
					? new Response(null, { status: 401 })
					: providerFetch(input)) as typeof fetch,
		});

		const [state] = await db
			.select()
			.from(pathState)
			.where(eq(pathState.pathId, data.pathA.id));
		expect(state?.directTwitchState).toBe("failed");
		expect(state?.directTwitchReservedUntil).toBeNull();
		expect(state?.directKickState).toBe("starting");
		expect(state?.directKickReservedUntil).not.toBeNull();
	});

	test("preflight refuses both outputs when the relay has one slot", async () => {
		const data = await seedDirect();
		await db.update(relay).set({ maxForwarders: 1 });
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: true,
			youtube: false,
		});

		await expect(prepareDirect("user-a", data.pathA.id)).rejects.toMatchObject({
			code: "capacity",
		});
	});

	test("simultaneous users cannot reserve beyond relay capacity", async () => {
		const data = await seedDirect();
		await db.update(relay).set({ maxForwarders: 1 });
		await db
			.update(account)
			.set({ scope: "user:read:email openid channel:read:stream_key" })
			.where(eq(account.id, "direct-twitch-b"));
		await db
			.update(appUser)
			.set({ directTwitch: true, directKick: false })
			.where(eq(appUser.id, "user-b"));
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		await prepareDirect("user-a", data.pathA.id);

		await expect(prepareDirect("user-b", data.pathB.id)).rejects.toMatchObject({
			code: "capacity",
		});
	});

	test("an expired reservation releases relay capacity", async () => {
		const data = await seedDirect();
		await db.update(relay).set({ maxForwarders: 1 });
		await db
			.update(account)
			.set({ scope: "user:read:email openid channel:read:stream_key" })
			.where(eq(account.id, "direct-twitch-b"));
		await db
			.update(appUser)
			.set({ directTwitch: true, directKick: false })
			.where(eq(appUser.id, "user-b"));
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		await prepareDirect("user-a", data.pathA.id);
		await db
			.update(pathState)
			.set({ directTwitchReservedUntil: new Date(Date.now() - 1) })
			.where(eq(pathState.pathId, data.pathA.id));

		expect((await prepareDirect("user-b", data.pathB.id)).outputs).toEqual([
			"twitch",
		]);
	});

	test("a stopped source frees the slots it held", async () => {
		const data = await seedDirect();
		await db
			.update(appUser)
			.set({ directTwitch: true, directKick: true })
			.where(eq(appUser.id, "user-a"));
		await prepareDirect("user-a", data.pathA.id);
		await applyPathHook("ready", { path: "alpha-1", sourceType: "srtConn" });
		await resolveDirectDestinations("alpha-1", directDeps());

		await applyPathHook("not-ready", { path: "alpha-1" });

		const [state] = await db
			.select()
			.from(pathState)
			.where(eq(pathState.pathId, data.pathA.id));
		expect(state?.directTwitchState).toBe("stopped");
		expect(state?.directKickState).toBe("stopped");
	});

	// "Never drop again": the ingest going away must not end the broadcast.
	async function seedLiveBrb() {
		const data = await seedDirect();
		await db.update(relay).set({ maxForwarders: 3 });
		await db
			.update(appUser)
			.set({
				directTwitch: true,
				directYoutube: true,
				brbEnabled: true,
				brbMessage: "  Back in five  ",
			})
			.where(eq(appUser.id, "user-a"));
		await db
			.update(relayPath)
			.set({ directTwitch: true, directYoutube: true })
			.where(eq(relayPath.id, data.pathA.id));
		await prepareDirect("user-a", data.pathA.id);
		await applyPathHook("ready", { path: "alpha-1", sourceType: "srtConn" });
		await resolveDirectDestinations("alpha-1", directDeps());
		return data;
	}

	const stateFor = async (pathId: number) =>
		(await db.select().from(pathState).where(eq(pathState.pathId, pathId)))[0];

	test("a dropped ingest holds the broadcast instead of ending it", async () => {
		youtubeBroadcastCompletes = 0;
		globalThis.fetch = providerFetch;
		const data = await seedLiveBrb();

		await applyPathHook("not-ready", { path: "alpha-1" });

		const state = await stateFor(data.pathA.id);
		expect(state?.publishing).toBe(false);
		expect(state?.brbSince).not.toBeNull();
		// Not "stopped": the forwarders are still up, holding the card.
		expect(state?.directTwitchState).toBe("starting");
		// Completing this is irreversible, which is the whole risk of the feature.
		expect(state?.directYoutubeBroadcastId).toBe("youtube-broadcast");
		expect(youtubeBroadcastCompletes).toBe(0);
	});

	test("a repeated source-gone signal cannot tear down a raised card", async () => {
		const data = await seedLiveBrb();
		await applyPathHook("not-ready", { path: "alpha-1" });
		const first = await stateFor(data.pathA.id);

		// The 10s reconciler keeps seeing the same missing path and routes
		// through the same helper, so a second signal must change nothing.
		await applyPathHook("not-ready", { path: "alpha-1" });

		const second = await stateFor(data.pathA.id);
		expect(second?.brbSince?.getTime()).toBe(first?.brbSince?.getTime());
		expect(second?.directYoutubeBroadcastId).toBe("youtube-broadcast");
	});

	test("a tick keeps the encoder slot reserved and reports the card", async () => {
		const data = await seedLiveBrb();
		await applyPathHook("not-ready", { path: "alpha-1" });
		await db
			.update(pathState)
			.set({ directTwitchReservedUntil: new Date(Date.now() - 1) })
			.where(eq(pathState.pathId, data.pathA.id));

		const tick = await brbTick("alpha-1", "twitch", {
			presign: async () => "https://objects.test/signed",
		});

		expect(tick).toEqual({
			stop: false,
			message: "Back in five",
			backgroundUrl: "https://objects.test/signed",
			source: "snapshot",
		});
		const state = await stateFor(data.pathA.id);
		expect(state?.directTwitchState).toBe("brb");
		// A held forwarder still burns a slot; letting the reservation lapse
		// would hand its capacity to someone else while it is still encoding.
		expect(state?.directTwitchReservedUntil?.getTime()).toBeGreaterThan(
			Date.now(),
		);
	});

	test("the dashboard stop ends the card on the next tick", async () => {
		const data = await seedLiveBrb();
		await applyPathHook("not-ready", { path: "alpha-1" });

		expect(await stopBrb("user-a", data.pathA.id)).toBe(true);

		expect(await brbTick("alpha-1", "twitch")).toEqual({ stop: true });
		expect((await stateFor(data.pathA.id))?.brbSince).toBeNull();
	});

	// The phone stops its own encoder first, so its stop can arrive before
	// MediaMTX has even noticed the ingest is gone. Clearing the marker alone
	// would then be undone by the not-ready hook landing behind it.
	test("ending from the publisher survives a later not-ready hook", async () => {
		const data = await seedLiveBrb();

		expect(await stopBrb("user-a", data.pathA.id)).toBe(true);
		await applyPathHook("not-ready", { path: "alpha-1" });

		const state = await stateFor(data.pathA.id);
		expect(state?.brbSince).toBeNull();
		expect(state?.directTwitchState).toBe("stopped");
		expect(await brbTick("alpha-1", "twitch")).toEqual({ stop: true });
	});

	test("another user cannot stop this stream", async () => {
		const data = await seedLiveBrb();
		await applyPathHook("not-ready", { path: "alpha-1" });

		expect(await stopBrb("user-b", data.pathA.id)).toBe(false);
		expect((await stateFor(data.pathA.id))?.brbSince).not.toBeNull();
	});

	test("the publisher coming back clears the card", async () => {
		const data = await seedLiveBrb();
		await applyPathHook("not-ready", { path: "alpha-1" });

		await applyPathHook("ready", { path: "alpha-1", sourceType: "srtConn" });

		// A stale marker would put the next drop straight past the ceiling.
		expect((await stateFor(data.pathA.id))?.brbSince).toBeNull();
		expect(await brbTick("alpha-1", "twitch")).toEqual({ stop: true });
	});

	test("a reconnect does not resolve a provider the relay still holds", async () => {
		const data = await seedLiveBrb();
		await applyPathHook("not-ready", { path: "alpha-1" });
		await applyPathHook("ready", { path: "alpha-1", sourceType: "srtConn" });
		await prepareDirect("user-a", data.pathA.id);
		// Only what the reconnect itself resolves counts here.
		youtubeBroadcastCreates = 0;

		const { destinations } = await resolveDirectDestinations(
			"alpha-1",
			directDeps(),
			["youtube"],
		);

		expect(destinations.map((entry) => entry.provider)).toEqual(["twitch"]);
		// Resolving it again would mint a second broadcast against a live one.
		expect(youtubeBroadcastCreates).toBe(0);
	});

	test("without BRB a dropped ingest still tears the forwarders down", async () => {
		const data = await seedLiveBrb();
		await db
			.update(appUser)
			.set({ brbEnabled: false })
			.where(eq(appUser.id, "user-a"));

		await applyPathHook("not-ready", { path: "alpha-1" });

		const state = await stateFor(data.pathA.id);
		expect(state?.brbSince).toBeNull();
		expect(state?.directTwitchState).toBe("stopped");
		expect(state?.directYoutubeBroadcastId).toBeNull();
	});
});
