import "../../test-env";

import { db } from "@VISP/db";
import {
	account,
	appUser,
	pathState,
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
import { floorToBucket } from "./metrics-sql";
import { METRICS_DATA_START } from "./metrics-window";

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
	accounts?: { provider: string; createdAt: string }[];
	/** Sessions per device: [started_at, ended_at | null, started_at override?]. */
	devices?: [string | null, string | null, string?][][];
	/** Path state of the first device, for open sessions. */
	state?: { publishing: boolean; lastEventAt: string };
};

const USERS: SeedUser[] = [
	{
		id: "alice",
		createdAt: "2026-09-08T09:00:00Z",
		accounts: [{ provider: "twitch", createdAt: "2026-09-08T09:00:00Z" }],
		devices: [
			[
				["2026-09-08T10:00:00Z", "2026-09-08T12:00:00Z"],
				["2026-09-22T10:00:00Z", "2026-09-22T11:00:00Z"],
			],
			// A second device: alice still counts once per bucket.
			[["2026-09-10T20:00:00Z", "2026-09-10T21:30:00Z"]],
		],
	},
	{
		id: "bob",
		createdAt: "2026-09-15T08:00:00Z",
		// Later linked twitch must not change the signup provider.
		accounts: [
			{ provider: "twitch", createdAt: "2026-09-20T00:00:00Z" },
			{ provider: "google", createdAt: "2026-09-15T08:00:00Z" },
		],
		devices: [
			[
				// Crosses midnight: wholly in the 09-09 bucket.
				["2026-09-09T23:30:00Z", "2026-09-10T00:30:00Z"],
				["2026-09-16T08:00:00Z", "2026-09-16T10:00:00Z"],
				// A 30 s reconnect blip: no hours, not activity.
				[null, "2026-09-16T12:00:30Z", "2026-09-16T12:00:00Z"],
			],
		],
	},
	{
		id: "carol",
		createdAt: "2026-09-16T12:00:00Z",
		// Open session whose relay went quiet: ends at the last event (30 min).
		devices: [[["2026-09-23T18:00:00Z", null]]],
		state: { publishing: true, lastEventAt: "2026-09-23T18:30:00Z" },
	},
	{
		id: "legacy",
		createdAt: "2026-08-20T10:00:00Z",
		accounts: [{ provider: "credential", createdAt: "2026-08-20T10:00:00Z" }],
		// Sessions are tracked from Jul 27, 2026, so this one counts.
		devices: [[["2026-09-05T10:00:00Z", "2026-09-05T11:00:00Z"]]],
	},
	// Everyone below must be invisible to every metric.
	{
		id: "staff",
		createdAt: "2026-09-08T09:00:00Z",
		role: "user,admin",
		accounts: [{ provider: "google", createdAt: "2026-09-08T09:00:00Z" }],
		devices: [[["2026-09-08T10:00:00Z", "2026-09-08T15:00:00Z"]]],
	},
	{
		id: "break-glass-admin",
		createdAt: "2026-09-14T09:00:00Z",
		devices: [[["2026-09-15T10:00:00Z", "2026-09-15T15:00:00Z"]]],
	},
	{
		id: "spammer",
		createdAt: "2026-09-09T09:00:00Z",
		banned: true,
		accounts: [{ provider: "kick", createdAt: "2026-09-09T09:00:00Z" }],
		devices: [[["2026-09-09T10:00:00Z", "2026-09-09T15:00:00Z"]]],
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
		for (const [index, entry] of (seedUser.accounts ?? []).entries()) {
			await db.insert(account).values({
				id: `${seedUser.id}-account-${index}`,
				accountId: `${seedUser.id}-${entry.provider}`,
				providerId: entry.provider,
				userId: seedUser.id,
				createdAt: at(entry.createdAt),
				updatedAt: at(entry.createdAt),
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
			if (index === 0 && seedUser.state) {
				await db.insert(pathState).values({
					pathId: path.id,
					publishing: seedUser.state.publishing,
					lastEventAt: at(seedUser.state.lastEventAt),
				});
			}
			for (const [firstLiveAt, endedAt, startedAt] of sessions) {
				const start = startedAt ?? firstLiveAt;
				if (!start) throw new Error("session needs a start");
				await db.insert(relayStreamSession).values({
					pathId: path.id,
					startedAt: at(start),
					firstLiveAt: firstLiveAt ? at(firstLiveAt) : null,
					endedAt: endedAt ? at(endedAt) : null,
				});
			}
		}
	}
}

const values = (buckets: { value: number }[]) =>
	buckets.map((bucket) => bucket.value);

integration("admin.metrics.series", () => {
	const admin = callerFor("staff");

	beforeAll(async () => {
		// Metrics are global aggregates, so start from an empty user table.
		await db.delete(user);
		await seed();
	});

	afterAll(async () => {
		await db.delete(user);
	});

	test("rejects non-admins", async () => {
		await expect(
			callerFor("alice").series({
				metric: "signups",
				interval: "week",
				from: "2026-09-07T00:00:00Z",
				to: "2026-10-05T00:00:00Z",
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		// A break-glass id is an admin without the role.
		await expect(
			callerFor("break-glass-admin").series({
				metric: "signups",
				interval: "week",
				from: "2026-09-07T00:00:00Z",
				to: "2026-10-05T00:00:00Z",
			}),
		).resolves.toMatchObject({ metric: "signups" });
	});

	test("weekly active streamers per ISO week, clamped to the data start", async () => {
		const result = await admin.series({
			metric: "weekly_active_streamers",
			interval: "week",
			from: "2026-08-31T00:00:00Z",
			to: "2026-10-05T00:00:00Z",
		});
		expect(result).toMatchObject({
			metric: "weekly_active_streamers",
			interval: "week",
			unit: "count",
			dataStart: "2026-07-27T00:00:00.000Z",
		});
		expect(result.buckets).toEqual([
			{ bucket: "2026-08-31T00:00:00.000Z", value: 1 },
			{ bucket: "2026-09-07T00:00:00.000Z", value: 2 },
			{ bucket: "2026-09-14T00:00:00.000Z", value: 1 },
			{ bucket: "2026-09-21T00:00:00.000Z", value: 2 },
			{ bucket: "2026-09-28T00:00:00.000Z", value: 0 },
		]);
	});

	test("daily active streamers use a trailing 7-day window", async () => {
		const result = await admin.series({
			metric: "weekly_active_streamers",
			interval: "day",
			from: "2026-09-01T00:00:00Z",
			to: "2026-09-18T00:00:00Z",
		});
		expect(result.buckets[0]?.bucket).toBe("2026-09-01T00:00:00.000Z");
		expect(values(result.buckets)).toEqual([
			0, // 09-01
			0,
			0,
			0,
			1, // 09-05 legacy
			1,
			1, // 09-07
			2, // 09-08 + alice
			3, // 09-09 + bob
			3,
			3, // 09-11: last day with legacy (09-05) in the window
			2,
			2,
			2, // through 09-14: alice 09-08/09-10, bob 09-09
			2, // 09-15: window 09-09..09-15 still has both
			2, // 09-16: alice 09-10, bob 09-16
			1, // 09-17: window starts 09-11, only bob
		]);
	});

	test("streaming hours bucket whole sessions by their start", async () => {
		const weekly = await admin.series({
			metric: "streaming_hours",
			interval: "week",
			from: "2026-09-07T00:00:00Z",
			to: "2026-10-05T00:00:00Z",
		});
		expect(weekly.unit).toBe("hours");
		expect(values(weekly.buckets)).toEqual([4.5, 2, 1.5, 0]);

		const daily = await admin.series({
			metric: "streaming_hours",
			interval: "day",
			from: "2026-09-08T00:00:00Z",
			to: "2026-09-11T00:00:00Z",
		});
		expect(daily.buckets).toEqual([
			{ bucket: "2026-09-08T00:00:00.000Z", value: 2 },
			{ bucket: "2026-09-09T00:00:00.000Z", value: 1 },
			{ bucket: "2026-09-10T00:00:00.000Z", value: 1.5 },
		]);
	});

	test("sessions per streamer divide within the bucket and are 0 when empty", async () => {
		const result = await admin.series({
			metric: "sessions_per_streamer",
			interval: "week",
			from: "2026-09-07T00:00:00Z",
			to: "2026-10-05T00:00:00Z",
		});
		expect(result.unit).toBe("ratio");
		expect(values(result.buckets)).toEqual([1.5, 1, 1, 0]);
	});

	test("live metrics return no buckets for a range before the data start", async () => {
		const result = await admin.series({
			metric: "streaming_hours",
			interval: "week",
			from: "2026-07-01T00:00:00Z",
			to: METRICS_DATA_START.toISOString(),
		});
		expect(result.buckets).toEqual([]);
	});

	test("signups keep full history and exclude admins and banned users", async () => {
		const result = await admin.series({
			metric: "signups",
			interval: "week",
			from: "2026-08-17T00:00:00Z",
			to: "2026-09-21T00:00:00Z",
		});
		expect(result.buckets).toEqual([
			{ bucket: "2026-08-17T00:00:00.000Z", value: 1 },
			{ bucket: "2026-08-24T00:00:00.000Z", value: 0 },
			{ bucket: "2026-08-31T00:00:00.000Z", value: 0 },
			{ bucket: "2026-09-07T00:00:00.000Z", value: 1 },
			{ bucket: "2026-09-14T00:00:00.000Z", value: 2 },
		]);
	});

	test("signups split by the earliest account provider", async () => {
		const result = await admin.series({
			metric: "signups",
			interval: "week",
			from: "2026-09-07T00:00:00Z",
			to: "2026-09-28T00:00:00Z",
			segment: "provider",
		});
		const grid = Object.fromEntries(
			["credential", "google", "twitch", "unknown"].map((segment) => [
				segment,
				result.buckets
					.filter((bucket) => bucket.segment === segment)
					.map((bucket) => bucket.value),
			]),
		);
		// legacy signed up before the range, so credential never appears.
		expect(grid).toEqual({
			credential: [],
			google: [0, 1, 0],
			twitch: [1, 0, 0],
			unknown: [0, 1, 0],
		});
		expect(result.buckets).toHaveLength(9);
	});

	test("validates the range and segment", async () => {
		const base = {
			metric: "signups" as const,
			interval: "day" as const,
			from: "2026-09-10T00:00:00Z",
		};
		await expect(
			admin.series({ ...base, to: "2026-09-10T00:00:00Z" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			admin.series({
				...base,
				from: "2025-01-01T00:00:00Z",
				to: "2026-09-10T00:00:00Z",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			admin.series({
				...base,
				metric: "streaming_hours",
				to: "2026-09-12T00:00:00Z",
				segment: "provider",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

describe("floorToBucket", () => {
	test("floors to the UTC day and the Monday of the ISO week", () => {
		const sunday = new Date("2026-09-13T23:59:59Z");
		expect(floorToBucket(sunday, "day").toISOString()).toBe(
			"2026-09-13T00:00:00.000Z",
		);
		expect(floorToBucket(sunday, "week").toISOString()).toBe(
			"2026-09-07T00:00:00.000Z",
		);
		expect(
			floorToBucket(new Date("2026-09-14T00:00:00Z"), "week").toISOString(),
		).toBe("2026-09-14T00:00:00.000Z");
	});
});
