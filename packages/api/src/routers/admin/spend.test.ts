import "../../test-env";

import { db } from "@VISP/db";
import {
	adminAuditLog,
	appUser,
	hostedUsage,
	relay,
	relayPath,
	relayStreamSession,
	spendBudget,
	unitPrice,
	user,
} from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import type { Context } from "../../context";
import { ensureDefaultRelay } from "../../relays";
import { floorToBucket } from "./metrics-sql";
import { adminSpendRouter, BUDGET_STATUS_WEEKS } from "./spend";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const at = (value: string) => new Date(value);
const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;

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
	return adminSpendRouter.createCaller({
		auth: null,
		headers: new Headers(),
		session,
	});
}

type Feature = "tts" | "audio_isolation";

type SeedUser = {
	id: string;
	role?: string;
	/** `first_live_at` of one-hour live sessions. */
	live?: string[];
	/** Hosted usage: [feature, units, occurred_at], provider elevenlabs. */
	hosted?: [Feature, number, string][];
};

/** Removes everything the spend views aggregate, which is global state. */
async function reset() {
	await db.delete(user);
	await db.delete(unitPrice);
	await db.delete(spendBudget);
	await db.delete(adminAuditLog).where(eq(adminAuditLog.targetType, "setting"));
}

/** TTS costs 0.001 EUR per character; audio isolation has no price. */
async function seed(users: SeedUser[]) {
	await ensureDefaultRelay();
	const defaultRelay = await db.query.relay.findFirst({
		where: eq(relay.name, "default"),
	});
	if (!defaultRelay) throw new Error("default test relay was not created");
	await db.insert(unitPrice).values({
		feature: "tts",
		unit: "characters",
		provider: "elevenlabs",
		eurPerUnit: "0.001",
		validFrom: at("2026-01-01T00:00:00Z"),
	});
	for (const seedUser of users) {
		await db.insert(user).values({
			id: seedUser.id,
			name: `${seedUser.id} name`,
			email: `${seedUser.id}@example.test`,
			role: seedUser.role ?? "user",
		});
		await db.insert(appUser).values({ id: seedUser.id, handle: seedUser.id });
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
		for (const firstLiveAt of seedUser.live ?? []) {
			await db.insert(relayStreamSession).values({
				pathId: path.id,
				startedAt: new Date(at(firstLiveAt).getTime() - 60_000),
				firstLiveAt: at(firstLiveAt),
				endedAt: new Date(at(firstLiveAt).getTime() + HOUR_MS),
			});
		}
		for (const [feature, units, occurredAt] of seedUser.hosted ?? []) {
			await db.insert(hostedUsage).values({
				userId: seedUser.id,
				feature,
				units,
				unit: feature === "tts" ? "characters" : "seconds",
				provider: "elevenlabs",
				occurredAt: at(occurredAt),
			});
		}
	}
}

const WEEK_38 = { from: "2026-09-14T00:00:00Z", to: "2026-09-21T00:00:00Z" };
const WEEK_37 = { from: "2026-09-07T00:00:00Z", to: "2026-09-14T00:00:00Z" };

integration("admin.spend", () => {
	const admin = callerFor("staff");

	beforeAll(reset);
	afterAll(reset);

	test("rejects non-admins", async () => {
		await reset();
		await seed([{ id: "staff", role: "user,admin" }, { id: "alice" }]);
		const alice = callerFor("alice");
		const attempts = [
			() => alice.perStreamer(WEEK_38),
			() => alice.budgets.list(),
			() => alice.budgets.set({ feature: "tts", weeklyEur: 1 }),
			() => alice.budgets.clear({ feature: "tts" }),
			() => alice.budgets.status(),
		];
		for (const attempt of attempts) {
			await expect(attempt()).rejects.toMatchObject({ code: "FORBIDDEN" });
		}
		expect(await db.select().from(spendBudget)).toEqual([]);
	});

	describe("perStreamer", () => {
		beforeAll(async () => {
			await reset();
			await seed([
				{
					// Admin: their spend is on the invoice, but they are not a streamer.
					id: "staff",
					role: "user,admin",
					live: ["2026-09-15T10:00:00Z"],
					hosted: [["tts", 2000, "2026-09-15T11:00:00Z"]],
				},
				{
					id: "alice",
					live: [
						"2026-09-08T10:00:00Z",
						"2026-09-15T10:00:00Z",
						"2026-09-29T10:00:00Z",
					],
					hosted: [
						// Before METRICS_DATA_START: outside every clamped window.
						["tts", 1000, "2026-09-05T10:00:00Z"],
						["tts", 500, "2026-09-08T11:00:00Z"],
						["tts", 1000, "2026-09-15T11:00:00Z"],
					],
				},
				{
					id: "bob",
					live: ["2026-09-16T10:00:00Z", "2026-09-22T10:00:00Z"],
					hosted: [
						["audio_isolation", 60, "2026-09-16T11:00:00Z"],
						["audio_isolation", 30, "2026-09-23T11:00:00Z"],
					],
				},
				// Hosted usage without ever going live still costs money.
				{ id: "eve", hosted: [["tts", 100, "2026-09-29T11:00:00Z"]] },
				// Live without any hosted usage.
				{ id: "carol", live: ["2026-10-06T10:00:00Z"] },
			]);
		});

		test("divides priced spend by active streamers, with a delta", async () => {
			const result = await admin.perStreamer({
				...WEEK_38,
				compareFrom: WEEK_37.from,
				compareTo: WEEK_37.to,
			});
			// 2000 + 1000 characters × 0.001 = 3 EUR over alice and bob.
			expect(result.totalCostEur).toBeCloseTo(3);
			expect(result.activeStreamers).toBe(2);
			expect(result.value).toBeCloseTo(1.5);
			// Week 37: 0.5 EUR over alice alone.
			expect(result.previous).toBeCloseTo(0.5);
			expect(result.deltaPct).toBeCloseTo(200);
			// Bob's audio isolation has no price: 2 of 3 rows priced.
			expect(result.pricedShare).toBeCloseTo(2 / 3);
		});

		test("is null when nothing in the range has a price", async () => {
			const result = await admin.perStreamer({
				from: "2026-09-21T00:00:00Z",
				to: "2026-09-28T00:00:00Z",
				compareFrom: WEEK_38.from,
				compareTo: WEEK_38.to,
			});
			expect(result).toMatchObject({
				value: null,
				totalCostEur: null,
				activeStreamers: 1,
				pricedShare: 0,
				deltaPct: null,
			});
			expect(result.previous).toBeCloseTo(1.5);
		});

		test("counts non-streamers' spend, 0 without usage, null without streamers", async () => {
			// Alice streams 09-29 and eve uses TTS, but eve is not a streamer.
			const withStreamers = await admin.perStreamer({
				from: "2026-09-28T00:00:00Z",
				to: "2026-10-05T00:00:00Z",
			});
			expect(withStreamers.activeStreamers).toBe(1);
			expect(withStreamers.value).toBeCloseTo(0.1);
			expect(withStreamers.previous).toBeNull();
			expect(withStreamers.deltaPct).toBeNull();

			const free = await admin.perStreamer({
				from: "2026-10-05T00:00:00Z",
				to: "2026-10-12T00:00:00Z",
			});
			expect(free).toMatchObject({
				value: 0,
				totalCostEur: 0,
				activeStreamers: 1,
				pricedShare: null,
			});

			const empty = await admin.perStreamer({
				from: "2026-10-12T00:00:00Z",
				to: "2026-10-19T00:00:00Z",
			});
			expect(empty).toMatchObject({
				value: null,
				totalCostEur: 0,
				activeStreamers: 0,
				pricedShare: null,
			});
		});

		test("clamps both windows to METRICS_DATA_START", async () => {
			// 09-01..09-14 counts from 09-07 only: the 09-05 usage drops out.
			const clamped = await admin.perStreamer({
				from: "2026-09-01T00:00:00Z",
				to: "2026-09-14T00:00:00Z",
			});
			expect(clamped.totalCostEur).toBeCloseTo(0.5);
			expect(clamped.value).toBeCloseTo(0.5);

			// A comparison starting before the data start gets no delta.
			const legacy = await admin.perStreamer({
				...WEEK_38,
				compareFrom: "2026-08-31T00:00:00Z",
				compareTo: WEEK_38.from,
			});
			expect(legacy.previous).toBeCloseTo(0.5);
			expect(legacy.deltaPct).toBeNull();

			const before = await admin.perStreamer({
				from: "2026-08-01T00:00:00Z",
				to: "2026-09-01T00:00:00Z",
			});
			expect(before).toMatchObject({
				value: null,
				totalCostEur: null,
				activeStreamers: null,
				pricedShare: null,
			});
		});

		test("validates the range", async () => {
			await expect(
				admin.perStreamer({ from: WEEK_38.to, to: WEEK_38.from }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			await expect(
				admin.perStreamer({ ...WEEK_38, compareFrom: WEEK_37.from }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});
	});

	describe("budgets", () => {
		const auditRows = () =>
			db
				.select()
				.from(adminAuditLog)
				.where(eq(adminAuditLog.targetType, "setting"))
				.orderBy(asc(adminAuditLog.id));

		beforeAll(async () => {
			await reset();
			await seed([{ id: "staff", role: "user,admin" }, { id: "alice" }]);
		});

		test("lists every feature, unset by default", async () => {
			const list = await admin.budgets.list();
			expect(list.map((entry) => entry.feature)).toEqual([
				"all",
				"tts",
				"subtitles",
				"audio_isolation",
				"encoder",
			]);
			expect(list.every((entry) => entry.weeklyEur === null)).toBe(true);
		});

		test("set, update, clear, each audited once", async () => {
			const created = await admin.budgets.set({
				feature: "tts",
				weeklyEur: 12.345,
			});
			expect(created).toEqual({
				feature: "tts",
				weeklyEur: 12.35,
				changed: true,
			});
			const listed = await admin.budgets.list();
			expect(listed.find((entry) => entry.feature === "tts")).toMatchObject({
				weeklyEur: 12.35,
				updatedBy: "staff",
				updatedByName: "staff name",
			});

			// Same value again: nothing to record.
			const same = await admin.budgets.set({
				feature: "tts",
				weeklyEur: 12.35,
			});
			expect(same.changed).toBe(false);

			await admin.budgets.set({ feature: "tts", weeklyEur: 20 });
			const cleared = await admin.budgets.clear({ feature: "tts" });
			expect(cleared).toEqual({ feature: "tts", changed: true });
			const again = await admin.budgets.clear({ feature: "tts" });
			expect(again.changed).toBe(false);
			expect(await db.select().from(spendBudget)).toEqual([]);

			const rows = await auditRows();
			expect(
				rows.map(
					({ actorId, targetType, targetId, action, before, after }) => ({
						actorId,
						targetType,
						targetId,
						action,
						before,
						after,
					}),
				),
			).toEqual([
				{
					actorId: "staff",
					targetType: "setting",
					targetId: "spend_budget:tts",
					action: "spend_budget_set",
					before: null,
					after: { weekly_eur: 12.35 },
				},
				{
					actorId: "staff",
					targetType: "setting",
					targetId: "spend_budget:tts",
					action: "spend_budget_set",
					before: { weekly_eur: 12.35 },
					after: { weekly_eur: 20 },
				},
				{
					actorId: "staff",
					targetType: "setting",
					targetId: "spend_budget:tts",
					action: "spend_budget_clear",
					before: { weekly_eur: 20 },
					after: null,
				},
			]);
		});

		test("rejects negative, oversized and unknown budgets", async () => {
			await expect(
				admin.budgets.set({ feature: "tts", weeklyEur: -1 }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			await expect(
				admin.budgets.set({ feature: "tts", weeklyEur: 1e12 }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			await expect(
				admin.budgets.set({ feature: "gpu" as never, weeklyEur: 1 }),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});
	});

	describe("budgets.status", () => {
		const currentWeek = floorToBucket(new Date(), "week");
		const weekStart = (weeksAgo: number) =>
			new Date(currentWeek.getTime() - weeksAgo * WEEK_MS);
		const inWeek = (weeksAgo: number) =>
			new Date(weekStart(weeksAgo).getTime() + HOUR_MS).toISOString();

		beforeAll(async () => {
			await reset();
			await seed([
				{ id: "staff", role: "user,admin" },
				{
					id: "alice",
					hosted: [
						["tts", 2000, inWeek(0)],
						["audio_isolation", 100, inWeek(0)],
						["tts", 500, inWeek(1)],
						// Five weeks back: just outside the window.
						["tts", 9999, inWeek(BUDGET_STATUS_WEEKS)],
					],
				},
			]);
			await admin.budgets.set({ feature: "all", weeklyEur: 10 });
			await admin.budgets.set({ feature: "tts", weeklyEur: 2 });
			await admin.budgets.set({ feature: "audio_isolation", weeklyEur: 5 });
			await admin.budgets.set({ feature: "subtitles", weeklyEur: 0 });
			await admin.budgets.set({ feature: "encoder", weeklyEur: 1 });
		});

		test("reports spend vs budget for this week and the 4 before", async () => {
			const status = await admin.budgets.status();
			expect(status).toHaveLength(BUDGET_STATUS_WEEKS * 5);
			const weeks = [...new Set(status.map((row) => row.week))];
			expect(weeks).toEqual(
				Array.from({ length: BUDGET_STATUS_WEEKS }, (_, index) =>
					weekStart(BUDGET_STATUS_WEEKS - 1 - index).toISOString(),
				),
			);
			const of = (weeksAgo: number) =>
				Object.fromEntries(
					status
						.filter((row) => row.week === weekStart(weeksAgo).toISOString())
						.map(({ feature, spentEur, budgetEur, pct }) => [
							feature,
							{ spentEur, budgetEur, pct },
						]),
				);

			const current = of(0);
			// The unpriced audio isolation adds nothing to `all`.
			expect(current.all?.spentEur).toBeCloseTo(2);
			expect(current.all?.pct).toBeCloseTo(20);
			expect(current.tts?.spentEur).toBeCloseTo(2);
			expect(current.tts?.pct).toBeCloseTo(100);
			expect(current.audio_isolation).toEqual({
				spentEur: null,
				budgetEur: 5,
				pct: null,
			});
			expect(current.subtitles).toEqual({ spentEur: 0, budgetEur: 0, pct: 0 });
			expect(current.encoder).toEqual({
				spentEur: null,
				budgetEur: 1,
				pct: null,
			});

			const lastWeek = of(1);
			expect(lastWeek.all?.spentEur).toBeCloseTo(0.5);
			expect(lastWeek.tts?.pct).toBeCloseTo(25);
			expect(lastWeek.audio_isolation).toEqual({
				spentEur: 0,
				budgetEur: 5,
				pct: 0,
			});

			expect(of(4).all).toEqual({ spentEur: 0, budgetEur: 10, pct: 0 });
		});

		test("reports null budgets once cleared", async () => {
			await admin.budgets.clear({ feature: "tts" });
			const status = await admin.budgets.status();
			const tts = status.find(
				(row) =>
					row.feature === "tts" && row.week === currentWeek.toISOString(),
			);
			expect(tts?.budgetEur).toBeNull();
			expect(tts?.pct).toBeNull();
			expect(tts?.spentEur).toBeCloseTo(2);
		});
	});
});
