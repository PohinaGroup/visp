import "./test-env";

import { resolveDirectDestinations } from "@VISP/api/direct";
import { ensureDefaultRelay } from "@VISP/api/relays";
import { db } from "@VISP/db";
import {
	account,
	appUser,
	pathState,
	relay,
	relayPath,
	user,
} from "@VISP/db/schema/index";
import { beforeEach, test as bunTest, describe, expect } from "bun:test";
import { eq, sql } from "drizzle-orm";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const test = bunTest.serial;

async function seedYoutubePath() {
	await db
		.insert(user)
		.values({ id: "yt-user", name: "YT", email: "yt@example.test" });
	await db.insert(appUser).values({ id: "yt-user", handle: "yt" });
	await db.insert(account).values({
		id: "yt-google",
		accountId: "google-yt",
		providerId: "google",
		scope: "openid https://www.googleapis.com/auth/youtube.force-ssl",
		userId: "yt-user",
	});
	const defaultRelay = await db.query.relay.findFirst({
		where: eq(relay.name, "default"),
	});
	if (!defaultRelay) throw new Error("default test relay was not created");
	const [path] = await db
		.insert(relayPath)
		.values({
			relayId: defaultRelay.id,
			userId: "yt-user",
			seq: 1,
			slug: "yt-1",
			label: "main",
			directYoutube: true,
		})
		.returning();
	if (!path) throw new Error("test path was not created");
	await db.insert(pathState).values({
		pathId: path.id,
		directYoutubeReservedUntil: new Date(Date.now() + 60_000),
	});
	return path;
}

type YoutubeFake = {
	broadcastCreates: number;
	deleted: string[];
	/** Resolves once every awaited broadcast create has arrived. */
	beforeCreateReturns?: () => Promise<void>;
};

function youtubeFake(state: YoutubeFake) {
	let streams = 0;
	const ingest = (id: string) => ({
		id,
		cdn: {
			ingestionInfo: {
				rtmpsIngestionAddress: "rtmps://a.rtmp.youtube.com/live2",
				streamName: `key-of-${id}`,
			},
		},
	});
	return {
		fetch: (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
			const url = new URL(String(input));
			const method = init?.method ?? "GET";
			if (url.pathname.endsWith("/liveStreams")) {
				if (method === "POST") {
					streams += 1;
					return Response.json(ingest(`stream-${streams}`));
				}
				return Response.json({
					items: [ingest(url.searchParams.get("id") ?? "")],
				});
			}
			if (url.pathname.endsWith("/liveBroadcasts/bind"))
				return Response.json({ id: url.searchParams.get("id") });
			if (url.pathname.endsWith("/liveBroadcasts")) {
				if (method === "DELETE") {
					state.deleted.push(url.searchParams.get("id") ?? "");
					return new Response(null, { status: 204 });
				}
				if (method === "POST") {
					state.broadcastCreates += 1;
					const id = `broadcast-${state.broadcastCreates}`;
					await state.beforeCreateReturns?.();
					return Response.json({ id });
				}
				const id = url.searchParams.get("id") ?? "";
				return Response.json({
					items: [
						{
							id,
							contentDetails: { boundStreamId: "stream-1" },
							status: { lifeCycleStatus: "ready" },
						},
					],
				});
			}
			return new Response(null, { status: 404 });
		}) as typeof fetch,
		getAccessToken: async () => ({ accessToken: "provider-token" }),
	};
}

async function storedYoutube(pathId: number) {
	const [row] = await db
		.select({
			broadcastId: pathState.directYoutubeBroadcastId,
			state: pathState.directYoutubeState,
			error: pathState.directYoutubeError,
			streamId: appUser.directYoutubeStreamId,
		})
		.from(pathState)
		.innerJoin(relayPath, eq(relayPath.id, pathState.pathId))
		.innerJoin(appUser, eq(appUser.id, relayPath.userId))
		.where(eq(pathState.pathId, pathId));
	return row;
}

integration("YouTube Direct provider calls", () => {
	beforeEach(async () => {
		await db.delete(user);
		await ensureDefaultRelay();
	});

	test("no transaction or path lock is held while YouTube is slow", async () => {
		const path = await seedYoutubePath();
		let release = () => {};
		const stalled = new Promise<void>((resolve) => {
			release = resolve;
		});
		let reached = () => {};
		const inCall = new Promise<void>((resolve) => {
			reached = resolve;
		});
		const state: YoutubeFake = {
			broadcastCreates: 0,
			deleted: [],
			beforeCreateReturns: async () => {
				reached();
				await stalled;
			},
		};
		const pending = resolveDirectDestinations(path.slug, youtubeFake(state));
		await inCall;
		const [held] = await db
			.execute<{ locks: number; open: number }>(sql`
			select
				(select count(*)::int from pg_locks
					where locktype = 'advisory' and objid = ${path.id}) as locks,
				(select count(*)::int from pg_stat_activity
					where datname = current_database()
						and state like 'idle in transaction%') as open
		`)
			.then((result) => result.rows);
		expect(held).toEqual({ locks: 0, open: 0 });
		release();
		const resolved = await pending;
		expect(resolved.destinations).toEqual([
			{
				provider: "youtube",
				role: "landscape",
				filter: null,
				url: "rtmps://a.rtmp.youtube.com/live2/key-of-stream-1",
			},
		]);
		expect(await storedYoutube(path.id)).toMatchObject({
			broadcastId: "broadcast-1",
			streamId: "stream-1",
			state: "starting",
		});
	});

	test("concurrent go-lives for one path keep a single broadcast", async () => {
		const path = await seedYoutubePath();
		let bothCreating = () => {};
		const barrier = new Promise<void>((resolve) => {
			bothCreating = resolve;
		});
		const state: YoutubeFake = {
			broadcastCreates: 0,
			deleted: [],
			beforeCreateReturns: async () => {
				if (state.broadcastCreates >= 2) bothCreating();
				await barrier;
			},
		};
		const dependencies = youtubeFake(state);
		const [first, second] = await Promise.all([
			resolveDirectDestinations(path.slug, dependencies),
			resolveDirectDestinations(path.slug, dependencies),
		]);
		const stored = await storedYoutube(path.id);
		// Both raced past the read; the loser dropped its own broadcast and
		// joined the winner's instead of minting a third.
		expect(state.broadcastCreates).toBe(2);
		expect(state.deleted).toHaveLength(1);
		expect(["broadcast-1", "broadcast-2"]).toContain(stored?.broadcastId ?? "");
		expect(state.deleted[0]).not.toBe(stored?.broadcastId ?? "");
		expect(stored?.state).toBe("starting");
		expect(first.destinations).toHaveLength(1);
		expect(second.destinations).toHaveLength(1);
		expect(second.destinations[0]?.url).toBe(first.destinations[0]?.url);
		expect(first.destinations[0]?.url).toBe(
			`rtmps://a.rtmp.youtube.com/live2/key-of-${stored?.streamId}`,
		);
	});

	test("a device revoked during the YouTube calls stores nothing and cleans up", async () => {
		const path = await seedYoutubePath();
		const state: YoutubeFake = {
			broadcastCreates: 0,
			deleted: [],
			beforeCreateReturns: async () => {
				await db
					.update(relayPath)
					.set({ revokedAt: new Date() })
					.where(eq(relayPath.id, path.id));
			},
		};
		await resolveDirectDestinations(path.slug, youtubeFake(state));
		expect(state.deleted).toEqual(["broadcast-1"]);
		expect(await storedYoutube(path.id)).toMatchObject({
			broadcastId: null,
			streamId: null,
			state: "failed",
			error: "Publishing device not found",
		});
	});
});
