import "../../test-env";

import { db } from "@VISP/db";
import {
	appUser,
	relay,
	relayPath,
	relayStreamSession,
	user,
} from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Context } from "../../context";
import { ensureDefaultRelay } from "../../relays";
import { adminMetricsRouter } from "./metrics";
import { deltaPct, type Kpi, type KpiKey } from "./metrics-kpis";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const at = (value: string) => new Date(value);

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
	return adminMetricsRouter.createCaller({
		auth: null,
		headers: new Headers(),
		session,
	});
}

type SeedUser = {
	id: string;
	createdAt: string;
	role?: string;
	banned?: boolean;
	/** `app_user.first_live_at`; `false` means no `app_user` row at all. */
	firstLiveAt?: string | false;
	/** Sessions per device: [first_live_at | null, ended_at, started_at?]. */
	devices?: [string | null, string, string?][][];
};

/*
 * Windows used below: current [09-21, 10-05), previous [09-07, 09-21).
 *
 *            signup   first live          live sessions (hours)
 * alice      09-08    09-08 (≤ 7 d)      09-08 2, 09-10 1.5 (2nd device), 09-22 1
 * dave       09-10    no app_user row     -
 * bob        09-15    09-16 (≤ 7 d)      09-16 2 (+ one never live), 09-23 1, 09-24 0.5
 * carol      09-16    09-25 (9 d late)   09-25 2
 * frank      09-22    09-23 (≤ 7 d)      09-23 4
 * erin       09-30    09-30 (≤ 7 d)      09-30 1 — signup in the last 7 days
 * legacy     08-20    09-05               09-05 1 — before METRICS_DATA_START
 * staff, break-glass-admin, spammer: admin / ADMIN_USER_IDS / banned, invisible.
 */
const USERS: SeedUser[] = [
	{
		id: "alice",
		createdAt: "2026-09-08T09:00:00Z",
		firstLiveAt: "2026-09-08T10:00:00Z",
		devices: [
			[
				["2026-09-08T10:00:00Z", "2026-09-08T12:00:00Z"],
				["2026-09-22T10:00:00Z", "2026-09-22T11:00:00Z"],
			],
			[["2026-09-10T20:00:00Z", "2026-09-10T21:30:00Z"]],
		],
	},
	{ id: "dave", createdAt: "2026-09-10T00:00:00Z", firstLiveAt: false },
	{
		id: "bob",
		createdAt: "2026-09-15T08:00:00Z",
		firstLiveAt: "2026-09-16T08:00:00Z",
		devices: [
			[
				["2026-09-16T08:00:00Z", "2026-09-16T10:00:00Z"],
				[null, "2026-09-16T13:00:00Z", "2026-09-16T12:00:00Z"],
				["2026-09-23T12:00:00Z", "2026-09-23T13:00:00Z"],
				["2026-09-24T12:00:00Z", "2026-09-24T12:30:00Z"],
			],
		],
	},
	{
		id: "carol",
		createdAt: "2026-09-16T12:00:00Z",
		firstLiveAt: "2026-09-25T18:00:00Z",
		devices: [[["2026-09-25T18:00:00Z", "2026-09-25T20:00:00Z"]]],
	},
	{
		id: "frank",
		createdAt: "2026-09-22T10:00:00Z",
		firstLiveAt: "2026-09-23T10:00:00Z",
		devices: [[["2026-09-23T10:00:00Z", "2026-09-23T14:00:00Z"]]],
	},
	{
		id: "erin",
		createdAt: "2026-09-30T10:00:00Z",
		firstLiveAt: "2026-09-30T12:00:00Z",
		devices: [[["2026-09-30T12:00:00Z", "2026-09-30T13:00:00Z"]]],
	},
	{
		id: "legacy",
		createdAt: "2026-08-20T10:00:00Z",
		firstLiveAt: "2026-09-05T10:00:00Z",
		devices: [[["2026-09-05T10:00:00Z", "2026-09-05T11:00:00Z"]]],
	},
	// Everyone below must be invisible to every KPI.
	{
		id: "staff",
		createdAt: "2026-09-08T09:00:00Z",
		role: "user,admin",
		firstLiveAt: "2026-09-08T10:00:00Z",
		devices: [[["2026-09-08T10:00:00Z", "2026-09-08T15:00:00Z"]]],
	},
	{
		id: "break-glass-admin",
		createdAt: "2026-09-22T09:00:00Z",
		firstLiveAt: "2026-09-22T10:00:00Z",
		devices: [[["2026-09-22T10:00:00Z", "2026-09-22T15:00:00Z"]]],
	},
	{
		id: "spammer",
		createdAt: "2026-09-09T09:00:00Z",
		banned: true,
		firstLiveAt: "2026-09-09T10:00:00Z",
		devices: [
			[
				["2026-09-09T10:00:00Z", "2026-09-09T15:00:00Z"],
				["2026-09-23T10:00:00Z", "2026-09-23T15:00:00Z"],
			],
		],
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
		if (seedUser.firstLiveAt !== false) {
			await db.insert(appUser).values({
				id: seedUser.id,
				handle: seedUser.id,
				firstLiveAt: seedUser.firstLiveAt ? at(seedUser.firstLiveAt) : null,
			});
		}
		for (const [index, sessions] of (seedUser.devices ?? []).entries()) {
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
			for (const [firstLiveAt, endedAt, startedAt] of sessions) {
				const start = startedAt ?? firstLiveAt;
				if (!start) throw new Error("session needs a start");
				await db.insert(relayStreamSession).values({
					pathId: path.id,
					startedAt: new Date(at(start).getTime() - 60_000),
					firstLiveAt: firstLiveAt ? at(firstLiveAt) : null,
					endedAt: at(endedAt),
				});
			}
		}
	}
}

const byKey = (kpis: Kpi[]) =>
	Object.fromEntries(kpis.map((kpi) => [kpi.key, kpi])) as Record<KpiKey, Kpi>;

/** `[value, previous, deltaPct]` per KPI, deltas rounded to 2 decimals. */
const summary = (kpis: Kpi[]) =>
	Object.fromEntries(
		kpis.map((kpi) => [
			kpi.key,
			[
				kpi.value,
				kpi.previous,
				kpi.deltaPct == null ? null : Math.round(kpi.deltaPct * 100) / 100,
			],
		]),
	);

const CURRENT = { from: "2026-09-21T00:00:00Z", to: "2026-10-05T00:00:00Z" };
const PREVIOUS = {
	compareFrom: "2026-09-07T00:00:00Z",
	compareTo: "2026-09-21T00:00:00Z",
};

integration("admin.metrics.kpis", () => {
	const admin = callerFor("staff");

	beforeAll(async () => {
		// KPIs are global aggregates, so start from an empty user table.
		await db.delete(user);
		await seed();
	});

	afterAll(async () => {
		await db.delete(user);
	});

	test("rejects non-admins", async () => {
		await expect(callerFor("alice").kpis(CURRENT)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
	});

	test("values, previous values and deltas for every headline KPI", async () => {
		const result = await admin.kpis({ ...CURRENT, ...PREVIOUS });
		expect(result.dataStart).toBe("2026-09-07T00:00:00.000Z");
		expect(result.kpis.map((kpi) => [kpi.key, kpi.label, kpi.unit])).toEqual([
			["weekly_active_streamers", "Active streamers", "count"],
			["streaming_hours", "Streaming hours", "hours"],
			["signups", "Signups", "count"],
			["signup_to_first_live_rate", "Signup → first live (7 days)", "percent"],
			["sessions_per_streamer", "Sessions per streamer", "ratio"],
		]);
		expect(summary(result.kpis)).toEqual({
			// alice, bob, carol, frank, erin vs alice, bob.
			weekly_active_streamers: [5, 2, 150],
			// 1 + 1 + 0.5 + 2 + 4 + 1 vs 2 + 1.5 + 2.
			streaming_hours: [9.5, 5.5, 72.73],
			// frank, erin vs alice, dave, bob, carol.
			signups: [2, 4, -50],
			// Cohorts [09-21, 09-28): frank; [09-07, 09-14): alice, dave.
			signup_to_first_live_rate: [100, 50, 100],
			// 6 sessions / 5 vs 3 sessions / 2.
			sessions_per_streamer: [1.2, 1.5, -20],
		});
	});

	test("the first-live rate only counts fully observed signup cohorts", async () => {
		// Cohort [09-07, 09-21): alice ✓, dave (no app_user) ✗, bob ✓, carol
		// (9 days) ✗. frank and erin signed up in the last 7 days; staff and
		// break-glass-admin would have raised it.
		const result = byKey(
			(
				await admin.kpis({
					from: "2026-09-07T00:00:00Z",
					to: "2026-09-28T00:00:00Z",
				})
			).kpis,
		);
		expect(result.signup_to_first_live_rate.value).toBe(50);
		expect(result.signups.value).toBe(5);

		// A range ending now has no signup that is 7 days old yet.
		const now = new Date();
		const recent = byKey(
			(
				await admin.kpis({
					from: new Date(now.getTime() - 7 * 86_400_000).toISOString(),
					to: now.toISOString(),
				})
			).kpis,
		);
		expect(recent.signup_to_first_live_rate).toMatchObject({
			value: null,
			sparkline: [],
		});
	});

	test("without a comparison every previous and delta is null", async () => {
		const result = await admin.kpis(CURRENT);
		for (const kpi of result.kpis) {
			expect(kpi.previous).toBeNull();
			expect(kpi.deltaPct).toBeNull();
		}
	});

	test("a comparison starting before the data start has no live deltas", async () => {
		const result = await admin.kpis({
			from: "2026-09-14T00:00:00Z",
			to: "2026-09-28T00:00:00Z",
			compareFrom: "2026-08-31T00:00:00Z",
			compareTo: "2026-09-14T00:00:00Z",
		});
		expect(summary(result.kpis)).toEqual({
			// Previous is the clamped [09-07, 09-14): alice only.
			weekly_active_streamers: [4, 1, null],
			streaming_hours: [10.5, 3.5, null],
			// Signups have full history, so they keep their delta.
			signups: [3, 2, 50],
			// Current cohort [09-14, 09-21): bob ✓, carol ✗; previous is empty.
			signup_to_first_live_rate: [50, null, null],
			sessions_per_streamer: [1.5, 2, null],
		});

		const legacy = await admin.kpis({
			from: "2026-09-07T00:00:00Z",
			to: "2026-09-21T00:00:00Z",
			compareFrom: "2026-08-17T00:00:00Z",
			compareTo: "2026-08-31T00:00:00Z",
		});
		expect(summary(legacy.kpis)).toMatchObject({
			// Wholly before the data start: no data, not zero.
			weekly_active_streamers: [2, null, null],
			signups: [4, 1, 300],
		});
	});

	test("a previous value of 0 has no delta", async () => {
		const result = await admin.kpis({
			from: "2026-09-08T00:00:00Z",
			to: "2026-09-09T00:00:00Z",
			compareFrom: "2026-09-07T00:00:00Z",
			compareTo: "2026-09-08T00:00:00Z",
		});
		expect(summary(result.kpis)).toMatchObject({
			weekly_active_streamers: [1, 0, null],
			streaming_hours: [2, 0, null],
			signups: [1, 0, null],
			sessions_per_streamer: [1, 0, null],
		});
	});

	test("live KPIs have no value for a range before the data start", async () => {
		const result = byKey(
			(
				await admin.kpis({
					from: "2026-08-01T00:00:00Z",
					to: "2026-09-01T00:00:00Z",
				})
			).kpis,
		);
		expect(result.weekly_active_streamers).toMatchObject({
			value: null,
			sparkline: [],
		});
		expect(result.streaming_hours.value).toBeNull();
		expect(result.sessions_per_streamer.value).toBeNull();
		expect(result.signup_to_first_live_rate.value).toBeNull();
		expect(result.signups.value).toBe(1);
	});

	test("sparklines are the daily series values up to 31 days", async () => {
		const result = byKey((await admin.kpis({ ...CURRENT, ...PREVIOUS })).kpis);
		for (const metric of [
			"weekly_active_streamers",
			"streaming_hours",
			"signups",
			"sessions_per_streamer",
		] as const) {
			const series = await admin.series({
				metric,
				interval: "day",
				...CURRENT,
			});
			expect(result[metric].sparkline).toEqual(
				series.buckets.map((bucket) => bucket.value),
			);
		}
		expect(result.signups.sparkline).toEqual([
			0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
		]);
		// Daily cohorts 09-21..09-27 only; later days are still maturing.
		expect(result.signup_to_first_live_rate.sparkline).toEqual([
			0, 100, 0, 0, 0, 0, 0,
		]);
	});

	test("sparklines are weekly for longer ranges, clamped for live KPIs", async () => {
		const range = { from: "2026-08-31T00:00:00Z", to: "2026-10-05T00:00:00Z" };
		const result = byKey((await admin.kpis(range)).kpis);
		for (const metric of [
			"weekly_active_streamers",
			"streaming_hours",
			"signups",
			"sessions_per_streamer",
		] as const) {
			const series = await admin.series({ metric, interval: "week", ...range });
			expect(result[metric].sparkline).toEqual(
				series.buckets.map((bucket) => bucket.value),
			);
		}
		expect(result.weekly_active_streamers.sparkline).toEqual([1, 1, 4, 1]);
		expect(result.signups.sparkline).toEqual([0, 2, 2, 1, 1]);
		// Weekly cohorts 09-07 (alice ✓ dave ✗), 09-14 (bob ✓ carol ✗), 09-21
		// (frank ✓; erin is in the maturing last 7 days).
		expect(result.signup_to_first_live_rate.sparkline).toEqual([50, 50, 100]);
	});

	test("validates the windows", async () => {
		await expect(
			admin.kpis({ from: CURRENT.to, to: CURRENT.from }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			admin.kpis({ ...CURRENT, compareFrom: PREVIOUS.compareFrom }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			admin.kpis({
				...CURRENT,
				compareFrom: PREVIOUS.compareTo,
				compareTo: PREVIOUS.compareFrom,
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			admin.kpis({ from: "2024-01-01T00:00:00Z", to: CURRENT.to }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

describe("deltaPct", () => {
	test("is the relative change in percent units", () => {
		expect(deltaPct(12, 10, true)).toBeCloseTo(20);
		expect(deltaPct(5, 10, true)).toBe(-50);
	});

	test("is null without a usable baseline", () => {
		expect(deltaPct(5, 0, true)).toBeNull();
		expect(deltaPct(5, null, true)).toBeNull();
		expect(deltaPct(null, 5, true)).toBeNull();
		expect(deltaPct(5, 10, false)).toBeNull();
	});
});
