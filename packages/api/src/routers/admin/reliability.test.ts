import "../../test-env";

import { db } from "@VISP/db";
import {
	appUser,
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

/** [started_at, seconds it lasted, or "open" (no `ended_at`, no path state)]. */
type SeedSession = [Date | string, number | "open"];

type SeedUser = {
	id: string;
	role?: string;
	banned?: boolean;
	/** Sessions per path; a path can hold only one open session. */
	paths?: SeedSession[][];
};

const now = Date.now();

const USERS: SeedUser[] = [
	{
		id: "alice",
		paths: [
			[
				// Sessions are tracked from Jul 27, 2026: this one counts.
				["2026-09-05T10:00:00Z", 3600],
				["2026-09-14T10:00:00Z", 30],
				["2026-09-15T10:00:00Z", 90],
				["2026-09-16T10:00:00Z", 20],
				// Exactly the threshold is stable.
				["2026-09-18T10:00:00Z", 60],
				["2026-09-22T10:00:00Z", 10],
			],
		],
	},
	{
		id: "bob",
		paths: [
			[
				["2026-09-17T12:00:00Z", 3600],
				["2026-09-23T12:00:00Z", 45],
				["2026-09-24T12:00:00Z", 120],
			],
		],
	},
	{
		id: "carol",
		paths: [
			[["2026-09-25T08:00:00Z", 40]],
			// Open, 30 s old: still connecting, not judged.
			[[new Date(now - 30 * SECOND), "open"]],
			// Open and stale (no path state), 20 min old: a blip.
			[[new Date(now - 20 * MINUTE), "open"]],
		],
	},
	{ id: "dave", paths: [[["2026-09-15T09:00:00Z", 3600]]] },
	// Everything below must be invisible.
	{
		id: "staff",
		role: "user,admin",
		paths: [[["2026-09-15T09:00:00Z", 3600]]],
	},
	{ id: "break-glass-admin", paths: [[["2026-09-15T09:00:00Z", 5]]] },
	{ id: "spammer", banned: true, paths: [[["2026-09-15T09:00:00Z", 5]]] },
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
		for (const [index, sessions] of (seedUser.paths ?? []).entries()) {
			const [path] = await db
				.insert(relayPath)
				.values({
					relayId: defaultRelay.id,
					userId: seedUser.id,
					seq: index + 1,
					slug: `${seedUser.id}-${index + 1}`,
					label: "main",
				})
				.returning();
			if (!path) throw new Error("test path was not created");
			for (const [startedAt, length] of sessions) {
				const start = new Date(startedAt);
				await db.insert(relayStreamSession).values({
					pathId: path.id,
					startedAt: start,
					endedAt:
						length === "open"
							? null
							: new Date(start.getTime() + length * SECOND),
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

const EMPTY = { started: 0, stable: 0, stableRate: null };

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

	test("weekly stable-session rate over every eligible session", async () => {
		const result = await admin.sessionSuccess({
			from: "2026-08-31T00:00:00Z",
			to: "2026-10-05T00:00:00Z",
			interval: "week",
		});
		expect(result.dataStart).toBe("2026-07-27T00:00:00.000Z");
		expect(result.from).toBe("2026-08-31T00:00:00.000Z");
		expect(result.buckets).toEqual([
			// alice 09-05.
			{
				bucket: "2026-08-31T00:00:00.000Z",
				started: 1,
				stable: 1,
				stableRate: 1,
			},
			{ bucket: "2026-09-07T00:00:00.000Z", ...EMPTY },
			// alice 30 ✗, 90 ✓, 20 ✗, 60 ✓; bob 3600 ✓; dave 3600 ✓.
			{
				bucket: "2026-09-14T00:00:00.000Z",
				started: 6,
				stable: 4,
				stableRate: 4 / 6,
			},
			// alice 10 ✗; bob 45 ✗, 120 ✓; carol 40 ✗.
			{
				bucket: "2026-09-21T00:00:00.000Z",
				started: 4,
				stable: 1,
				stableRate: 0.25,
			},
			{ bucket: "2026-09-28T00:00:00.000Z", ...EMPTY },
		]);
		expect(result.totals).toEqual({
			started: 11,
			stable: 6,
			stableRate: 6 / 11,
		});
	});

	test("daily buckets", async () => {
		const result = await admin.sessionSuccess({
			from: "2026-09-14T00:00:00Z",
			to: "2026-09-17T00:00:00Z",
			interval: "day",
		});
		expect(result.buckets).toEqual([
			// A blip-only day is a 0% rate, not "no data".
			{
				bucket: "2026-09-14T00:00:00.000Z",
				started: 1,
				stable: 0,
				stableRate: 0,
			},
			{
				bucket: "2026-09-15T00:00:00.000Z",
				started: 2,
				stable: 2,
				stableRate: 1,
			},
			{
				bucket: "2026-09-16T00:00:00.000Z",
				started: 1,
				stable: 0,
				stableRate: 0,
			},
		]);
		expect(result.totals).toEqual({ started: 4, stable: 2, stableRate: 0.5 });
	});

	test("totals cover exactly [from, to) while the first week bucket is whole", async () => {
		const result = await admin.sessionSuccess({
			from: "2026-09-16T00:00:00Z",
			to: "2026-09-23T00:00:00Z",
			interval: "week",
		});
		expect(result.buckets.map((b) => [b.bucket, b.started, b.stable])).toEqual([
			["2026-09-14T00:00:00.000Z", 6, 4],
			["2026-09-21T00:00:00.000Z", 1, 0],
		]);
		// 09-16 blip, 09-17 (3600 s), 09-18 (60 s), 09-22 blip.
		expect(result.totals).toEqual({ started: 4, stable: 2, stableRate: 0.5 });
	});

	test("still-connecting sessions are left out, stale open ones are blips", async () => {
		const result = await admin.sessionSuccess({
			from: new Date(now - 24 * 60 * MINUTE).toISOString(),
			to: new Date(now + 24 * 60 * MINUTE).toISOString(),
			interval: "day",
		});
		expect(result.totals).toEqual({ started: 1, stable: 0, stableRate: 0 });
	});

	test("a range wholly before the data start has no buckets", async () => {
		const result = await admin.sessionSuccess({
			from: "2026-07-01T00:00:00Z",
			to: "2026-07-27T00:00:00Z",
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
