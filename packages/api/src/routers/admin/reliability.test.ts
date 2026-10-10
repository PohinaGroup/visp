import "../../test-env";

import { db } from "@VISP/db";
import {
	appUser,
	customDirectDestination,
	customDirectOutput,
	directDestination,
	relay,
	relayPath,
	relayStreamSession,
	rttSample,
	user,
} from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Context } from "../../context";
import { ensureDefaultRelay } from "../../relays";
import { adminReliabilityRouter, sessionSuccessInput } from "./reliability";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const at = (value: string) => new Date(value);
const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** A caller whose session resolves to `id`; admin access is read from the DB. */
function callerFor(id: string) {
	const now = new Date();
	const session = {
		user: {
			id,
			name: id,
			email: `${id}@example.test`,
			emailVerified: true,
			image: null,
			createdAt: now,
			updatedAt: now,
			role: "user",
			banned: false,
			banReason: null,
			banExpires: null,
		},
		session: {
			id: `session-${id}`,
			token: `token-${id}`,
			userId: id,
			expiresAt: new Date(now.getTime() + 60_000),
			createdAt: now,
			updatedAt: now,
			ipAddress: null,
			userAgent: null,
		},
	} as unknown as Context["session"];
	return adminReliabilityRouter.createCaller({
		auth: null,
		headers: new Headers(),
		session,
	});
}

/** How a path is wired to Direct: decides whether its sessions count. */
type DirectKind = "flag" | "destination" | "custom" | "none";

/** [started_at, seconds to first live (null = never live), open?]. */
type SeedSession = [Date | string, number | null, "open"?];

type SeedUser = {
	id: string;
	role?: string;
	banned?: boolean;
	paths?: { direct: DirectKind; sessions: SeedSession[] }[];
};

const now = Date.now();

const USERS: SeedUser[] = [
	{
		id: "alice",
		paths: [
			{
				direct: "flag",
				sessions: [
					// Before METRICS_DATA_START: clamped away, never a failure.
					["2026-09-05T10:00:00Z", null],
					["2026-09-14T10:00:00Z", 30],
					["2026-09-15T10:00:00Z", 90],
					["2026-09-16T10:00:00Z", null],
					["2026-09-18T10:00:00Z", 20],
					["2026-09-22T10:00:00Z", 10],
				],
			},
		],
	},
	{
		id: "bob",
		paths: [
			{
				direct: "destination",
				sessions: [
					["2026-09-17T12:00:00Z", 60],
					["2026-09-23T12:00:00Z", null],
					["2026-09-24T12:00:00Z", 120],
				],
			},
		],
	},
	{
		id: "carol",
		paths: [
			{ direct: "custom", sessions: [["2026-09-25T08:00:00Z", 40]] },
			// Open, not live, 5 min old: still connecting, not counted.
			{
				direct: "flag",
				sessions: [[new Date(now - 5 * MINUTE), null, "open"]],
			},
			// Open, not live, 20 min old: a failure.
			{
				direct: "custom",
				sessions: [[new Date(now - 20 * MINUTE), null, "open"]],
			},
		],
	},
	// Everything below must be invisible.
	{
		// OBS-only path: never gets first_live_at, so it is not a Direct session.
		id: "dave",
		paths: [{ direct: "none", sessions: [["2026-09-15T09:00:00Z", null]] }],
	},
	{
		id: "staff",
		role: "user,admin",
		paths: [{ direct: "flag", sessions: [["2026-09-15T09:00:00Z", 5]] }],
	},
	{
		id: "break-glass-admin",
		paths: [{ direct: "flag", sessions: [["2026-09-15T09:00:00Z", null]] }],
	},
	{
		id: "spammer",
		banned: true,
		paths: [{ direct: "flag", sessions: [["2026-09-15T09:00:00Z", null]] }],
	},
	{ id: "member" },
];

const SECOND_RELAY = "reliability-test-relay-b";

/** [user, relay ("default" | "b" | null), rtt_ms, method, created_at]. */
type SeedRtt = [string, "default" | "b" | null, number, string, string];

const RTT: SeedRtt[] = [
	// default relay, 09-14: alice probes a lot but is one median (30).
	["alice", "default", 10, "browser-probe", "2026-09-14T08:00:00Z"],
	["alice", "default", 20, "browser-probe", "2026-09-14T08:01:00Z"],
	["alice", "default", 30, "browser-probe", "2026-09-14T08:02:00Z"],
	["alice", "default", 40, "browser-probe", "2026-09-14T08:03:00Z"],
	["alice", "default", 50, "browser-probe", "2026-09-14T08:04:00Z"],
	["bob", "default", 100, "browser-probe", "2026-09-14T09:00:00Z"],
	["carol", "default", 60, "browser-probe", "2026-09-14T10:00:00Z"],
	["carol", "default", 80, "manual", "2026-09-14T10:05:00Z"],
	// Excluded: an admin, and a sample without a relay.
	["staff", "default", 500, "browser-probe", "2026-09-14T11:00:00Z"],
	["bob", null, 900, "browser-probe", "2026-09-14T12:00:00Z"],
	// relay b, 09-15: alice's median of 100 and 200.
	["alice", "b", 100, "browser-probe", "2026-09-15T08:00:00Z"],
	["alice", "b", 200, "manual", "2026-09-15T08:10:00Z"],
	// On the exclusive end of the daily range.
	["bob", "default", 999, "browser-probe", "2026-09-16T00:00:00Z"],
	// Later in the same ISO week: only in the weekly bucket.
	["bob", "default", 50, "browser-probe", "2026-09-17T09:00:00Z"],
];

async function seed() {
	await ensureDefaultRelay();
	const defaultRelay = await db.query.relay.findFirst({
		where: eq(relay.name, "default"),
	});
	if (!defaultRelay) throw new Error("default test relay was not created");
	const [secondRelay] = await db
		.insert(relay)
		.values({
			name: SECOND_RELAY,
			host: "b.relay.test",
			apiUrl: "http://100.64.0.11:9997",
			pingUrl: "https://b.relay.test/ping",
			region: "test-b",
			capacityPaths: 10,
			maxForwarders: 2,
			publicIp: "pending",
		})
		.returning();
	if (!secondRelay) throw new Error("second relay was not created");

	for (const seedUser of USERS) {
		await db.insert(user).values({
			id: seedUser.id,
			name: seedUser.id,
			email: `${seedUser.id}@example.test`,
			role: seedUser.role ?? "user",
			banned: seedUser.banned ?? false,
			createdAt: at("2026-09-01T00:00:00Z"),
		});
		await db.insert(appUser).values({ id: seedUser.id, handle: seedUser.id });
		for (const [index, seedPath] of (seedUser.paths ?? []).entries()) {
			const [path] = await db
				.insert(relayPath)
				.values({
					relayId: defaultRelay.id,
					userId: seedUser.id,
					seq: index + 1,
					slug: `${seedUser.id}-${index + 1}`,
					label: "main",
					// The flag columns are unique per user and provider.
					directTwitch: seedPath.direct === "flag" && index === 0,
					directKick: seedPath.direct === "flag" && index > 0,
				})
				.returning();
			if (!path) throw new Error("test path was not created");
			if (seedPath.direct === "destination") {
				await db.insert(directDestination).values({
					userId: seedUser.id,
					pathId: path.id,
					provider: "twitch",
				});
			}
			if (seedPath.direct === "custom") {
				const destinationId = `${seedUser.id}-dest-${index}`;
				await db.insert(customDirectDestination).values({
					id: destinationId,
					userId: seedUser.id,
					name: `dest ${index}`,
					protocol: "rtmp",
					encryptedUrl: "encrypted",
					endpointSummary: "rtmp://example.test",
				});
				await db.insert(customDirectOutput).values({
					id: `${seedUser.id}-output-${index}`,
					userId: seedUser.id,
					destinationId,
					pathId: path.id,
				});
			}
			for (const [startedAt, liveAfter, open] of seedPath.sessions) {
				const start = new Date(startedAt);
				await db.insert(relayStreamSession).values({
					pathId: path.id,
					startedAt: start,
					firstLiveAt:
						liveAfter === null
							? null
							: new Date(start.getTime() + liveAfter * SECOND),
					endedAt: open ? null : new Date(start.getTime() + 60 * MINUTE),
				});
			}
		}
	}

	for (const [userId, relayKey, rttMs, method, createdAt] of RTT) {
		await db.insert(rttSample).values({
			userId,
			relayId:
				relayKey === null
					? null
					: relayKey === "default"
						? defaultRelay.id
						: secondRelay.id,
			rttMs,
			method,
			createdAt: at(createdAt),
		});
	}
}

const EMPTY = {
	started: 0,
	live: 0,
	successRate: null,
	startToLiveP50Sec: null,
	startToLiveP95Sec: null,
};

test("input rejects an inverted or oversized range", () => {
	const base = { interval: "week" as const };
	expect(
		sessionSuccessInput.safeParse({
			...base,
			from: "2026-09-21T00:00:00Z",
			to: "2026-09-14T00:00:00Z",
		}).success,
	).toBe(false);
	expect(
		sessionSuccessInput.safeParse({
			...base,
			from: "2025-01-01T00:00:00Z",
			to: "2026-09-14T00:00:00Z",
		}).success,
	).toBe(false);
});

integration("admin.reliability", () => {
	const admin = callerFor("staff");

	beforeAll(async () => {
		// Reliability metrics are global aggregates: start from no users.
		await db.delete(user);
		await db.delete(relay).where(eq(relay.name, SECOND_RELAY));
		await seed();
	});

	afterAll(async () => {
		await db.delete(user);
		await db.delete(relay).where(eq(relay.name, SECOND_RELAY));
	});

	test("rejects non-admins", async () => {
		const range = {
			from: "2026-09-07T00:00:00Z",
			to: "2026-10-05T00:00:00Z",
			interval: "week" as const,
		};
		const member = callerFor("member");
		await expect(member.sessionSuccess(range)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(member.rtt(range)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("weekly Direct session success and start-to-live, clamped to the data start", async () => {
		const result = await admin.sessionSuccess({
			from: "2026-08-31T00:00:00Z",
			to: "2026-10-05T00:00:00Z",
			interval: "week",
		});
		expect(result.dataStart).toBe("2026-09-07T00:00:00.000Z");
		expect(result.from).toBe("2026-09-07T00:00:00.000Z");
		expect(result.buckets).toEqual([
			{ bucket: "2026-09-07T00:00:00.000Z", ...EMPTY },
			{
				// 30, 90, 20, 60 s live; one failure.
				bucket: "2026-09-14T00:00:00.000Z",
				started: 5,
				live: 4,
				successRate: 0.8,
				startToLiveP50Sec: 45,
				startToLiveP95Sec: 85.5,
			},
			{
				// 10, 120, 40 s live; one failure.
				bucket: "2026-09-21T00:00:00.000Z",
				started: 4,
				live: 3,
				successRate: 0.75,
				startToLiveP50Sec: 40,
				startToLiveP95Sec: 112,
			},
			{ bucket: "2026-09-28T00:00:00.000Z", ...EMPTY },
		]);
		expect(result.totals).toEqual({
			started: 9,
			live: 7,
			successRate: 7 / 9,
			startToLiveP50Sec: 40,
			startToLiveP95Sec: 111,
		});
	});

	test("daily buckets", async () => {
		const result = await admin.sessionSuccess({
			from: "2026-09-14T00:00:00Z",
			to: "2026-09-17T00:00:00Z",
			interval: "day",
		});
		expect(result.buckets).toEqual([
			{
				bucket: "2026-09-14T00:00:00.000Z",
				started: 1,
				live: 1,
				successRate: 1,
				startToLiveP50Sec: 30,
				startToLiveP95Sec: 30,
			},
			{
				bucket: "2026-09-15T00:00:00.000Z",
				started: 1,
				live: 1,
				successRate: 1,
				startToLiveP50Sec: 90,
				startToLiveP95Sec: 90,
			},
			// A failure-only day is a 0% rate, not "no data".
			{
				bucket: "2026-09-16T00:00:00.000Z",
				...EMPTY,
				started: 1,
				successRate: 0,
			},
		]);
		expect(result.totals).toEqual({
			started: 3,
			live: 2,
			successRate: 2 / 3,
			startToLiveP50Sec: 60,
			startToLiveP95Sec: 87,
		});
	});

	test("totals cover exactly [from, to) while the first week bucket is whole", async () => {
		const result = await admin.sessionSuccess({
			from: "2026-09-16T00:00:00Z",
			to: "2026-09-23T00:00:00Z",
			interval: "week",
		});
		expect(result.buckets.map((b) => [b.bucket, b.started, b.live])).toEqual([
			["2026-09-14T00:00:00.000Z", 5, 4],
			["2026-09-21T00:00:00.000Z", 1, 1],
		]);
		// 09-16 failure, 09-17 (60 s), 09-18 (20 s), 09-22 (10 s).
		expect(result.totals).toEqual({
			started: 4,
			live: 3,
			successRate: 0.75,
			startToLiveP50Sec: 20,
			startToLiveP95Sec: 56,
		});
	});

	test("still-connecting sessions are left out, stale ones fail", async () => {
		const result = await admin.sessionSuccess({
			from: new Date(now - 24 * 60 * MINUTE).toISOString(),
			to: new Date(now + 24 * 60 * MINUTE).toISOString(),
			interval: "day",
		});
		expect(result.totals).toEqual({ ...EMPTY, started: 1, successRate: 0 });
	});

	test("a range wholly before the data start has no buckets", async () => {
		const result = await admin.sessionSuccess({
			from: "2026-08-01T00:00:00Z",
			to: "2026-09-07T00:00:00Z",
			interval: "week",
		});
		expect(result.buckets).toEqual([]);
		expect(result.totals).toEqual(EMPTY);
	});

	test("daily RTT per relay from per-user medians", async () => {
		const result = await admin.rtt({
			from: "2026-09-14T00:00:00Z",
			to: "2026-09-16T00:00:00Z",
			interval: "day",
		});
		const name = (row: { relayName: string }) =>
			row.relayName === "default" ? "default" : "b";
		expect(
			result.buckets.map(({ relayId: _id, ...row }) => ({
				...row,
				relayName: name(row),
			})),
		).toEqual([
			{
				// Medians 30 (alice), 100 (bob), 70 (carol); admin and null relay out.
				bucket: "2026-09-14T00:00:00.000Z",
				relayName: "default",
				p50Ms: 70,
				p95Ms: 97,
				samples: 8,
				users: 3,
			},
			{
				bucket: "2026-09-15T00:00:00.000Z",
				relayName: "default",
				p50Ms: null,
				p95Ms: null,
				samples: 0,
				users: 0,
			},
			{
				bucket: "2026-09-14T00:00:00.000Z",
				relayName: "b",
				p50Ms: null,
				p95Ms: null,
				samples: 0,
				users: 0,
			},
			{
				bucket: "2026-09-15T00:00:00.000Z",
				relayName: "b",
				p50Ms: 150,
				p95Ms: 150,
				samples: 2,
				users: 1,
			},
		]);
	});

	test("weekly RTT and the method filter", async () => {
		const weekly = await admin.rtt({
			from: "2026-09-14T00:00:00Z",
			to: "2026-09-21T00:00:00Z",
			interval: "week",
		});
		const pick = (rows: typeof weekly.buckets) =>
			rows.map((row) => [
				row.relayName === "default" ? "default" : "b",
				row.p50Ms,
				row.p95Ms,
				row.samples,
			]);
		// Weekly medians: alice 30, carol 70, bob 100 (of 100, 999, 50).
		expect(pick(weekly.buckets)).toEqual([
			["default", 70, 97, 10],
			["b", 150, 150, 2],
		]);

		const manual = await admin.rtt({
			from: "2026-09-14T00:00:00Z",
			to: "2026-09-16T00:00:00Z",
			interval: "day",
			method: "manual",
		});
		expect(manual.method).toBe("manual");
		expect(pick(manual.buckets)).toEqual([
			["default", 80, 80, 1],
			["default", null, null, 0],
			["b", null, null, 0],
			["b", 200, 200, 1],
		]);
	});
});
