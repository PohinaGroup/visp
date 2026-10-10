import "./test-env";

import { db } from "@VISP/db";
import {
	account,
	appUser,
	dailyMetrics,
	pathState,
	relay,
	relayPath,
	relayStreamSession,
	user,
} from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { asc, eq, sql } from "drizzle-orm";
import { tryAdvisoryLock } from "./advisory-lock";
import {
	type DailyMetricRow,
	isDailyMetricsDue,
	isDailyMetricsRunDue,
	rollupDailyMetrics,
	runDailyMetricsJob,
} from "./daily-metrics";
import { ensureDefaultRelay } from "./relays";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const at = (value: string) => new Date(value);

describe("nightly schedule", () => {
	const due = (
		now: string,
		yesterdayComputedAt: string | null,
		startup = false,
	) =>
		isDailyMetricsRunDue({
			now: at(now),
			yesterdayComputedAt:
				yesterdayComputedAt === null ? null : at(yesterdayComputedAt),
			startup,
		});

	test("runs once the hour has passed, whenever the tick lands", () => {
		// Last night's run computed 09-19 at 03:07 on 09-20.
		const lastNight = "2026-09-20T03:07:00Z";
		expect(due("2026-09-21T02:59:59Z", lastNight)).toBe(false);
		expect(due("2026-09-21T03:00:00Z", lastNight)).toBe(true);
		// A timer that drifted past 03:59 still runs the night (the old
		// "hour === 3" check skipped it).
		expect(due("2026-09-21T04:00:30Z", lastNight)).toBe(true);
		expect(due("2026-09-21T23:59:00Z", lastNight)).toBe(true);
		// Yesterday (09-20) has no rows yet on 09-21: same answer.
		expect(due("2026-09-21T04:00:30Z", null)).toBe(true);
	});

	test("does not repeat a night that already ran, across restarts and instances", () => {
		const ranAt = "2026-09-21T03:04:00Z";
		expect(due("2026-09-21T03:15:00Z", ranAt)).toBe(false);
		expect(due("2026-09-21T12:00:00Z", ranAt)).toBe(false);
		// A restart later that day finds it done too.
		expect(due("2026-09-21T12:00:00Z", ranAt, true)).toBe(false);
	});

	test("a run before the hour does not count as the night's run", () => {
		// Caught up at 01:10 after a deploy; sessions open at midnight were
		// measured at day end, so the 03:00 run still re-rolls.
		expect(due("2026-09-21T03:15:00Z", "2026-09-21T01:10:00Z")).toBe(true);
	});

	test("startup catches up a missing yesterday at once; ticks wait for the hour", () => {
		expect(due("2026-09-21T00:20:00Z", null, true)).toBe(true);
		expect(due("2026-09-21T00:20:00Z", null)).toBe(false);
		// Startup with yesterday present before the hour waits like a tick.
		expect(due("2026-09-21T00:20:00Z", "2026-09-21T00:05:00Z", true)).toBe(
			false,
		);
	});
});

type SeedUser = {
	id: string;
	createdAt: string;
	role?: string;
	banned?: boolean;
	provider?: string;
	/** [first_live_at | null, ended_at | null, started_at?] on one device. */
	sessions?: [string | null, string | null, string?][];
	state?: { publishing: boolean; lastEventAt: string };
};

/** The rolled-up day in most tests. */
const DAY = "2026-09-15";

const USERS: SeedUser[] = [
	{
		id: "dm-alice",
		createdAt: "2026-09-15T09:00:00Z",
		provider: "twitch",
		sessions: [
			["2026-09-15T10:00:00Z", "2026-09-15T12:00:00Z"],
			// Crosses midnight: wholly in the 09-15 bucket, 2 h.
			["2026-09-15T23:00:00Z", "2026-09-16T01:00:00Z"],
			// Earlier in the trailing week only.
			["2026-09-10T10:00:00Z", "2026-09-10T11:00:00Z"],
		],
	},
	{
		id: "dm-bob",
		createdAt: "2026-09-15T20:00:00Z",
		provider: "google",
		sessions: [
			// Connected but never live: started, not live.
			[null, "2026-09-15T12:30:00Z", "2026-09-15T12:00:00Z"],
			["2026-09-12T18:00:00Z", "2026-09-12T19:00:00Z"],
		],
	},
	{
		id: "dm-carol",
		createdAt: "2026-09-01T12:00:00Z",
		// Still publishing long after the day: measured to day end, 2 h.
		sessions: [["2026-09-15T22:00:00Z", null]],
		state: { publishing: true, lastEventAt: "2026-10-10T00:00:00Z" },
	},
	{
		id: "dm-dave",
		createdAt: "2026-09-03T12:00:00Z",
		// Live 7 days before DAY: just outside the trailing window.
		sessions: [["2026-09-08T10:00:00Z", "2026-09-08T11:00:00Z"]],
	},
	// Invisible to every metric.
	{
		id: "dm-staff",
		createdAt: "2026-09-15T09:00:00Z",
		role: "user,admin",
		provider: "google",
		sessions: [["2026-09-15T10:00:00Z", "2026-09-15T15:00:00Z"]],
	},
	{
		id: "dm-spammer",
		createdAt: "2026-08-20T09:00:00Z",
		banned: true,
		provider: "kick",
		sessions: [["2026-09-15T10:00:00Z", "2026-09-15T15:00:00Z"]],
	},
];

async function seed() {
	await ensureDefaultRelay();
	const defaultRelay = await db.query.relay.findFirst({
		where: eq(relay.name, "default"),
	});
	if (!defaultRelay) throw new Error("default test relay was not created");
	for (const seedUser of USERS) {
		await db.insert(user).values({
			id: seedUser.id,
			name: seedUser.id,
			email: `${seedUser.id}@example.test`,
			role: seedUser.role ?? "user",
			banned: seedUser.banned ?? false,
			createdAt: at(seedUser.createdAt),
		});
		await db.insert(appUser).values({ id: seedUser.id, handle: seedUser.id });
		if (seedUser.provider) {
			await db.insert(account).values({
				id: `${seedUser.id}-account`,
				accountId: `${seedUser.id}-${seedUser.provider}`,
				providerId: seedUser.provider,
				userId: seedUser.id,
				createdAt: at(seedUser.createdAt),
				updatedAt: at(seedUser.createdAt),
			});
		}
		if (!seedUser.sessions) continue;
		const [path] = await db
			.insert(relayPath)
			.values({
				relayId: defaultRelay.id,
				userId: seedUser.id,
				seq: 1,
				slug: `${seedUser.id}-1`,
				label: "main",
			})
			.returning();
		if (!path) throw new Error("test path was not created");
		if (seedUser.state) {
			await db.insert(pathState).values({
				pathId: path.id,
				publishing: seedUser.state.publishing,
				lastEventAt: at(seedUser.state.lastEventAt),
			});
		}
		for (const [firstLiveAt, endedAt, startedAt] of seedUser.sessions) {
			const start = startedAt
				? at(startedAt)
				: new Date(at(firstLiveAt ?? "").getTime() - 60_000);
			await db.insert(relayStreamSession).values({
				pathId: path.id,
				startedAt: start,
				firstLiveAt: firstLiveAt ? at(firstLiveAt) : null,
				endedAt: endedAt ? at(endedAt) : null,
			});
		}
	}
}

const stored = (day: string) =>
	db
		.select({
			metric: dailyMetrics.metric,
			segment: dailyMetrics.segment,
			value: dailyMetrics.value,
		})
		.from(dailyMetrics)
		.where(eq(dailyMetrics.day, day))
		.orderBy(asc(dailyMetrics.metric), asc(dailyMetrics.segment));

const EXPECTED_DAY: DailyMetricRow[] = [
	{ metric: "live_sessions", segment: "all", value: 3 },
	{ metric: "live_streamers", segment: "all", value: 2 },
	{ metric: "sessions_started", segment: "all", value: 4 },
	{ metric: "signups", segment: "all", value: 2 },
	{ metric: "signups", segment: "google", value: 1 },
	{ metric: "signups", segment: "twitch", value: 1 },
	{ metric: "streaming_hours", segment: "all", value: 6 },
	{ metric: "wau_trailing_7d", segment: "all", value: 3 },
];

integration("daily metrics rollup", () => {
	beforeAll(async () => {
		// Metrics are global aggregates, so start from empty tables.
		await db.delete(user);
		await db.delete(dailyMetrics);
		await seed();
	});

	afterAll(async () => {
		await db.delete(dailyMetrics);
		await db.delete(user);
	});

	test("rolls up a seeded day", async () => {
		const written = await rollupDailyMetrics({ day: DAY });
		expect(written).toEqual(EXPECTED_DAY);
		expect(await stored(DAY)).toEqual(EXPECTED_DAY);
	});

	test("re-runs overwrite in place and drop segments that disappeared", async () => {
		const [before] = await db
			.select({ computedAt: dailyMetrics.computedAt })
			.from(dailyMetrics)
			.where(eq(dailyMetrics.day, DAY))
			.limit(1);
		await rollupDailyMetrics({ day: new Date(`${DAY}T17:45:00Z`) });
		expect(await stored(DAY)).toEqual(EXPECTED_DAY);
		const [after] = await db
			.select({ computedAt: dailyMetrics.computedAt })
			.from(dailyMetrics)
			.where(eq(dailyMetrics.day, DAY))
			.limit(1);
		expect(after?.computedAt.getTime()).toBeGreaterThanOrEqual(
			before?.computedAt.getTime() ?? 0,
		);

		// Banning bob removes his signup, his only google signup, and his week.
		await db.update(user).set({ banned: true }).where(eq(user.id, "dm-bob"));
		try {
			const rows = await rollupDailyMetrics({ day: DAY });
			expect(rows.find((row) => row.segment === "google")).toBeUndefined();
			expect(await stored(DAY)).toEqual(
				EXPECTED_DAY.filter((row) => row.segment !== "google").map((row) => {
					if (row.metric === "signups" && row.segment === "all") {
						return { ...row, value: 1 };
					}
					if (row.metric === "sessions_started") return { ...row, value: 3 };
					if (row.metric === "wau_trailing_7d") return { ...row, value: 2 };
					return row;
				}),
			);
		} finally {
			await db.update(user).set({ banned: false }).where(eq(user.id, "dm-bob"));
		}
		await rollupDailyMetrics({ day: DAY });
		expect(await stored(DAY)).toEqual(EXPECTED_DAY);
	});

	test("days before the data start only get signups", async () => {
		expect(await rollupDailyMetrics({ day: "2026-09-01" })).toEqual([
			{ metric: "signups", segment: "all", value: 1 },
			{ metric: "signups", segment: "unknown", value: 1 },
		]);
		// The trailing week is clamped to the data start (09-07).
		const [wau] = (await rollupDailyMetrics({ day: "2026-09-08" })).filter(
			(row) => row.metric === "wau_trailing_7d",
		);
		expect(wau?.value).toBe(1);
	});

	test("the first run backfills from the first signup; later runs re-roll and fill gaps", async () => {
		await db.delete(dailyMetrics);
		expect(await isDailyMetricsDue(at("2026-09-20T05:00:00Z"))).toBe(true);

		const first = await runDailyMetricsJob(at("2026-09-20T03:00:00Z"));
		// Carol (09-01) is the first eligible signup; the banned 08-20 one isn't.
		expect(first).toEqual({
			from: "2026-09-01",
			to: "2026-09-19",
			days: 19,
			backfill: true,
		});
		const { rows } = await db.execute<{
			days: number;
			first: string;
			last: string;
			first_live: string;
		}>(sql`select count(distinct day)::int as days, min(day)::text as first,
			max(day)::text as last,
			min(day) filter (where metric = 'live_streamers')::text as first_live
			from daily_metrics`);
		expect(rows[0]).toEqual({
			days: 19,
			first: "2026-09-01",
			last: "2026-09-19",
			first_live: "2026-09-07",
		});
		expect(await stored(DAY)).toEqual(EXPECTED_DAY);
		expect(await isDailyMetricsDue(at("2026-09-20T05:00:00Z"))).toBe(false);
		// 09-20 is not rolled up yet: due after the hour, or at once on startup.
		expect(await isDailyMetricsDue(at("2026-09-21T05:00:00Z"))).toBe(true);
		expect(await isDailyMetricsDue(at("2026-09-21T01:00:00Z"))).toBe(false);
		expect(
			await isDailyMetricsDue(at("2026-09-21T01:00:00Z"), { startup: true }),
		).toBe(true);

		expect(await runDailyMetricsJob(at("2026-09-21T03:00:00Z"))).toEqual({
			from: "2026-09-18",
			to: "2026-09-20",
			days: 3,
			backfill: false,
		});
		// Down for four nights: the gap since the last stored day is filled.
		expect(await runDailyMetricsJob(at("2026-09-25T03:00:00Z"))).toEqual({
			from: "2026-09-21",
			to: "2026-09-24",
			days: 4,
			backfill: false,
		});
	});

	test("a second instance skips while one holds the lock", async () => {
		const held = await tryAdvisoryLock("daily-metrics");
		if (!held) throw new Error("daily metrics lock was already held");
		try {
			expect(await runDailyMetricsJob()).toBeNull();
		} finally {
			await held.release();
		}
	});
});
