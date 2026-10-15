import "../../test-env";

import { db } from "@VISP/db";
import {
	account,
	appUser,
	relay,
	relayPath,
	relayStreamSession,
	user,
} from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import type { Context } from "../../context";
import { ensureDefaultRelay } from "../../relays";
import { adminGrowthRouter, type FunnelSegmentResult } from "./growth";
import { floorToBucket } from "./metrics-sql";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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
	return adminGrowthRouter.createCaller({
		auth: null,
		headers: new Headers(),
		session,
	});
}

type SeedUser = {
	id: string;
	createdAt: Date | string;
	role?: string;
	banned?: boolean;
	provider?: string;
	/** Onboarding answers: [streaming_software, setup_use_case, stream_destination]. */
	answers?: [
		"obs" | "visp" | "larix" | "moblin" | "other",
		"direct" | "phone_to_obs" | "remote_guest" | "multi_cam" | "other",
		"twitch" | "kick" | "youtube" | "other",
	];
	/** `app_user.first_live_at` (F). */
	firstLiveAt?: Date | string;
	/** Session starts per device; each session lasts one hour. */
	devices?: (Date | string)[][];
};

/*
 * ISO weeks: W1 = Sep 7, W2 = Sep 14, W3 = Sep 21, W4 = Sep 28.
 * Expected per user (funnel over [Sep 7, Oct 5)):
 *   ann  device, live 2h after signup, returns at F+8d       → w2 return
 *   ben  device, live 48h after signup, next live at F+6d    → no return
 *   cat  device, first live 10 days after signup             → first_live_any only
 *   dan  device, never live
 *   eve  no device
 *   fay  device, live 1h after signup, next live at F+7d     → return (inclusive)
 *   gus  device, live 3h after signup, next live at F+14d    → no return (exclusive)
 */
const USERS: SeedUser[] = [
	{
		id: "ann",
		createdAt: "2026-09-07T10:00:00Z",
		provider: "twitch",
		answers: ["obs", "phone_to_obs", "twitch"],
		firstLiveAt: "2026-09-07T12:00:00Z",
		devices: [
			["2026-09-07T12:00:00Z", "2026-09-15T12:00:00Z"],
			["2026-09-29T12:00:00Z"],
		],
	},
	{
		id: "ben",
		createdAt: "2026-09-08T00:00:00Z",
		provider: "google",
		answers: ["visp", "direct", "youtube"],
		firstLiveAt: "2026-09-10T00:00:00Z",
		devices: [["2026-09-10T00:00:00Z", "2026-09-16T00:00:00Z"]],
	},
	{
		id: "cat",
		createdAt: "2026-09-09T00:00:00Z",
		firstLiveAt: "2026-09-19T00:00:00Z",
		devices: [["2026-09-19T00:00:00Z", "2026-09-27T00:00:00Z"]],
	},
	{
		id: "dan",
		createdAt: "2026-09-10T00:00:00Z",
		provider: "twitch",
		answers: ["obs", "direct", "twitch"],
		devices: [[]],
	},
	{ id: "eve", createdAt: "2026-09-11T00:00:00Z", provider: "google" },
	{
		id: "fay",
		createdAt: "2026-09-15T00:00:00Z",
		provider: "twitch",
		answers: ["moblin", "multi_cam", "kick"],
		firstLiveAt: "2026-09-15T01:00:00Z",
		devices: [["2026-09-15T01:00:00Z"], ["2026-09-22T01:00:00Z"]],
	},
	{
		id: "gus",
		createdAt: "2026-09-16T00:00:00Z",
		provider: "credential",
		answers: ["other", "remote_guest", "other"],
		firstLiveAt: "2026-09-16T03:00:00Z",
		devices: [["2026-09-16T03:00:00Z", "2026-09-30T03:00:00Z"]],
	},
	// Signed up before the September cohorts; streams from 09-08, so it is a
	// first-stream cohort member once the range reaches its signup.
	{
		id: "old",
		createdAt: "2026-08-20T10:00:00Z",
		provider: "credential",
		firstLiveAt: "2026-09-08T10:00:00Z",
		devices: [["2026-09-08T10:00:00Z", "2026-09-16T10:00:00Z"]],
	},
	// Ineligible: invisible to every route.
	{
		id: "staff",
		createdAt: "2026-09-08T09:00:00Z",
		role: "user,admin",
		firstLiveAt: "2026-09-08T10:00:00Z",
		devices: [["2026-09-08T10:00:00Z", "2026-09-16T10:00:00Z"]],
	},
	{
		id: "break-glass-admin",
		createdAt: "2026-09-09T09:00:00Z",
		firstLiveAt: "2026-09-09T10:00:00Z",
		devices: [["2026-09-09T10:00:00Z"]],
	},
	{
		id: "spammer",
		createdAt: "2026-09-09T09:00:00Z",
		banned: true,
		firstLiveAt: "2026-09-09T10:00:00Z",
		devices: [["2026-09-09T10:00:00Z"]],
	},
];

const date = (value: Date | string) => new Date(value);

async function seed(users: SeedUser[]) {
	await ensureDefaultRelay();
	const defaultRelay = await db.query.relay.findFirst({
		where: eq(relay.name, "default"),
	});
	if (!defaultRelay) throw new Error("default test relay was not created");
	for (const seedUser of users) {
		await db.insert(user).values({
			id: seedUser.id,
			name: seedUser.id,
			email: `${seedUser.id}@example.test`,
			role: seedUser.role ?? "user",
			banned: seedUser.banned ?? false,
			createdAt: date(seedUser.createdAt),
		});
		const [software, useCase, destination] = seedUser.answers ?? [];
		await db.insert(appUser).values({
			id: seedUser.id,
			handle: seedUser.id,
			firstLiveAt: seedUser.firstLiveAt ? date(seedUser.firstLiveAt) : null,
			streamingSoftware: software ?? null,
			setupUseCase: useCase ?? null,
			streamDestination: destination ?? null,
		});
		if (seedUser.provider) {
			await db.insert(account).values({
				id: `${seedUser.id}-account`,
				accountId: `${seedUser.id}-${seedUser.provider}`,
				providerId: seedUser.provider,
				userId: seedUser.id,
				createdAt: date(seedUser.createdAt),
				updatedAt: date(seedUser.createdAt),
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
			for (const firstLiveAt of sessions) {
				const live = date(firstLiveAt);
				await db.insert(relayStreamSession).values({
					pathId: path.id,
					startedAt: live,
					firstLiveAt: live,
					endedAt: new Date(live.getTime() + HOUR_MS),
				});
			}
		}
	}
}

/** `segment → [count, cohortCount, observedCount]` per chained stage. */
function grid(segments: FunnelSegmentResult[]) {
	return Object.fromEntries(
		segments.map((segment) => [
			segment.segment,
			Object.fromEntries([
				...segment.stages.map((stage) => [
					stage.stage,
					[stage.count, stage.cohortCount, stage.observedCount],
				]),
				[
					"first_live_any",
					[
						segment.firstLiveAny.count,
						segment.firstLiveAny.cohortCount,
						segment.firstLiveAny.observedCount,
					],
				],
			]),
		]),
	);
}

/** Signup count per segment, in returned order. */
const signupsBySegment = (segments: FunnelSegmentResult[]) =>
	segments.map((segment) => [segment.segment, segment.stages[0]?.count]);

const RANGE = { from: "2026-09-07T00:00:00Z", to: "2026-10-05T00:00:00Z" };

integration("admin.growth", () => {
	const admin = callerFor("staff");

	beforeAll(async () => {
		// Cohorts are global aggregates, so start from an empty user table.
		await db.delete(user);
		await seed(USERS);
	});

	afterAll(async () => {
		await db.delete(user);
	});

	test("rejects non-admins on every route", async () => {
		const ann = callerFor("ann");
		await expect(ann.funnel(RANGE)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(ann.timeToFirstLive(RANGE)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(ann.retention({})).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(
			callerFor("break-glass-admin").funnel(RANGE),
		).resolves.toMatchObject({ segment: "none" });
	});

	test("funnel chains signup → device → first live (7d) → week-2 return", async () => {
		const result = await admin.funnel(RANGE);
		expect(result).toMatchObject({
			from: "2026-09-07T00:00:00.000Z",
			to: "2026-10-05T00:00:00.000Z",
			segment: "none",
			dataStart: "2026-07-27T00:00:00.000Z",
			liveFrom: "2026-09-07T00:00:00.000Z",
		});
		expect(grid(result.segments)).toEqual({
			all: {
				signup: [7, 7, 7],
				device_created: [6, 7, 7],
				first_live: [4, 7, 7],
				week2_return: [2, 4, 4],
				first_live_any: [5, 7, 7],
			},
		});
	});

	test("stream stages count every signup from the data start", async () => {
		// old signed up 08-20 and first streamed 09-08: in the base, past the
		// 7-day window, streamed at some point.
		const result = await admin.funnel({
			from: "2026-08-01T00:00:00Z",
			to: RANGE.to,
		});
		expect(result.liveFrom).toBe("2026-08-01T00:00:00.000Z");
		expect(grid(result.segments).all).toEqual({
			signup: [8, 8, 8],
			device_created: [7, 8, 8],
			first_live: [4, 8, 8],
			week2_return: [2, 4, 4],
			first_live_any: [6, 8, 8],
		});

		const augustOnly = await admin.funnel({
			from: "2026-08-01T00:00:00Z",
			to: "2026-09-01T00:00:00Z",
		});
		expect(augustOnly.liveFrom).toBe("2026-08-01T00:00:00.000Z");
		expect(grid(augustOnly.segments).all).toEqual({
			signup: [1, 1, 1],
			device_created: [1, 1, 1],
			first_live: [0, 1, 1],
			week2_return: [0, 0, 0],
			first_live_any: [1, 1, 1],
		});

		const beforeData = await admin.funnel({
			from: "2026-07-01T00:00:00Z",
			to: "2026-07-27T00:00:00Z",
		});
		expect(beforeData.liveFrom).toBeNull();
	});

	test("an empty range still returns the unsegmented funnel", async () => {
		const result = await admin.funnel({
			from: "2026-07-01T00:00:00Z",
			to: "2026-07-02T00:00:00Z",
		});
		expect(grid(result.segments).all?.signup).toEqual([0, 0, 0]);
		const segmented = await admin.funnel({
			from: "2026-07-01T00:00:00Z",
			to: "2026-07-02T00:00:00Z",
			segment: "provider",
		});
		expect(segmented.segments).toEqual([]);
	});

	test("funnel segments by setup use case", async () => {
		const result = await admin.funnel({ ...RANGE, segment: "use_case" });
		expect(grid(result.segments)).toEqual({
			phone_to_obs: {
				signup: [1, 1, 1],
				device_created: [1, 1, 1],
				first_live: [1, 1, 1],
				week2_return: [1, 1, 1],
				first_live_any: [1, 1, 1],
			},
			direct: {
				signup: [2, 2, 2],
				device_created: [2, 2, 2],
				first_live: [1, 2, 2],
				week2_return: [0, 1, 1],
				first_live_any: [1, 2, 2],
			},
			not_selected: {
				signup: [2, 2, 2],
				device_created: [1, 2, 2],
				first_live: [0, 2, 2],
				week2_return: [0, 0, 0],
				first_live_any: [1, 2, 2],
			},
			multi_cam: {
				signup: [1, 1, 1],
				device_created: [1, 1, 1],
				first_live: [1, 1, 1],
				week2_return: [1, 1, 1],
				first_live_any: [1, 1, 1],
			},
			remote_guest: {
				signup: [1, 1, 1],
				device_created: [1, 1, 1],
				first_live: [1, 1, 1],
				week2_return: [0, 1, 1],
				first_live_any: [1, 1, 1],
			},
		});
		// Largest segment first, ties by name.
		expect(signupsBySegment(result.segments)).toEqual([
			["direct", 2],
			["not_selected", 2],
			["multi_cam", 1],
			["phone_to_obs", 1],
			["remote_guest", 1],
		]);
	});

	test("funnel segments by provider, publisher and destination", async () => {
		const provider = await admin.funnel({ ...RANGE, segment: "provider" });
		expect(signupsBySegment(provider.segments)).toEqual([
			["twitch", 3],
			["google", 2],
			["credential", 1],
			["unknown", 1],
		]);
		expect(grid(provider.segments).twitch).toEqual({
			signup: [3, 3, 3],
			device_created: [3, 3, 3],
			first_live: [2, 3, 3],
			week2_return: [2, 2, 2],
			first_live_any: [2, 3, 3],
		});
		expect(grid(provider.segments).unknown?.first_live_any).toEqual([1, 1, 1]);

		const publisher = await admin.funnel({ ...RANGE, segment: "publisher" });
		expect(signupsBySegment(publisher.segments)).toEqual([
			["not_selected", 2],
			["obs", 2],
			["moblin", 1],
			["other", 1],
			["visp", 1],
		]);
		expect(grid(publisher.segments).obs?.week2_return).toEqual([1, 1, 1]);
		expect(grid(publisher.segments).visp?.week2_return).toEqual([0, 1, 1]);

		const destination = await admin.funnel({
			...RANGE,
			segment: "destination",
		});
		expect(signupsBySegment(destination.segments)).toEqual([
			["not_selected", 2],
			["twitch", 2],
			["kick", 1],
			["other", 1],
			["youtube", 1],
		]);
		expect(grid(destination.segments).twitch?.device_created).toEqual([
			2, 2, 2,
		]);
		expect(grid(destination.segments).kick?.week2_return).toEqual([1, 1, 1]);
	});

	test("funnel judges only users whose window has closed", async () => {
		const now = Date.now();
		const ago = (days: number) => new Date(now - days * DAY_MS);
		// hal: 3 days old and already live, but the 7-day window is still open.
		// ivy: live a day after signup; her week-2 window ends in 5 days, so
		// the return at F+8d is not counted yet.
		await seed([
			{
				id: "hal",
				createdAt: ago(3),
				firstLiveAt: ago(2),
				devices: [[ago(2)]],
			},
			{
				id: "ivy",
				createdAt: ago(10),
				firstLiveAt: ago(9),
				devices: [[ago(9), ago(1)]],
			},
		]);
		try {
			const result = await admin.funnel({
				from: ago(11).toISOString(),
				to: new Date(now + DAY_MS).toISOString(),
			});
			expect(grid(result.segments)).toEqual({
				all: {
					signup: [2, 2, 2],
					device_created: [2, 2, 2],
					first_live: [1, 2, 1],
					week2_return: [0, 1, 0],
					first_live_any: [2, 2, 2],
				},
			});
		} finally {
			await db.delete(user).where(inArray(user.id, ["hal", "ivy"]));
		}
	});

	test("time to first live per signup week (median and p75 hours)", async () => {
		const result = await admin.timeToFirstLive({
			from: "2026-08-17T00:00:00Z",
			to: "2026-09-28T00:00:00Z",
		});
		expect(result).toEqual({
			dataStart: "2026-07-27T00:00:00.000Z",
			cohorts: [
				// old: signed up 08-20 10:00, first stream 09-08 10:00 = 19 days.
				{
					cohort: "2026-08-17T00:00:00.000Z",
					signups: 1,
					count: 1,
					medianHours: 456,
					p75Hours: 456,
				},
				{
					cohort: "2026-08-24T00:00:00.000Z",
					signups: 0,
					count: 0,
					medianHours: null,
					p75Hours: null,
				},
				{
					cohort: "2026-08-31T00:00:00.000Z",
					signups: 0,
					count: 0,
					medianHours: null,
					p75Hours: null,
				},
				// ann 2h, ben 48h, cat 240h; dan and eve never streamed.
				{
					cohort: "2026-09-07T00:00:00.000Z",
					signups: 5,
					count: 3,
					medianHours: 48,
					p75Hours: 144,
				},
				// fay 1h, gus 3h.
				{
					cohort: "2026-09-14T00:00:00.000Z",
					signups: 2,
					count: 2,
					medianHours: 2,
					p75Hours: 2.5,
				},
				{
					cohort: "2026-09-21T00:00:00.000Z",
					signups: 0,
					count: 0,
					medianHours: null,
					p75Hours: null,
				},
			],
		});
		const beforeData = await admin.timeToFirstLive({
			from: "2026-07-01T00:00:00Z",
			to: "2026-07-27T00:00:00Z",
		});
		expect(beforeData.cohorts).toEqual([]);
	});

	test("retention grid by first-live week, only ended weeks", async () => {
		const result = await admin.retention({
			weeks: 4,
			to: "2026-10-05T00:00:00Z",
		});
		expect(result).toMatchObject({
			weeks: 4,
			asOf: "2026-10-05T00:00:00.000Z",
			dataStart: "2026-07-27T00:00:00.000Z",
		});
		const rows = result.cohorts.map((cohort) => [
			cohort.cohort,
			cohort.size,
			cohort.cells.map((cell) => cell.value),
		]);
		expect(rows).toEqual([
			// ann (F W1; streams W2, W4), ben (F W1; W2) and old (F W1; W2).
			["2026-09-07T00:00:00.000Z", 3, [1, 1, 0, 1 / 3]],
			// cat (W3), fay (W3), gus (W4).
			["2026-09-14T00:00:00.000Z", 3, [1, 2 / 3, 1 / 3, null]],
			["2026-09-21T00:00:00.000Z", 0, [null, null, null, null]],
			["2026-09-28T00:00:00.000Z", 0, [null, null, null, null]],
		]);
		expect(result.cohorts[2]?.cells.map((cell) => cell.count)).toEqual([
			0,
			0,
			null,
			null,
		]);
		expect(result.cohorts[3]?.cells.map((cell) => cell.count)).toEqual([
			0,
			null,
			null,
			null,
		]);
		expect(result.cohorts[1]?.cells.map((cell) => cell.offset)).toEqual([
			0, 1, 2, 3,
		]);
	});

	test("retention clamps to the data start and defaults to now", async () => {
		const clamped = await admin.retention({ to: "2026-10-05T00:00:00Z" });
		expect(clamped.weeks).toBe(12);
		// 12 weeks back from 09-28 would be 07-13; the data start cuts it to 07-27.
		expect(clamped.cohorts.map((cohort) => cohort.cohort)).toEqual([
			"2026-07-27T00:00:00.000Z",
			"2026-08-03T00:00:00.000Z",
			"2026-08-10T00:00:00.000Z",
			"2026-08-17T00:00:00.000Z",
			"2026-08-24T00:00:00.000Z",
			"2026-08-31T00:00:00.000Z",
			"2026-09-07T00:00:00.000Z",
			"2026-09-14T00:00:00.000Z",
			"2026-09-21T00:00:00.000Z",
			"2026-09-28T00:00:00.000Z",
		]);
		expect(clamped.cohorts[0]?.cells).toHaveLength(12);
		expect(clamped.cohorts[0]?.size).toBe(0);
		expect(clamped.cohorts[6]?.cells[3]?.value).toBe(1 / 3);
		expect(clamped.cohorts[6]?.cells[4]?.value).toBeNull();

		// A future `to` is capped at now; the current week has not ended.
		const current = await admin.retention({
			weeks: 2,
			to: "2100-01-01T00:00:00Z",
		});
		const thisWeek = floorToBucket(new Date(), "week").toISOString();
		expect(current.cohorts.at(-1)?.cohort).toBe(thisWeek);
		expect(current.cohorts.at(-1)?.cells.map((cell) => cell.value)).toEqual([
			null,
			null,
		]);

		const before = await admin.retention({ to: "2026-07-27T00:00:00Z" });
		expect(before.cohorts).toEqual([]);
	});

	test("validates inputs", async () => {
		await expect(
			admin.funnel({ from: RANGE.to, to: RANGE.from }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			admin.timeToFirstLive({
				from: "2025-01-01T00:00:00Z",
				to: "2026-09-10T00:00:00Z",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(admin.retention({ weeks: 0 })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		await expect(admin.retention({ weeks: 27 })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});
});
