import "../../test-env";

import { db } from "@VISP/db";
import {
	appUser,
	chatBot,
	forwarderSession,
	hostedUsage,
	multiChatOverlay,
	multiChatSource,
	relay,
	relayPath,
	relayStreamSession,
	unitPrice,
	user,
} from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { Context } from "../../context";
import { ensureDefaultRelay } from "../../relays";
import { floorToBucket } from "./metrics-sql";
import { adminUsageRouter } from "./usage";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const at = (value: string) => new Date(value);
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
	return adminUsageRouter.createCaller({
		auth: null,
		headers: new Headers(),
		session,
	});
}

type Destination = "twitch" | "kick" | "youtube" | "custom";

type SeedUser = {
	id: string;
	role?: string;
	/** Live sessions: [first_live_at, ended_at]. */
	live?: [string, string][];
	/** Forwarder sessions: [destination, started_at, ended_at | null]. */
	forwarders?: [Destination, string, string | null][];
	/** Hosted usage: [feature, units, provider, occurred_at]. */
	hosted?: ["tts" | "audio_isolation", number, string | null, string][];
	obsLastSeenAt?: string;
	studio?: boolean;
	chatBotEnabled?: boolean;
	/** [overlay token issued, multichat source enabled]. */
	multichat?: [boolean, boolean];
};

const OPEN_STARTED_AT = new Date(Date.now() - 2 * HOUR_MS);

const USERS: SeedUser[] = [
	{
		id: "alice",
		live: [["2026-09-08T10:00:00Z", "2026-09-08T12:00:00Z"]],
		forwarders: [
			// Starts before a 09-08 range: only the hour after midnight counts.
			["twitch", "2026-09-07T23:00:00Z", "2026-09-08T01:00:00Z"],
			// Crosses midnight: 30 min in each day.
			["twitch", "2026-09-08T23:30:00Z", "2026-09-09T00:30:00Z"],
			// Concurrent with the one above: 60 min + 15 min.
			["kick", "2026-09-08T23:00:00Z", "2026-09-09T00:15:00Z"],
		],
		hosted: [
			// elevenlabs price 0.0001 until 09-15, then 0.0002.
			["tts", 1000, "elevenlabs", "2026-09-08T10:00:00Z"],
			["tts", 1000, "elevenlabs", "2026-09-16T10:00:00Z"],
			// A newer catch-all (0.005, 09-18) must not beat the provider price.
			["tts", 1000, "elevenlabs", "2026-09-19T10:00:00Z"],
			// Exactly at `to`: outside the half-open range.
			["tts", 99_999, "elevenlabs", "2026-09-21T00:00:00Z"],
		],
		obsLastSeenAt: "2026-09-15T12:00:00Z",
		chatBotEnabled: true,
	},
	{
		id: "bob",
		live: [["2026-09-09T20:00:00Z", "2026-09-09T21:00:00Z"]],
		forwarders: [
			// Clipped by a range ending 09-10: 60 min on 09-09.
			["youtube", "2026-09-09T23:00:00Z", "2026-09-10T02:00:00Z"],
			// Back-to-back handover: never two at once.
			["kick", "2026-09-10T10:00:00Z", "2026-09-10T11:00:00Z"],
			["twitch", "2026-09-10T11:00:00Z", "2026-09-10T12:00:00Z"],
		],
		hosted: [
			// No provider: catch-all 0.001 → 0.1 EUR.
			["tts", 100, null, "2026-09-10T10:00:00Z"],
			// Unknown provider after the 09-18 catch-all: 0.005 → 0.5 EUR.
			["tts", 100, "acme", "2026-09-19T10:00:00Z"],
			// No price row at all.
			["audio_isolation", 60, "elevenlabs", "2026-09-17T10:00:00Z"],
		],
		obsLastSeenAt: "2026-09-25T12:00:00Z",
		chatBotEnabled: false,
		multichat: [true, false],
	},
	{
		id: "carol",
		live: [["2026-09-10T10:00:00Z", "2026-09-10T11:00:00Z"]],
		// Still running: counts until now.
		forwarders: [["custom", OPEN_STARTED_AT.toISOString(), null]],
		studio: true,
		multichat: [true, true],
	},
	{
		id: "dave",
		live: [["2026-09-12T10:00:00Z", "2026-09-12T11:00:00Z"]],
		hosted: [["audio_isolation", 30, "elevenlabs", "2026-09-13T10:00:00Z"]],
		// Revoked overlay: the enabled source alone does not count.
		multichat: [false, true],
	},
	{
		// Never live: not an active streamer, but still on the leaderboard.
		id: "eve",
		forwarders: [["twitch", "2026-09-12T10:00:00Z", "2026-09-12T11:00:00Z"]],
		chatBotEnabled: true,
	},
	{
		// Admin: in spend totals, never in per-streamer views.
		id: "staff",
		role: "user,admin",
		live: [["2026-09-08T10:00:00Z", "2026-09-08T15:00:00Z"]],
		hosted: [["tts", 500, "elevenlabs", "2026-09-09T10:00:00Z"]],
		chatBotEnabled: true,
	},
];

const PRICES: {
	feature: "tts";
	provider: string | null;
	eurPerUnit: string;
	validFrom: string;
}[] = [
	{
		feature: "tts",
		provider: "elevenlabs",
		eurPerUnit: "0.0001",
		validFrom: "2026-09-01T00:00:00Z",
	},
	{
		feature: "tts",
		provider: "elevenlabs",
		eurPerUnit: "0.0002",
		validFrom: "2026-09-15T00:00:00Z",
	},
	{
		feature: "tts",
		provider: null,
		eurPerUnit: "0.001",
		validFrom: "2026-09-01T00:00:00Z",
	},
	{
		feature: "tts",
		provider: null,
		eurPerUnit: "0.005",
		validFrom: "2026-09-18T00:00:00Z",
	},
];

async function seed() {
	await ensureDefaultRelay();
	const defaultRelay = await db.query.relay.findFirst({
		where: eq(relay.name, "default"),
	});
	if (!defaultRelay) throw new Error("default test relay was not created");
	for (const price of PRICES) {
		await db.insert(unitPrice).values({
			feature: price.feature,
			unit: "characters",
			provider: price.provider,
			eurPerUnit: price.eurPerUnit,
			validFrom: at(price.validFrom),
		});
	}
	for (const seedUser of USERS) {
		await db.insert(user).values({
			id: seedUser.id,
			name: `${seedUser.id} name`,
			email: `${seedUser.id}@example.test`,
			role: seedUser.role ?? "user",
		});
		await db.insert(appUser).values({
			id: seedUser.id,
			handle: seedUser.id,
			obsLastSeenAt: seedUser.obsLastSeenAt ? at(seedUser.obsLastSeenAt) : null,
			directProductionMode: seedUser.studio ? "cloud_studio" : "obs",
		});
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
		for (const [startedAt, endedAt] of seedUser.live ?? []) {
			await db.insert(relayStreamSession).values({
				pathId: path.id,
				startedAt: at(startedAt),
				endedAt: at(endedAt),
			});
		}
		for (const [destination, startedAt, endedAt] of seedUser.forwarders ?? []) {
			await db.insert(forwarderSession).values({
				pathId: path.id,
				relayId: defaultRelay.id,
				destination,
				startedAt: at(startedAt),
				endedAt: endedAt ? at(endedAt) : null,
			});
		}
		for (const [feature, units, provider, occurredAt] of seedUser.hosted ??
			[]) {
			await db.insert(hostedUsage).values({
				userId: seedUser.id,
				feature,
				units,
				unit: feature === "tts" ? "characters" : "seconds",
				provider,
				occurredAt: at(occurredAt),
			});
		}
		if (seedUser.chatBotEnabled !== undefined) {
			await db
				.insert(chatBot)
				.values({ userId: seedUser.id, enabled: seedUser.chatBotEnabled });
		}
		if (seedUser.multichat) {
			const [token, sourceEnabled] = seedUser.multichat;
			await db.insert(multiChatOverlay).values({
				userId: seedUser.id,
				tokenId: token ? `${seedUser.id}-token` : null,
				tokenHash: token ? "hash" : null,
			});
			await db.insert(multiChatSource).values({
				userId: seedUser.id,
				provider: "twitch",
				channelLogin: seedUser.id,
				enabled: sourceEnabled,
			});
		}
	}
}

const SEPT = {
	from: "2026-09-07T00:00:00Z",
	to: "2026-09-21T00:00:00Z",
	interval: "week" as const,
};

integration("admin.usage", () => {
	const admin = callerFor("staff");

	beforeAll(async () => {
		// Usage is a global aggregate, so start from empty tables.
		await db.delete(user);
		await db.delete(unitPrice);
		await seed();
	});

	afterAll(async () => {
		await db.delete(user);
		await db.delete(unitPrice);
	});

	test("rejects non-admins", async () => {
		for (const procedure of [
			"hostedSeries",
			"encoderSeries",
			"featureAdoption",
			"topUsers",
		] as const) {
			await expect(callerFor("alice")[procedure](SEPT)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
		}
	});

	test("validates the range", async () => {
		await expect(
			admin.hostedSeries({ ...SEPT, to: SEPT.from }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		await expect(
			admin.encoderSeries({ ...SEPT, from: "2025-01-01T00:00:00Z" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("hosted cost uses the price in effect, provider first, else catch-all", async () => {
		const result = await admin.hostedSeries(SEPT);
		const tts = result.buckets.filter((bucket) => bucket.feature === "tts");
		expect(tts.map((bucket) => bucket.bucket)).toEqual([
			"2026-09-07T00:00:00.000Z",
			"2026-09-14T00:00:00.000Z",
		]);
		// Week 1: alice 1000 × 0.0001, bob 100 × 0.001 (no provider), staff
		// 500 × 0.0001. Week 2: alice 2 × 1000 × 0.0002 (the provider price,
		// not the newer 0.005 catch-all), bob "acme" 100 × 0.005.
		expect(tts.map((bucket) => bucket.units)).toEqual([1600, 2100]);
		expect(tts[0]?.costEur).toBeCloseTo(0.25, 10);
		expect(tts[1]?.costEur).toBeCloseTo(0.9, 10);
		expect(tts.every((bucket) => bucket.pricedUnits === bucket.units)).toBe(
			true,
		);
	});

	test("unpriced usage keeps its units and a null cost", async () => {
		const result = await admin.hostedSeries(SEPT);
		const isolation = result.buckets.filter(
			(bucket) => bucket.feature === "audio_isolation",
		);
		expect(isolation).toEqual([
			{
				bucket: "2026-09-07T00:00:00.000Z",
				feature: "audio_isolation",
				unit: "seconds",
				units: 30,
				pricedUnits: 0,
				costEur: null,
			},
			{
				bucket: "2026-09-14T00:00:00.000Z",
				feature: "audio_isolation",
				unit: "seconds",
				units: 60,
				pricedUnits: 0,
				costEur: null,
			},
		]);
		expect(result.features).toEqual([
			{
				feature: "audio_isolation",
				unit: "seconds",
				units: 90,
				pricedUnits: 0,
				costEur: null,
				pricedShare: 0,
			},
			expect.objectContaining({
				feature: "tts",
				unit: "characters",
				units: 3700,
				pricedShare: 1,
			}),
		]);
		expect(result.totalCostEur).toBeCloseTo(1.15, 10);
		// 6 of 8 usage rows found a price.
		expect(result.pricedShare).toBe(0.75);

		const onlyUnpriced = await admin.hostedSeries({
			from: "2026-09-17T00:00:00Z",
			to: "2026-09-18T00:00:00Z",
			interval: "day",
		});
		expect(onlyUnpriced.totalCostEur).toBeNull();
		expect(onlyUnpriced.pricedShare).toBe(0);
	});

	test("an empty range costs 0 and has no priced share", async () => {
		const result = await admin.hostedSeries({
			from: "2026-08-01T00:00:00Z",
			to: "2026-08-08T00:00:00Z",
			interval: "day",
		});
		expect(result).toMatchObject({
			buckets: [],
			features: [],
			totalCostEur: 0,
			pricedShare: null,
		});
	});

	test("encoder minutes clip sessions to buckets and to the range", async () => {
		const result = await admin.encoderSeries({
			from: "2026-09-08T00:00:00Z",
			to: "2026-09-11T00:00:00Z",
			interval: "day",
		});
		const grid = Object.fromEntries(
			["kick", "twitch", "youtube"].map((destination) => [
				destination,
				result.buckets
					.filter((bucket) => bucket.destination === destination)
					.map((bucket) => bucket.minutes),
			]),
		);
		expect(grid).toEqual({
			kick: [60, 15, 60],
			twitch: [90, 30, 60],
			youtube: [0, 60, 120],
		});
		expect(result.totalMinutes).toBe(495);
		// 09-08: two overlap at 23:30. 09-09: both carried in over midnight.
		// 09-10: youtube carried in; kick → twitch handover counts once.
		expect(result.peaks).toEqual([
			{ bucket: "2026-09-08T00:00:00.000Z", peak: 2 },
			{ bucket: "2026-09-09T00:00:00.000Z", peak: 2 },
			{ bucket: "2026-09-10T00:00:00.000Z", peak: 1 },
		]);
		expect(result.peak).toBe(2);

		const clipped = await admin.encoderSeries({
			from: "2026-09-09T12:00:00Z",
			to: "2026-09-10T00:00:00Z",
			interval: "day",
		});
		expect(clipped.buckets).toEqual([
			{
				bucket: "2026-09-09T00:00:00.000Z",
				destination: "youtube",
				minutes: 60,
			},
		]);
	});

	test("weekly encoder buckets clip the first partial week", async () => {
		const result = await admin.encoderSeries({
			from: "2026-09-08T00:00:00Z",
			to: "2026-09-15T00:00:00Z",
			interval: "week",
		});
		expect(result.buckets.map((bucket) => bucket.bucket)).toEqual([
			"2026-09-07T00:00:00.000Z",
			"2026-09-07T00:00:00.000Z",
			"2026-09-07T00:00:00.000Z",
			"2026-09-14T00:00:00.000Z",
			"2026-09-14T00:00:00.000Z",
			"2026-09-14T00:00:00.000Z",
		]);
		// alice twitch 60 (clipped) + 30 + 30, bob twitch 60, eve 60.
		const twitch = result.buckets.find(
			(bucket) => bucket.destination === "twitch",
		);
		expect(twitch?.minutes).toBe(240);
	});

	test("open forwarder sessions count until now", async () => {
		const now = new Date();
		const result = await admin.encoderSeries({
			from: floorToBucket(
				new Date(now.getTime() - 7 * DAY_MS),
				"day",
			).toISOString(),
			to: new Date(floorToBucket(now, "day").getTime() + DAY_MS).toISOString(),
			interval: "week",
		});
		const custom = result.buckets
			.filter((bucket) => bucket.destination === "custom")
			.reduce((sum, bucket) => sum + bucket.minutes, 0);
		expect(Math.abs(custom - 120)).toBeLessThan(1);
		expect(result.peak).toBe(1);
	});

	test("feature adoption among active eligible streamers", async () => {
		const result = await admin.featureAdoption(SEPT);
		// alice, bob, carol, dave; eve never went live and staff is an admin.
		expect(result.activeStreamers).toBe(4);
		const users = Object.fromEntries(
			result.features.map((feature) => [feature.key, feature.users]),
		);
		expect(users).toEqual({
			direct: 2,
			chat_bot: 1,
			multichat_overlay: 1,
			obs_plugin: 1,
			studio: 1,
			hosted_tts: 2,
			hosted_audio_isolation: 2,
		});
		expect(result.features.find((f) => f.key === "direct")?.share).toBe(0.5);

		const legacy = await admin.featureAdoption({
			from: "2026-08-01T00:00:00Z",
			to: "2026-09-01T00:00:00Z",
			interval: "week",
		});
		expect(legacy.activeStreamers).toBe(0);
		expect(legacy.features.every((feature) => feature.share === null)).toBe(
			true,
		);
	});

	test("top users rank by cost, then unpriced units, then encoder time", async () => {
		const { users } = await admin.topUsers(SEPT);
		expect(users.map((entry) => entry.id)).toEqual([
			"bob",
			"alice",
			"dave",
			"eve",
		]);
		const [bob, alice, dave, eve] = users;
		expect(bob).toMatchObject({
			name: "bob name",
			email: "bob@example.test",
			hoursStreamed: 1,
			encoderMinutes: 300,
		});
		expect(bob?.costEur).toBeCloseTo(0.6, 10);
		expect(bob?.usage).toEqual([
			{
				feature: "audio_isolation",
				unit: "seconds",
				units: 60,
				costEur: null,
			},
			expect.objectContaining({ feature: "tts", units: 200 }),
		]);
		expect(alice).toMatchObject({ hoursStreamed: 2, encoderMinutes: 255 });
		expect(alice?.costEur).toBeCloseTo(0.5, 10);
		expect(dave).toMatchObject({
			costEur: null,
			hoursStreamed: 1,
			encoderMinutes: 0,
		});
		expect(eve).toMatchObject({
			costEur: null,
			usage: [],
			hoursStreamed: 0,
			encoderMinutes: 60,
		});
		// Admin-only payload: nothing beyond the listed fields.
		expect(Object.keys(bob ?? {}).sort()).toEqual([
			"costEur",
			"email",
			"encoderMinutes",
			"hoursStreamed",
			"id",
			"name",
			"usage",
		]);
	});
});
