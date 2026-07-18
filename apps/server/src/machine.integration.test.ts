import "./test-env";

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
	getObsControlStatus,
	rotateObsControlToken,
	setObsStreaming,
} from "@VISP/api/obs-control";
import {
	applyPathHook,
	authenticateMedia,
	claimNativePublishDevice,
	clearAuthCacheForTests,
	createPath,
	createPublishDevice,
	ensureRelayUser,
	reconcilePathState,
	revealPublishPath,
	revokePath,
	rotatePublishPath,
	rotateReadSecret,
} from "@VISP/api/relay";
import { listSnapshots, snapshotKey } from "@VISP/api/snapshots";
import { db } from "@VISP/db";
import {
	account,
	appUser,
	chatConnection,
	pathState,
	relayPath,
	user,
} from "@VISP/db/schema/index";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { machineRoutes } from "./machine";

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
			publishSecretHash: await Bun.password.hash(publishA, {
				algorithm: "argon2id",
			}),
			readSecretHash: await Bun.password.hash(readA, { algorithm: "argon2id" }),
		},
		{
			id: "user-b",
			handle: "beta",
			publishSecretHash: await Bun.password.hash(publishB, {
				algorithm: "argon2id",
			}),
			readSecretHash: await Bun.password.hash(readB, { algorithm: "argon2id" }),
		},
	]);
	const [pathA, pathB] = await db
		.insert(relayPath)
		.values([
			{ userId: "user-a", seq: 1, slug: "alpha-1", label: "main" },
			{ userId: "user-b", seq: 1, slug: "beta-1", label: "main" },
		])
		.returning();
	if (!pathA || !pathB) throw new Error("test paths were not created");
	return { pathA, pathB, publishA, readA, publishB, readB };
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
				body: JSON.stringify({ appliedVersion: 0, streaming: false }),
			}),
		);
		expect(command.status).toBe(200);
		expect(await command.json()).toMatchObject({
			commandVersion: 1,
			desiredStreaming: true,
		});

		await app.handle(
			new Request("http://localhost/api/obs/control", {
				method: "POST",
				headers: {
					authorization: `Bearer ${pairing.token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ appliedVersion: 1, streaming: true }),
			}),
		);
		expect(await getObsControlStatus("user-a")).toMatchObject({
			connected: true,
			pending: false,
			streaming: true,
		});
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
		await expect(
			reconcilePathState("http://relay.test:9997"),
		).rejects.toThrow();
		const preserved = await db.query.pathState.findFirst({
			where: eq(pathState.pathId, data.pathA.id),
		});
		expect(preserved?.lastEventAt).toEqual(reconciledAt);
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

	test("provisions relay users from Twitch-only, Kick-only, and linked accounts", async () => {
		await db.insert(user).values([
			{ id: "twitch-only", name: "Twitch Only", email: "twitch@example.test" },
			{ id: "kick-only", name: "Kick Only", email: "kick@example.test" },
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
			ensureRelayUser("linked", "Linked"),
		]);
		expect(provisioned.map(({ id }) => id).sort()).toEqual([
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
				return Response.json({
					data: [{ subscription_id: "kick-subscription" }],
				});
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
				needsConsent: false,
				canManageChannel: false,
			},
			{
				provider: "kick",
				linked: true,
				enabled: true,
				needsConsent: false,
				canManageChannel: false,
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
				return Response.json({ data: [{ subscription_id: "reconciled-sub" }] });
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

		await db
			.delete(chatConnection)
			.where(eq(chatConnection.userId, "kick-reconcile"));
		expect(await handleVerifiedKickPayload(payload)).toBe("disabled");
		unsubscribe();
	});
});
