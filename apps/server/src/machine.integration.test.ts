import "./test-env";

import {
	brbHighlightKey,
	brbHighlightUploadKey,
	brbTick,
	confirmBrbHighlightUpload,
	deleteBrbHighlight,
	getBrbHighlightUploadUrl,
	MAX_BRB_HIGHLIGHT_BYTES,
	reorderBrbHighlights,
	setBrbHighlightPrefs,
	stopBrb,
	updateBrbHighlight,
} from "@VISP/api/brb";
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
	directSourceSlug,
	prepareDirect,
	resolveDirectDestinations,
	resolveDirectDestinationsV3,
} from "@VISP/api/direct";
import {
	applyCustomDirectState,
	customDirectOutputActive,
} from "@VISP/api/direct-custom";
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
	getStudioPreviewUrls,
	listPaths,
	reconcilePathState,
	revealPublishPath,
	revokePath,
	rotatePublishPath,
	rotateReadSecret,
} from "@VISP/api/relay";
import { chooseRelay, ensureDefaultRelay } from "@VISP/api/relays";
import { appRouter } from "@VISP/api/routers/index";
import { resetRelayMutationLimitForTests } from "@VISP/api/routers/relay";
import { listSnapshots, snapshotKey } from "@VISP/api/snapshots";
import {
	compositorDesiredState,
	deliverStudioAlert,
	deliverStudioProviderAlert,
	reportBrowserFailure,
	reportCompositorHealth,
} from "@VISP/api/studio";
import { auth } from "@VISP/auth";
import { db } from "@VISP/db";
import {
	account,
	appUser,
	session as authSession,
	brbHighlight,
	chatBotAlert,
	chatConnection,
	customDirectDestination,
	customDirectOutput,
	directDestination,
	pathState,
	relay,
	relayPath,
	relayStreamSession,
	user,
} from "@VISP/db/schema/index";
import {
	afterEach,
	beforeEach,
	test as bunTest,
	describe,
	expect,
} from "bun:test";
import { eq, ne, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { machineRoutes } from "./machine";
import { nodeAdapter } from "./node-adapter";
import { obsLiveRoutes } from "./obs-live";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const test = bunTest.serial;
const originalFetch = globalThis.fetch;
const app = new Elysia().use(machineRoutes);
const highlightUploadId = "10000000-0000-4000-8000-000000000001";

function validHighlightMp4() {
	const box = (type: string, ...parts: Uint8Array[]) => {
		const size = 8 + parts.reduce((total, part) => total + part.length, 0);
		const bytes = new Uint8Array(size);
		new DataView(bytes.buffer).setUint32(0, size);
		bytes.set(new TextEncoder().encode(type), 4);
		let offset = 8;
		for (const part of parts) {
			bytes.set(part, offset);
			offset += part.length;
		}
		return bytes;
	};
	const concat = (...parts: Uint8Array[]) => {
		const bytes = new Uint8Array(
			parts.reduce((total, part) => total + part.length, 0),
		);
		let offset = 0;
		for (const part of parts) {
			bytes.set(part, offset);
			offset += part.length;
		}
		return bytes;
	};
	const mvhd = new Uint8Array(24);
	new DataView(mvhd.buffer).setUint32(12, 1000);
	new DataView(mvhd.buffer).setUint32(16, 750);
	const tkhd = new Uint8Array(84);
	new DataView(tkhd.buffer).setUint32(76, 1280 << 16);
	new DataView(tkhd.buffer).setUint32(80, 720 << 16);
	const entry = box(
		"avc1",
		new Uint8Array(78),
		box("avcC", new Uint8Array([1, 100, 0, 40, 255, 225, 0])),
	);
	const stsd = concat(new Uint8Array(4), new Uint8Array([0, 0, 0, 1]), entry);
	return concat(
		box("ftyp", new TextEncoder().encode("isom")),
		box(
			"moov",
			box("mvhd", mvhd),
			box(
				"trak",
				box("tkhd", tkhd),
				box("mdia", box("minf", box("stbl", box("stsd", stsd)))),
			),
		),
	);
}

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
		resetRelayMutationLimitForTests();
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

	test("creates a dashboard preview credential for direct onboarding", async () => {
		await seed();
		await db
			.update(appUser)
			.set({ readSecretHash: null })
			.where(eq(appUser.id, "user-a"));
		await completeOnboarding("user-a", {
			software: "visp",
			useCase: "direct",
			destination: "other",
			advancedMode: false,
			direct: { twitch: false, kick: false, youtube: false },
			prepareObs: false,
		});

		const camera = new URL(
			(await getStudioPreviewUrls("user-a"))?.camera ?? "missing",
		);
		expect(camera.href).toStartWith("https://relay.test/alpha-1/whep?");
		expect(
			await authenticateMedia({
				action: "read",
				password: camera.searchParams.get("pass") ?? "",
				path: "alpha-1",
				user: camera.searchParams.get("user") ?? "",
			}),
		).toBe(true);
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
			senderMode: "visp",
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
			senderMode: "visp",
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
			senderMode: "visp",
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

	test("opens an email-only account empty, with no relay path", async () => {
		await db.insert(user).values({
			id: "email-only",
			name: "Email Only",
			email: "email-only@example.test",
		});
		await db.insert(account).values({
			id: "account-credential",
			accountId: "email-only@example.test",
			providerId: "credential",
			userId: "email-only",
		});

		const owner = await ensureRelayUser("email-only", "Email Only");
		expect(owner.id).toBe("email-only");
		expect(
			await db.query.relayPath.findMany({
				where: eq(relayPath.userId, "email-only"),
			}),
		).toHaveLength(0);

		// An account with nothing linked at all is still refused.
		await db.insert(user).values({
			id: "no-accounts",
			name: "No Accounts",
			email: "no-accounts@example.test",
		});
		expect(ensureRelayUser("no-accounts", "No Accounts")).rejects.toThrow(
			"Streaming account required",
		);
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
		resetRelayMutationLimitForTests();
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
				accessToken: "provider-token",
				accountId: "tw-a",
				providerId: "twitch",
				scope: "user:read:email openid channel:read:stream_key",
				userId: "user-a",
			},
			{
				id: "direct-kick-a",
				accessToken: "provider-token",
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

	test("persists an owner-scoped Studio graph and exposes last-saved compositor state", async () => {
		await seedDirect();
		const caller = await callerFor("user-a");
		const other = await callerFor("user-b");
		const sceneId = "11111111-1111-4111-8111-111111111111";
		const textId = "22222222-2222-4222-8222-222222222222";
		const browserId = "33333333-3333-4333-8333-333333333333";
		const alertId = "44444444-4444-4444-8444-444444444444";
		const graph = {
			activeSceneId: sceneId,
			scenes: [
				{
					id: sceneId,
					name: "Main",
					order: 0,
					transition: "fade" as const,
					layers: [
						{
							id: textId,
							type: "text" as const,
							name: "Title",
							visible: true,
							x: 20,
							y: 20,
							width: 600,
							height: 100,
							zIndex: 0,
							text: "Saved title",
						},
						{
							id: browserId,
							type: "browser" as const,
							name: "Widget",
							visible: true,
							x: 0,
							y: 0,
							width: 640,
							height: 360,
							zIndex: 1,
							url: "https://widgets.example.test/live",
						},
						{
							id: alertId,
							type: "alert" as const,
							name: "Followers",
							visible: true,
							x: 20,
							y: 140,
							width: 600,
							height: 100,
							zIndex: 2,
							event: "follow" as const,
						},
					],
				},
			],
		};

		expect(await reportCompositorHealth("alpha-1", false)).toBe(true);
		await expect(
			reportCompositorHealth(
				"alpha-1",
				true,
				"rtsp://127.0.0.1:8554/studio/beta-1",
			),
		).rejects.toThrow("local Studio RTSP path");
		expect((await caller.studio.mode.get()).configured).toBe(false);
		expect(
			await reportCompositorHealth(
				"alpha-1",
				true,
				"rtsp://127.0.0.1:8554/studio/alpha-1",
			),
		).toBe(true);
		expect((await caller.studio.mode.get()).configured).toBe(false);
		expect(await reportCompositorHealth("alpha-1", false)).toBe(true);
		expect(await caller.studio.save(graph)).toEqual(graph);
		expect((await caller.studio.get()).graph).toEqual(graph);
		expect((await other.studio.get()).graph.scenes).toEqual([]);
		await caller.studio.mode.set({ mode: "cloud_studio" });
		expect(await compositorDesiredState("alpha-1")).toMatchObject({
			mode: "passthrough",
			requestedMode: "program",
			version: 1,
		});
		expect(
			await reportCompositorHealth(
				"alpha-1",
				true,
				"rtsp://127.0.0.1:8554/studio/alpha-1",
			),
		).toBe(true);
		expect(await compositorDesiredState("alpha-1")).toMatchObject({
			mode: "program",
			graph,
		});

		expect(await reportBrowserFailure("alpha-1", browserId)).toBe(true);
		const disabled = await caller.studio.get();
		expect(disabled.graph.scenes[0]?.layers[1]).toMatchObject({
			visible: true,
			runtimeDisabled: true,
		});
		await caller.studio.save(disabled.graph);
		expect(
			(await caller.studio.get()).graph.scenes[0]?.layers[1],
		).toMatchObject({
			runtimeDisabled: true,
		});
		const reenabled = structuredClone(disabled.graph);
		const browser = reenabled.scenes[0]?.layers[1];
		if (browser) browser.runtimeDisabled = false;
		await caller.studio.save(reenabled);
		expect(
			(await caller.studio.get()).graph.scenes[0]?.layers[1],
		).not.toHaveProperty("runtimeDisabled");
		expect(
			await deliverStudioProviderAlert("user-a", {
				id: "follow-1",
				provider: "twitch",
				kind: "follow",
				sentAt: new Date().toISOString(),
				name: "Ada",
			}),
		).toBe(true);
		expect(await compositorDesiredState("alpha-1")).toMatchObject({
			alert: { event: "follow", label: "Ada followed" },
		});
		expect(
			await deliverStudioProviderAlert("user-a", {
				id: "sub-1",
				provider: "youtube",
				kind: "sub",
				sentAt: new Date().toISOString(),
				name: "Lin",
			}),
		).toBe(false);
		expect(await deliverStudioAlert("alpha-1", "follow")).toEqual({
			event: "follow",
			fallback: null,
		});
		expect(await compositorDesiredState("alpha-1")).toMatchObject({
			alert: { event: "follow", label: "Alert" },
		});
		await caller.studio.emptyWarning({ dismissed: true });
		expect((await caller.studio.mode.get()).emptyWarningDismissed).toBe(true);
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
		globalThis.fetch = providerFetch;
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
		globalThis.fetch = providerFetch;
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

	test("same-relay handover keeps the original Direct session and falls back", async () => {
		youtubeBroadcastCreates = 0;
		youtubeBroadcastCompletes = 0;
		globalThis.fetch = providerFetch;
		const data = await seedDirect();
		const replacement = await createPath("user-a", "Phone B");
		const caller = await callerFor("user-a");
		await db
			.update(appUser)
			.set({ brbEnabled: true })
			.where(eq(appUser.id, "user-a"));
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: true,
		});
		await prepareDirect("user-a", data.pathA.id);
		await applyPathHook("ready", { path: "alpha-1", sourceType: "srtConn" });
		await resolveDirectDestinations("alpha-1", directDeps());
		const before = (
			await db
				.select()
				.from(pathState)
				.where(eq(pathState.pathId, data.pathA.id))
		)[0];

		await expect(prepareDirect("user-a", replacement.id)).rejects.toMatchObject(
			{
				code: "provider-taken",
			},
		);
		expect(await prepareDirect("user-a", replacement.id, true)).toMatchObject({
			pathId: data.pathA.id,
			sourcePathId: replacement.id,
			outputs: ["twitch", "youtube"],
		});
		await applyPathHook("ready", {
			path: replacement.slug,
			sourceType: "srtConn",
		});

		const owner = (
			await db
				.select()
				.from(pathState)
				.where(eq(pathState.pathId, data.pathA.id))
		)[0];
		const paths = await db
			.select()
			.from(relayPath)
			.where(eq(relayPath.userId, "user-a"));
		expect(owner).toMatchObject({
			directSourcePathId: replacement.id,
			directHandoverTargetPathId: null,
			directHandoverUntil: null,
			directYoutubeBroadcastId: before?.directYoutubeBroadcastId,
		});
		expect(owner?.directTwitchReservedUntil?.getTime()).toBe(
			before?.directTwitchReservedUntil?.getTime(),
		);
		expect(paths.find((path) => path.id === data.pathA.id)).toMatchObject({
			directTwitch: true,
			directYoutube: true,
		});
		expect(paths.find((path) => path.id === replacement.id)).toMatchObject({
			directTwitch: false,
			directYoutube: false,
		});
		expect(await directSourceSlug("alpha-1")).toBe(replacement.slug);
		const sourcePlan = await app.handle(
			new Request("http://localhost/api/hooks/source-plan", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-hook-secret": process.env.HOOK_SECRET ?? "",
				},
				body: JSON.stringify({ path: "alpha-1" }),
			}),
		);
		expect(await sourcePlan.text()).toBe(`source ${replacement.slug}\n`);
		expect(
			(await resolveDirectDestinations(replacement.slug, directDeps()))
				.destinations,
		).toEqual([]);
		expect(youtubeBroadcastCreates).toBe(1);

		await applyPathHook("not-ready", { path: replacement.slug });
		expect(await directSourceSlug("alpha-1")).toBe("alpha-1");
		expect(
			(
				await db
					.select()
					.from(pathState)
					.where(eq(pathState.pathId, data.pathA.id))
			)[0]?.directYoutubeBroadcastId,
		).toBe(before?.directYoutubeBroadcastId);

		await prepareDirect("user-a", replacement.id, true);
		await applyPathHook("ready", { path: replacement.slug });
		await applyPathHook("not-ready", { path: "alpha-1" });
		expect(await directSourceSlug("alpha-1")).toBe(replacement.slug);
		await applyPathHook("not-ready", { path: replacement.slug });
		expect(
			(
				await db
					.select()
					.from(pathState)
					.where(eq(pathState.pathId, data.pathA.id))
			)[0]?.brbSince,
		).toBeInstanceOf(Date);
		expect(youtubeBroadcastCompletes).toBe(0);

		expect(await stopBrb("user-a", replacement.id)).toBe(true);
		expect(youtubeBroadcastCompletes).toBe(1);
		expect(
			(
				await db
					.select()
					.from(pathState)
					.where(eq(pathState.pathId, data.pathA.id))
			)[0],
		).toMatchObject({
			directTwitchState: "stopped",
			directYoutubeState: "stopped",
			directYoutubeBroadcastId: null,
		});
	});

	test("handover rejects cross-user, cross-relay, expired, and concurrent targets", async () => {
		const data = await seedDirect();
		const second = await createPath("user-a", "Phone B");
		const third = await createPath("user-a", "Phone C");
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		await prepareDirect("user-a", data.pathA.id);
		await applyPathHook("ready", { path: "alpha-1" });

		await expect(
			prepareDirect("user-b", data.pathB.id, true),
		).rejects.toMatchObject({
			code: "invalid",
		});
		const [otherRelay] = await db
			.insert(relay)
			.values({
				name: "handover-other",
				host: "other.test",
				apiUrl: "http://other.test",
				pingUrl: "http://other.test/ping",
				region: "test",
				capacityPaths: 10,
				maxForwarders: 10,
				publicIp: "127.0.0.2",
			})
			.returning();
		await db
			.update(relayPath)
			.set({ relayId: otherRelay?.id })
			.where(eq(relayPath.id, third.id));
		await expect(prepareDirect("user-a", third.id, true)).rejects.toMatchObject(
			{
				code: "invalid",
			},
		);
		await db
			.update(relayPath)
			.set({ relayId: data.pathA.relayId })
			.where(eq(relayPath.id, third.id));

		const attempts = await Promise.allSettled([
			prepareDirect("user-a", second.id, true),
			prepareDirect("user-a", third.id, true),
		]);
		expect(
			attempts.filter(({ status }) => status === "fulfilled"),
		).toHaveLength(1);
		expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
			1,
		);
		const armed = (
			await db
				.select()
				.from(pathState)
				.where(eq(pathState.pathId, data.pathA.id))
		)[0];
		if (!armed?.directHandoverTargetPathId)
			throw new Error("handover not armed");
		await db
			.update(pathState)
			.set({ directHandoverUntil: new Date(Date.now() - 1) })
			.where(eq(pathState.pathId, data.pathA.id));
		const expiredTarget =
			armed.directHandoverTargetPathId === second.id ? second : third;
		await db
			.update(relayPath)
			.set({ publishSecretHash: await hashSecret("replacement-secret") })
			.where(eq(relayPath.id, expiredTarget.id));
		clearAuthCacheForTests();
		expect(
			await authenticateMedia({
				action: "publish",
				password: "replacement-secret",
				path: expiredTarget.slug,
				user: "alpha",
			}),
		).toBe(true);
		await applyPathHook("ready", {
			path: expiredTarget.slug,
		});
		expect(
			(
				await db
					.select()
					.from(pathState)
					.where(eq(pathState.pathId, data.pathA.id))
			)[0]?.directSourcePathId,
		).toBeNull();
	});

	test("revoking the original owner ends a handed-over broadcast once", async () => {
		youtubeBroadcastCompletes = 0;
		globalThis.fetch = providerFetch;
		const data = await seedDirect();
		const replacement = await createPath("user-a", "Phone B");
		const caller = await callerFor("user-a");
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: false,
			kick: false,
			youtube: true,
		});
		await prepareDirect("user-a", data.pathA.id);
		await applyPathHook("ready", { path: "alpha-1" });
		await resolveDirectDestinations("alpha-1", directDeps());
		await prepareDirect("user-a", replacement.id, true);
		await applyPathHook("ready", { path: replacement.slug });

		await revokePath("user-a", data.pathA.id);
		await applyPathHook("not-ready", { path: "alpha-1" });
		expect(youtubeBroadcastCompletes).toBe(1);
		expect(await directSourceSlug("alpha-1")).toBeNull();
	});

	test("reconciliation promotes and holds a handover when hooks are missed", async () => {
		const data = await seedDirect();
		const replacement = await createPath("user-a", "Phone B");
		const caller = await callerFor("user-a");
		await db
			.update(appUser)
			.set({ brbEnabled: true })
			.where(eq(appUser.id, "user-a"));
		await caller.direct.setOutputs({
			pathId: data.pathA.id,
			twitch: true,
			kick: false,
			youtube: false,
		});
		await prepareDirect("user-a", data.pathA.id);
		await applyPathHook("ready", { path: "alpha-1" });
		await resolveDirectDestinations("alpha-1", directDeps());
		await prepareDirect("user-a", replacement.id, true);

		let items = [
			{
				name: "alpha-1",
				ready: true,
				readers: [],
				source: { type: "srtConn" },
			},
			{
				name: replacement.slug,
				ready: true,
				readers: [],
				source: { type: "srtConn" },
			},
		];
		globalThis.fetch = (async (input, init) =>
			String(input).includes("/v3/paths/list")
				? Response.json({ items })
				: providerFetch(input, init)) as typeof fetch;
		await reconcilePathState("http://relay-api.test");
		expect(await directSourceSlug("alpha-1")).toBe(replacement.slug);

		items = [
			{
				name: replacement.slug,
				ready: true,
				readers: [],
				source: { type: "srtConn" },
			},
		];
		await reconcilePathState("http://relay-api.test");
		expect(await directSourceSlug("alpha-1")).toBe(replacement.slug);
		expect(
			(
				await db
					.select()
					.from(pathState)
					.where(eq(pathState.pathId, data.pathA.id))
			)[0]?.brbSince,
		).toBeNull();

		items = [];
		await reconcilePathState("http://relay-api.test");
		expect(
			(
				await db
					.select()
					.from(pathState)
					.where(eq(pathState.pathId, data.pathA.id))
			)[0]?.brbSince,
		).toBeInstanceOf(Date);
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
			.set({ directTwitchReservedUntil: sql`now() - interval '1 second'` })
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
			highlights: null,
		});
		const state = await stateFor(data.pathA.id);
		expect(state?.directTwitchState).toBe("brb");
		// A held forwarder still burns a slot; letting the reservation lapse
		// would hand its capacity to someone else while it is still encoding.
		expect(state?.directTwitchReservedUntil?.getTime()).toBeGreaterThan(
			Date.now(),
		);
	});

	test("a drop snapshots enabled highlights and their preferences", async () => {
		const data = await seedLiveBrb();
		await db
			.update(appUser)
			.set({
				brbHighlights: true,
				brbHighlightsMuted: true,
				brbHighlightsOverlay: false,
			})
			.where(eq(appUser.id, "user-a"));
		await db.insert(brbHighlight).values({
			id: "clip-a",
			userId: "user-a",
			storageKey: "brb/user-a/highlights/clip-a.mp4",
			filename: "clip.mp4",
			label: "Clip",
			durationMs: 10_000,
			byteSize: 1024,
			contentType: "video/mp4",
			codec: "avc1",
			width: 1920,
			height: 1080,
			checksum: "a".repeat(64),
			position: 0,
		});

		await applyPathHook("not-ready", { path: "alpha-1" });
		expect((await stateFor(data.pathA.id))?.brbHighlightsResultAt).toBeNull();
		const tick = await brbTick("alpha-1", "twitch", {
			presign: async (key) => `https://objects.test/${key}`,
		});

		expect(tick).toMatchObject({
			stop: false,
			highlights: {
				clips: [
					{
						id: "clip-a",
						durationMs: 10_000,
						url: "https://objects.test/brb/user-a/highlights/clip-a.mp4",
					},
				],
				muted: true,
				overlay: false,
			},
		});
		await db
			.update(brbHighlight)
			.set({ enabled: false })
			.where(eq(brbHighlight.id, "clip-a"));
		const frozen = await brbTick("alpha-1", "twitch", {
			presign: async () => "kept",
		});
		expect(frozen.stop ? null : frozen.highlights).toEqual({
			clips: [{ id: "clip-a", durationMs: 10_000, url: "kept" }],
			muted: true,
			overlay: false,
		});

		const headers = {
			"content-type": "application/json",
			"x-hook-secret": process.env.HOOK_SECRET ?? "",
		};
		const response = await app.handle(
			new Request("http://localhost/api/hooks/brb", {
				method: "POST",
				headers,
				body: JSON.stringify({ path: "alpha-1", provider: "twitch" }),
			}),
		);
		const fields = (await response.text()).trim().split(" ");
		expect(fields[0]).toBe("highlights");
		expect(Buffer.from(fields[2] ?? "", "base64").toString()).toContain(
			"1 0\n",
		);
		const played = (ordinal: number) =>
			app.handle(
				new Request("http://localhost/api/hooks/brb-played", {
					method: "POST",
					headers,
					body: JSON.stringify({ path: "alpha-1", ordinal }),
				}),
			);
		await played(1);
		await played(1);
		await played(3);
		await played(2);
		expect((await stateFor(data.pathA.id))?.brbHighlightsPlayed).toBe(3);
		await applyPathHook("ready", { path: "alpha-1", sourceType: "srtConn" });
		expect(
			(await stateFor(data.pathA.id))?.brbHighlightsResultAt,
		).toBeInstanceOf(Date);
	});

	test("a failed hold snapshot rolls back its claim and retries with a fresh snapshot", async () => {
		const data = await seedLiveBrb();
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-a"));
		await db.insert(brbHighlight).values({
			id: "fresh",
			userId: "user-a",
			storageKey: "brb/user-a/highlights/fresh.mp4",
			filename: "fresh.mp4",
			label: "Fresh",
			durationMs: 1000,
			byteSize: 100,
			contentType: "video/mp4",
			codec: "avc1",
			width: 1280,
			height: 720,
			checksum: "f".repeat(64),
			position: 0,
		});
		await db
			.update(pathState)
			.set({
				brbHighlightsSnapshot: {
					clips: [{ id: "stale", key: "stale.mp4", durationMs: 500 }],
					muted: true,
					overlay: false,
				},
			})
			.where(eq(pathState.pathId, data.pathA.id));
		await db.execute(
			sql.raw(`
				create function test_fail_brb_snapshot() returns trigger language plpgsql as $$
				begin
					raise exception 'snapshot failed';
				end $$;
				create trigger test_fail_brb_snapshot
				before update of brb_highlights_snapshot on path_state
				for each row when (new.brb_since is not null)
				execute function test_fail_brb_snapshot();
			`),
		);
		try {
			let failure: unknown;
			try {
				await applyPathHook("not-ready", { path: "alpha-1" });
			} catch (error) {
				failure = error;
			}
			expect((failure as { cause?: Error }).cause?.message).toContain(
				"snapshot failed",
			);
			const failed = await stateFor(data.pathA.id);
			expect(failed?.brbSince).toBeNull();
			expect(failed?.brbHighlightsSnapshot?.clips[0]?.id).toBe("stale");
		} finally {
			await db.execute(
				sql.raw("drop trigger test_fail_brb_snapshot on path_state"),
			);
			await db.execute(sql.raw("drop function test_fail_brb_snapshot()"));
		}

		await applyPathHook("not-ready", { path: "alpha-1" });
		const retried = await stateFor(data.pathA.id);
		expect(retried?.brbSince).toBeInstanceOf(Date);
		expect(retried?.brbHighlightsSnapshot?.clips.map(({ id }) => id)).toEqual([
			"fresh",
		]);
	});

	test("a flag-off hold clears the previous hold snapshot", async () => {
		const data = await seedLiveBrb();
		await db
			.update(pathState)
			.set({
				brbHighlightsSnapshot: {
					clips: [{ id: "old", key: "old.mp4", durationMs: 500 }],
					muted: false,
					overlay: true,
				},
			})
			.where(eq(pathState.pathId, data.pathA.id));
		await db
			.update(appUser)
			.set({ brbHighlights: false })
			.where(eq(appUser.id, "user-a"));

		await applyPathHook("not-ready", { path: "alpha-1" });

		const state = await stateFor(data.pathA.id);
		expect(state?.brbSince).toBeInstanceOf(Date);
		expect(state?.brbHighlightsSnapshot).toBeNull();
	});

	test("empty, disabled, and flag-off libraries keep the still fallback", async () => {
		const data = await seedLiveBrb();
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-a"));
		await applyPathHook("not-ready", { path: "alpha-1" });
		const empty = await brbTick("alpha-1", "twitch", {
			presign: async () => "unused",
		});
		expect(empty.stop ? undefined : empty.highlights).toBeNull();
		await applyPathHook("ready", { path: "alpha-1" });
		await db.insert(brbHighlight).values({
			id: "disabled",
			userId: "user-a",
			storageKey: "brb/user-a/highlights/disabled.mp4",
			filename: "disabled.mp4",
			label: "Disabled",
			durationMs: 1000,
			byteSize: 1024,
			contentType: "video/mp4",
			codec: "avc1",
			width: 1280,
			height: 720,
			checksum: "d".repeat(64),
			position: 0,
			enabled: false,
		});
		await applyPathHook("not-ready", { path: "alpha-1" });
		const disabled = await brbTick("alpha-1", "twitch", {
			presign: async () => "unused",
		});
		expect(disabled.stop ? undefined : disabled.highlights).toBeNull();
		await applyPathHook("ready", { path: "alpha-1" });
		await db
			.update(brbHighlight)
			.set({ enabled: true })
			.where(eq(brbHighlight.id, "disabled"));
		await db
			.update(appUser)
			.set({ brbHighlights: false })
			.where(eq(appUser.id, "user-a"));
		await applyPathHook("not-ready", { path: "alpha-1" });
		const flagOff = await brbTick("alpha-1", "twitch", {
			presign: async () => "unused",
		});
		expect(flagOff.stop ? undefined : flagOff.highlights).toBeNull();
		expect((await stateFor(data.pathA.id))?.brbHighlightsSnapshot).toBeNull();
	});

	test("highlight preference patches do not overwrite a concurrent toggle", async () => {
		await seed();
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-a"));

		await Promise.all([
			setBrbHighlightPrefs("user-a", { muted: true }),
			setBrbHighlightPrefs("user-a", { overlay: false }),
		]);

		const row = await db.query.appUser.findFirst({
			where: eq(appUser.id, "user-a"),
		});
		expect(row).toMatchObject({
			brbHighlightsMuted: true,
			brbHighlightsOverlay: false,
		});
	});

	test("highlight CRUD stays account-scoped and enforces the five-clip limit", async () => {
		await seed();
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-a"));
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-b"));
		const clips = Array.from({ length: 5 }, (_, position) => ({
			id: `clip-${position}`,
			userId: "user-a",
			storageKey: `brb/user-a/highlights/clip-${position}.mp4`,
			filename: `clip-${position}.mp4`,
			label: `Clip ${position}`,
			durationMs: 10_000,
			byteSize: 1024,
			contentType: "video/mp4",
			codec: "avc1",
			width: 1920,
			height: 1080,
			checksum: String(position).repeat(64),
			position,
		}));
		await db.insert(brbHighlight).values(clips);
		await expect(
			getBrbHighlightUploadUrl("user-a", { presign: async () => "unused" }),
		).rejects.toThrow("full");

		expect(
			await updateBrbHighlight("user-a", "clip-0", {
				label: "Opening",
				enabled: false,
			}),
		).toMatchObject({ label: "Opening", enabled: false });
		await reorderBrbHighlights("user-a", clips.map(({ id }) => id).reverse());
		expect(
			(
				await db.query.brbHighlight.findMany({
					where: eq(brbHighlight.userId, "user-a"),
					orderBy: (clip, { asc }) => asc(clip.position),
				})
			).map(({ id }) => id),
		).toEqual(clips.map(({ id }) => id).reverse());
		const deleted: string[] = [];
		await expect(
			deleteBrbHighlight("user-a", "clip-0", {
				delete: async () => {
					throw new Error("storage unavailable");
				},
			}),
		).rejects.toThrow("storage unavailable");
		expect(
			await db.query.brbHighlight.findFirst({
				where: eq(brbHighlight.id, "clip-0"),
			}),
		).toBeDefined();
		expect(
			await deleteBrbHighlight("user-a", "clip-0", {
				delete: async (key) => void deleted.push(key),
			}),
		).toBe(true);
		expect(deleted).toEqual(["brb/user-a/highlights/clip-0.mp4"]);
		expect(
			await updateBrbHighlight("user-b", "clip-1", { enabled: false }),
		).toBeNull();
	});

	test("upload URLs target a temporary key, never the immutable relay key", async () => {
		await seed();
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-a"));
		let key = "";

		const target = await getBrbHighlightUploadUrl("user-a", {
			presign: async (value) => {
				key = value;
				return "https://object.test/upload";
			},
		});

		expect(key).toBe(
			brbHighlightUploadKey("user-a", target.id, target.uploadId),
		);
		expect(key).not.toBe(brbHighlightKey("user-a", target.id));
	});

	test("confirm reads and persists actual MP4 metadata instead of the browser claim", async () => {
		await seed();
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-a"));
		const bytes = validHighlightMp4();
		const deleted: string[] = [];
		globalThis.fetch = Object.assign(async () => new Response(bytes), {
			preconnect: originalFetch.preconnect,
		});
		const clip = await confirmBrbHighlightUpload(
			"user-a",
			{
				id: "00000000-0000-4000-8000-000000000001",
				uploadId: highlightUploadId,
				filename: "real.mp4",
				label: "Real",
			},
			{
				stat: async () => ({
					lastModified: new Date(),
					byteSize: bytes.length,
					contentType: "video/mp4",
				}),
				presign: async () => "https://object.test/real.mp4",
				copy: async () => undefined,
				delete: async (key) => void deleted.push(key),
			},
		);
		expect(clip).toMatchObject({
			durationMs: 750,
			codec: "avc1",
			width: 1280,
			height: 720,
			byteSize: bytes.length,
			contentType: "video/mp4",
		});
		expect(clip?.checksum).toMatch(/^[a-f\d]{64}$/);
		expect(deleted).toEqual([
			brbHighlightUploadKey(
				"user-a",
				"00000000-0000-4000-8000-000000000001",
				highlightUploadId,
			),
		]);
		const retry = await confirmBrbHighlightUpload(
			"user-a",
			{
				id: clip?.id ?? "",
				uploadId: highlightUploadId,
				filename: "retry.mp4",
			},
			{
				stat: async () => {
					throw new Error("retry cannot reach object storage");
				},
				presign: async () => "unused",
				copy: async () => undefined,
				delete: async (key) => void deleted.push(key),
			},
		);
		expect(retry?.id).toBe(clip?.id);
		expect(deleted).toEqual([
			brbHighlightUploadKey(
				"user-a",
				"00000000-0000-4000-8000-000000000001",
				highlightUploadId,
			),
			brbHighlightUploadKey(
				"user-a",
				"00000000-0000-4000-8000-000000000001",
				highlightUploadId,
			),
		]);
	});

	test("a stale upload can neither overwrite nor recreate confirmed media", async () => {
		await seed();
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-a"));
		const bytes = validHighlightMp4();
		const id = "00000000-0000-4000-8000-000000000010";
		const temporary = brbHighlightUploadKey("user-a", id, highlightUploadId);
		const final = brbHighlightKey("user-a", id);
		const objects = new Map<string, Uint8Array>([[temporary, bytes]]);
		let reading = temporary;
		globalThis.fetch = Object.assign(
			async () => new Response(objects.get(reading)),
			{ preconnect: originalFetch.preconnect },
		);
		const client = {
			stat: async (key: string) => ({
				lastModified: new Date(),
				byteSize: objects.get(key)?.length ?? 0,
				contentType: "video/mp4",
			}),
			presign: async (key: string) => {
				reading = key;
				return `https://object.test/${key}`;
			},
			copy: async (source: string, destination: string) => {
				const value = objects.get(source);
				if (!value) throw new Error("missing source");
				objects.set(destination, value.slice());
			},
			delete: async (key: string) => void objects.delete(key),
		};

		await confirmBrbHighlightUpload(
			"user-a",
			{ id, uploadId: highlightUploadId },
			client,
		);
		expect(objects.get(final)).toEqual(bytes);
		objects.set(temporary, new Uint8Array([1, 2, 3]));
		expect(objects.get(final)).toEqual(bytes);

		await deleteBrbHighlight("user-a", id, client);
		objects.set(temporary, bytes);
		await expect(
			confirmBrbHighlightUpload(
				"user-a",
				{ id, uploadId: highlightUploadId },
				client,
			),
		).rejects.toThrow("expired");
		expect(objects.has(final)).toBe(false);
	});

	test("confirm rejects an upload changed while it is promoted", async () => {
		await seed();
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-a"));
		const bytes = validHighlightMp4();
		const changed = new Uint8Array([1, 2, 3]);
		const id = "00000000-0000-4000-8000-000000000011";
		const temporary = brbHighlightUploadKey("user-a", id, highlightUploadId);
		const final = brbHighlightKey("user-a", id);
		const objects = new Map<string, Uint8Array>([[temporary, bytes]]);
		let reading = temporary;
		globalThis.fetch = Object.assign(
			async () => new Response(objects.get(reading)),
			{ preconnect: originalFetch.preconnect },
		);
		const client = {
			stat: async (key: string) => ({
				lastModified: new Date(),
				byteSize: objects.get(key)?.length ?? 0,
				contentType: "video/mp4",
			}),
			presign: async (key: string) => {
				reading = key;
				return `https://object.test/${key}`;
			},
			copy: async (_source: string, destination: string) => {
				objects.set(destination, changed);
			},
			delete: async (key: string) => void objects.delete(key),
		};

		await expect(
			confirmBrbHighlightUpload(
				"user-a",
				{ id, uploadId: highlightUploadId },
				client,
			),
		).rejects.toThrow();
		expect(
			await db.query.brbHighlight.findFirst({
				where: eq(brbHighlight.id, id),
			}),
		).toBeUndefined();
		expect(objects.has(final)).toBe(false);
	});

	test("deleting a frozen clip defers its blob until the hold ends", async () => {
		await seedLiveBrb();
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-a"));
		const key = "brb/user-a/highlights/active.mp4";
		await db.insert(brbHighlight).values({
			id: "active",
			userId: "user-a",
			storageKey: key,
			filename: "active.mp4",
			label: "Active",
			durationMs: 1000,
			byteSize: 100,
			contentType: "video/mp4",
			codec: "avc1",
			width: 1280,
			height: 720,
			checksum: "a".repeat(64),
			position: 0,
		});
		await applyPathHook("not-ready", { path: "alpha-1" });
		const deleted: string[] = [];
		const client = {
			delete: async (value: string) => void deleted.push(value),
		};

		expect(await deleteBrbHighlight("user-a", "active", client)).toBe(true);
		expect(deleted).toEqual([]);
		expect(
			await db.query.brbHighlight.findFirst({
				where: eq(brbHighlight.id, "active"),
			}),
		).toMatchObject({ deletedAt: expect.any(Date), enabled: false });
		const tick = await brbTick("alpha-1", "twitch", {
			presign: async () => "https://object.test/active.mp4",
		});
		expect(tick.stop ? null : tick.highlights?.clips[0]?.id).toBe("active");

		await applyPathHook(
			"ready",
			{ path: "alpha-1", sourceType: "srtConn" },
			client,
		);
		expect(deleted).toEqual([key]);
	});

	test("confirm allocates after the highest position when a middle clip was deleted", async () => {
		await seed();
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-a"));
		await db.insert(brbHighlight).values(
			[0, 1, 2].map((position) => ({
				id: `existing-${position}`,
				userId: "user-a",
				storageKey: `brb/user-a/highlights/existing-${position}.mp4`,
				filename: `existing-${position}.mp4`,
				label: `Existing ${position}`,
				durationMs: 1000,
				byteSize: 100,
				contentType: "video/mp4",
				codec: "avc1",
				width: 1280,
				height: 720,
				checksum: String(position).repeat(64),
				position,
			})),
		);
		await deleteBrbHighlight("user-a", "existing-1", {
			delete: async () => undefined,
		});
		const bytes = validHighlightMp4();
		globalThis.fetch = Object.assign(async () => new Response(bytes), {
			preconnect: originalFetch.preconnect,
		});
		const clip = await confirmBrbHighlightUpload(
			"user-a",
			{
				id: "00000000-0000-4000-8000-000000000003",
				uploadId: highlightUploadId,
			},
			{
				stat: async () => ({
					lastModified: new Date(),
					byteSize: bytes.length,
					contentType: "video/mp4",
				}),
				presign: async () => "https://object.test/position.mp4",
				copy: async () => undefined,
				delete: async () => undefined,
			},
		);
		expect(clip?.position).toBe(3);
		expect(
			(
				await db.query.brbHighlight.findMany({
					where: eq(brbHighlight.userId, "user-a"),
				})
			).map(({ position }) => position),
		).toEqual(expect.arrayContaining([0, 2, 3]));
	});

	test("confirm performs object I/O before locking and rechecks deletion before insert", async () => {
		await seed();
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-a"));
		const bytes = validHighlightMp4();
		const deleted: string[] = [];
		globalThis.fetch = Object.assign(async () => new Response(bytes), {
			preconnect: originalFetch.preconnect,
		});
		await expect(
			confirmBrbHighlightUpload(
				"user-a",
				{
					id: "00000000-0000-4000-8000-000000000002",
					uploadId: highlightUploadId,
				},
				{
					stat: async () => {
						await db
							.update(appUser)
							.set({ brbHighlightsDeleting: true })
							.where(eq(appUser.id, "user-a"));
						return {
							lastModified: new Date(),
							byteSize: bytes.length,
							contentType: "video/mp4",
						};
					},
					presign: async () => "https://object.test/race.mp4",
					copy: async () => undefined,
					delete: async (key) => void deleted.push(key),
				},
			),
		).rejects.toThrow("not enabled");
		expect(deleted).toEqual([
			brbHighlightUploadKey(
				"user-a",
				"00000000-0000-4000-8000-000000000002",
				highlightUploadId,
			),
			brbHighlightKey("user-a", "00000000-0000-4000-8000-000000000002"),
		]);
		expect(
			await db.query.brbHighlight.findFirst({
				where: eq(brbHighlight.id, "00000000-0000-4000-8000-000000000002"),
			}),
		).toBeUndefined();
	});

	test("confirm rejects oversize, flag-revoked, and deleting-account uploads and cleans up", async () => {
		await seed();
		await db
			.update(appUser)
			.set({ brbHighlights: true })
			.where(eq(appUser.id, "user-a"));
		const deleted: string[] = [];
		let presigned = false;
		const bytes = validHighlightMp4();
		let byteSize = MAX_BRB_HIGHLIGHT_BYTES + 1;
		globalThis.fetch = Object.assign(async () => new Response(bytes), {
			preconnect: originalFetch.preconnect,
		});
		const client = {
			stat: async () => ({
				lastModified: new Date(),
				byteSize,
				contentType: "video/mp4",
			}),
			presign: async () => {
				presigned = true;
				return "unused";
			},
			copy: async () => undefined,
			delete: async (key: string) => void deleted.push(key),
		};
		const metadata = {
			id: "00000000-0000-4000-8000-000000000001",
			uploadId: highlightUploadId,
			filename: "clip.mp4",
			label: "Clip",
			durationMs: 1000,
			byteSize: 1024,
			contentType: "video/mp4",
			codec: "avc1",
			width: 1280,
			height: 720,
			checksum: "a".repeat(64),
		};
		await expect(
			confirmBrbHighlightUpload("user-a", metadata, client),
		).rejects.toThrow("25 MB");
		expect(presigned).toBe(false);
		expect(deleted).toEqual([
			brbHighlightUploadKey(
				"user-a",
				"00000000-0000-4000-8000-000000000001",
				highlightUploadId,
			),
			brbHighlightKey("user-a", "00000000-0000-4000-8000-000000000001"),
		]);
		await db
			.update(appUser)
			.set({ brbHighlights: false })
			.where(eq(appUser.id, "user-a"));
		byteSize = bytes.length;
		await expect(
			confirmBrbHighlightUpload("user-a", metadata, client),
		).rejects.toThrow("not enabled");
		expect(deleted).toHaveLength(4);
		await db
			.update(appUser)
			.set({ brbHighlights: true, brbHighlightsDeleting: true })
			.where(eq(appUser.id, "user-a"));
		await expect(
			confirmBrbHighlightUpload("user-a", metadata, client),
		).rejects.toThrow("not enabled");
		expect(presigned).toBe(true);
		expect(deleted).toHaveLength(6);
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

	test("ready records a hold that becomes active after its initial path read", async () => {
		const data = await seedLiveBrb();
		let ready: Promise<boolean> | undefined;
		await db.transaction(async (tx) => {
			await tx.execute(
				sql`select 1 from ${pathState} where ${pathState.pathId} = ${data.pathA.id} for update`,
			);
			ready = applyPathHook("ready", {
				path: "alpha-1",
				sourceType: "srtConn",
			});
			await Bun.sleep(50);
			await tx
				.update(pathState)
				.set({ brbSince: new Date() })
				.where(eq(pathState.pathId, data.pathA.id));
		});
		expect(await ready).toBe(true);
		const state = await stateFor(data.pathA.id);
		expect(state?.brbSince).toBeNull();
		expect(state?.brbHighlightsResultAt).toBeInstanceOf(Date);
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

	test("forwards a custom landscape output without persisting its credential", async () => {
		const data = await seedDirect();
		const caller = await callerFor("user-a");
		const secret = "CUSTOM_STREAM_SECRET";
		const created = await caller.direct.custom.create({
			name: "SRT backup",
			url: `srt://8.8.8.8:9000?streamid=publish:${secret}`,
		});
		const assigned = await caller.direct.custom.assign({
			destinationId: created.destination.id,
			pathId: data.pathA.id,
			enabled: true,
		});
		if (!assigned.outputId) throw new Error("custom output was not assigned");
		const outputId = assigned.outputId;
		expect((await caller.direct.list()).customOutputs).toEqual([
			expect.objectContaining({
				id: outputId,
				name: "SRT backup",
				protocol: "srt",
				pathId: data.pathA.id,
			}),
		]);

		const prepared = await prepareDirect("user-a", data.pathA.id);
		expect(prepared.contributionMode).toBe("direct");
		expect(prepared.customOutputIds).toEqual([outputId]);
		const resolved = await resolveDirectDestinationsV3("alpha-1", directDeps());
		expect(resolved.destinations).toEqual([
			expect.objectContaining({
				outputId,
				kind: "custom",
				protocol: "srt",
				muxer: "mpegts",
				url: `srt://8.8.8.8:9000?streamid=publish:${secret}`,
			}),
		]);
		const [stored] = await db
			.select({
				encryptedUrl: customDirectDestination.encryptedUrl,
				state: customDirectOutput.state,
				error: customDirectOutput.error,
			})
			.from(customDirectDestination)
			.innerJoin(
				customDirectOutput,
				eq(customDirectOutput.destinationId, customDirectDestination.id),
			);
		expect(stored?.encryptedUrl).not.toContain(secret);
		expect(stored?.state).toBe("starting");
		expect(stored?.error).toBeNull();

		await applyCustomDirectState({
			slug: "alpha-1",
			outputId,
			state: "retrying",
			error: `failed srt://8.8.8.8:9000?streamid=${secret}`,
		});
		expect((await caller.direct.list()).customOutputs[0]?.error).toBe(
			"failed [url]",
		);
		await db
			.update(pathState)
			.set({ publishing: true })
			.where(eq(pathState.pathId, data.pathA.id));
		await caller.direct.custom.assign({
			destinationId: created.destination.id,
			pathId: data.pathA.id,
			enabled: false,
		});
		expect(await customDirectOutputActive("alpha-1", outputId)).toBe(false);
		await applyCustomDirectState({
			slug: "alpha-1",
			outputId,
			state: "stopped",
		});
		expect((await caller.direct.list()).customOutputs).toEqual([]);
	});

	test("isolates custom portrait framing, capacity, and stopping", async () => {
		const data = await seedDirect();
		const caller = await callerFor("user-a");
		await db
			.update(appUser)
			.set({ directDualOutput: true })
			.where(eq(appUser.id, "user-a"));
		const created = await caller.direct.custom.create({
			name: "Portrait receiver",
			url: "rtmp://8.8.8.8/app/CUSTOM_PORTRAIT_SECRET",
		});
		const landscape = await caller.direct.custom.assign({
			destinationId: created.destination.id,
			pathId: data.pathA.id,
			enabled: true,
		});
		if (!landscape.outputId)
			throw new Error("custom landscape was not assigned");
		const portrait = await caller.direct.setCustomRole({
			outputId: landscape.outputId,
			pathId: data.pathA.id,
			role: "portrait",
		});
		const crop = { x: 0.36, y: 0.1, w: 0.2848, h: 0.9, aspect: "9:16" };
		await caller.direct.saveCustomCrop({
			outputId: portrait.outputId,
			pathId: data.pathA.id,
			crop,
		});

		await db.update(relay).set({ maxForwarders: 1 });
		const partial = await prepareDirect("user-a", data.pathA.id);
		expect(partial.customOutputIds).toEqual([landscape.outputId]);
		expect(
			(await caller.direct.list()).customOutputs.find(
				(output) => output.id === portrait.outputId,
			),
		).toMatchObject({
			crop,
			state: "failed",
			error: "No free Direct slot for portrait. Landscape can still go live.",
		});

		await db.update(relay).set({ maxForwarders: 2 });
		const prepared = await prepareDirect("user-a", data.pathA.id);
		expect(prepared.customOutputIds).toEqual([
			landscape.outputId,
			portrait.outputId,
		]);
		const resolved = await resolveDirectDestinationsV3("alpha-1", directDeps());
		expect(
			resolved.destinations.find(
				(output) => output.outputId === portrait.outputId,
			),
		).toMatchObject({
			role: "portrait",
			protocol: "rtmp",
			muxer: "flv",
			filter: "crop=iw*0.2848:ih*0.9:iw*0.36:ih*0.1,scale=1080:1920",
		});

		await db
			.update(pathState)
			.set({ publishing: true })
			.where(eq(pathState.pathId, data.pathA.id));
		await applyCustomDirectState({
			slug: "alpha-1",
			outputId: portrait.outputId,
			state: "live",
		});
		expect(
			await caller.direct.setCustomRole({
				outputId: portrait.outputId,
				pathId: data.pathA.id,
				role: "landscape",
			}),
		).toMatchObject({ removalPending: true });
		expect(await customDirectOutputActive("alpha-1", portrait.outputId)).toBe(
			false,
		);
		await applyCustomDirectState({
			slug: "alpha-1",
			outputId: portrait.outputId,
			state: "stopped",
		});
		expect(
			(await caller.direct.list()).customOutputs.map((output) => output.id),
		).toEqual([landscape.outputId]);
	});
});
