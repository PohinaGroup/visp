import "../../test-env";
import { db } from "@VISP/db";
import {
	relay,
	relayHealthHourly,
	relayHealthSample,
	user,
} from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import type { Context } from "../../context";
import { utcDayStart } from "../../relay-forecast";
import { adminRouter } from "../admin";
import { adminRelayForecastRouter, relayForecastInput } from "./relay-forecast";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test("input accepts 7–92 days or nothing", () => {
	expect(relayForecastInput.safeParse(undefined).success).toBe(true);
	expect(relayForecastInput.safeParse({ days: 28 }).success).toBe(true);
	expect(relayForecastInput.safeParse({ days: 6 }).success).toBe(false);
	expect(relayForecastInput.safeParse({ days: 93 }).success).toBe(false);
});

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

function sessionFor(id: string, role: string | null): Context["session"] {
	return {
		user: { id, role, banned: false, banExpires: null },
		session: { id: `session-${id}`, userId: id, token: `token-${id}` },
	} as unknown as Context["session"];
}

integration("admin relay forecast", () => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const adminId = `relay-forecast-admin-${suffix}`;
	const memberId = `relay-forecast-member-${suffix}`;
	const today = utcDayStart(Date.now());
	const dayStart = (daysAgo: number) => new Date(today - daysAgo * DAY);
	const relayIds: number[] = [];
	let growing: number;
	let flat: number;
	let quiet: number;

	const ctx = (id: string) => ({
		auth: null,
		headers: new Headers(),
		session: sessionFor(id, id === adminId ? "admin" : "user"),
	});
	const caller = () => adminRelayForecastRouter.createCaller(ctx(adminId));

	async function createRelay(
		name: string,
		capacityPaths: number,
		maxForwarders: number,
	) {
		const [created] = await db
			.insert(relay)
			.values({
				name: `${name}-${suffix}`,
				host: `${name}.relay.test`,
				apiUrl: `http://${name}.relay.test:9997`,
				pingUrl: `https://${name}.relay.test/ping`,
				region: "test",
				capacityPaths,
				maxForwarders,
				publicIp: "192.0.2.30",
			})
			.returning({ id: relay.id });
		if (!created) throw new Error("relay insert returned no row");
		relayIds.push(created.id);
		return created.id;
	}

	const sample = (
		relayId: number,
		reportedAt: Date,
		livePaths: number | null,
		activeForwarders: number | null,
	) => ({
		relayId,
		reportedAt,
		load1: 0.5,
		cpuCount: 4,
		memUsedPct: 30,
		diskUsedPct: 40,
		livePaths,
		activeForwarders,
	});

	beforeAll(async () => {
		await db.insert(user).values([
			{
				id: adminId,
				name: "Admin",
				email: `${adminId}@example.test`,
				role: "admin",
			},
			{
				id: memberId,
				name: "Member",
				email: `${memberId}@example.test`,
				role: "user",
			},
		]);
		growing = await createRelay("forecast-growing", 100, 10);
		flat = await createRelay("forecast-flat", 50, 4);
		quiet = await createRelay("forecast-quiet", 10, 0);

		// Growing: one more peak path per day over 21 days, ending at 40
		// yesterday. Days 21–15 ago only exist as hourly rollups, days 14–1 as
		// raw samples with a quieter sample each day that must not win the max.
		// Forwarders grow one per week.
		const pathsOn = (daysAgo: number) => 41 - daysAgo;
		const forwardersOn = (daysAgo: number) => Math.floor((21 - daysAgo) / 7);
		await db.insert(relayHealthHourly).values(
			[21, 20, 19, 18, 17, 16, 15].map((daysAgo) => ({
				relayId: growing,
				hour: new Date(dayStart(daysAgo).getTime() + 18 * HOUR),
				avgLoad1: 0.5,
				maxLoad1: 1,
				maxMemUsedPct: 30,
				maxDiskUsedPct: 40,
				maxLivePaths: pathsOn(daysAgo),
				maxActiveForwarders: forwardersOn(daysAgo),
				samples: 120,
			})),
		);
		const raw = Array.from({ length: 14 }, (_, index) => 14 - index);
		await db
			.insert(relayHealthSample)
			.values(
				raw.flatMap((daysAgo) => [
					sample(
						growing,
						new Date(dayStart(daysAgo).getTime() + 3 * HOUR),
						1,
						0,
					),
					sample(
						growing,
						new Date(dayStart(daysAgo).getTime() + 20 * HOUR),
						pathsOn(daysAgo),
						forwardersOn(daysAgo),
					),
				]),
			);
		// Today's partial day and a day before the window must be ignored.
		await db
			.insert(relayHealthSample)
			.values([
				sample(growing, new Date(today + HOUR), 0, 0),
				sample(growing, dayStart(40), 99, 9),
			]);

		// Flat: 14 days at 5 paths, no forwarder data.
		await db
			.insert(relayHealthSample)
			.values(
				Array.from({ length: 14 }, (_, index) =>
					sample(
						flat,
						new Date(dayStart(index + 1).getTime() + 12 * HOUR),
						5,
						null,
					),
				),
			);

		// Quiet: three days only.
		await db
			.insert(relayHealthSample)
			.values(
				[1, 2, 3].map((daysAgo) =>
					sample(quiet, new Date(dayStart(daysAgo).getTime() + HOUR), 2, 0),
				),
			);
	});

	afterAll(async () => {
		await db.delete(relay).where(inArray(relay.id, relayIds));
		await db.delete(user).where(inArray(user.id, [adminId, memberId]));
	});

	test("non-admins are refused", async () => {
		const member = adminRelayForecastRouter.createCaller(ctx(memberId));
		await expect(member.forecast()).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		const anonymous = adminRelayForecastRouter.createCaller({
			auth: null,
			headers: new Headers(),
			session: null,
		});
		await expect(anonymous.forecast()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});

	test("is mounted on the admin router as relayForecast", async () => {
		const result = await adminRouter
			.createCaller(ctx(adminId))
			.relayForecast.forecast({ days: 28 });
		expect(result.relays.map((row) => row.relayId)).toEqual(
			expect.arrayContaining(relayIds),
		);
	});

	test("forecasts every relay from merged daily peaks", async () => {
		const result = await caller().forecast();
		expect(result).toMatchObject({
			days: 28,
			method: "linear_daily_peak",
			from: dayStart(28).toISOString(),
			to: dayStart(0).toISOString(),
		});
		const byId = new Map(result.relays.map((row) => [row.relayId, row]));

		const g = byId.get(growing);
		expect(g).toMatchObject({ capacityPaths: 100, maxForwarders: 10 });
		expect(g?.paths.points).toBe(21);
		expect(g?.paths.slopePerWeek).toBeCloseTo(7, 8);
		expect(g?.paths.currentPeak).toBe(40);
		expect(g?.paths.weeksTo80Pct).toBeCloseTo(40 / 7, 8);
		expect(g?.paths.weeksTo100Pct).toBeCloseTo(60 / 7, 8);
		expect(g?.paths.confidence).toBe("ok");
		expect(g?.forwarders.points).toBe(21);
		expect(g?.forwarders.currentPeak).toBe(2);
		// Steps 0,1,2 a week apart: Sxy = 98, Sxx = 770 -> 98 * 7 / 770.
		expect(g?.forwarders.slopePerWeek).toBeCloseTo(49 / 55, 8);
		expect(g?.forwarders.weeksTo80Pct).toBeCloseTo((8 - 2) / (49 / 55), 8);

		const f = byId.get(flat);
		expect(f?.paths).toMatchObject({
			points: 14,
			slopePerWeek: 0,
			currentPeak: 5,
			weeksTo80Pct: null,
			confidence: "ok",
		});
		// Days with samples but no forwarder value are skipped.
		expect(f?.forwarders).toMatchObject({ points: 0, slopePerWeek: null });

		const q = byId.get(quiet);
		expect(q?.paths).toMatchObject({
			points: 3,
			slopePerWeek: null,
			currentPeak: 2,
			confidence: "low",
		});
	});

	test("a shorter window drops older days", async () => {
		const result = await caller().forecast({ days: 7 });
		const g = result.relays.find((row) => row.relayId === growing);
		expect(g?.paths.points).toBe(7);
		expect(g?.paths.slopePerWeek).toBeCloseTo(7, 8);
		expect(g?.paths.confidence).toBe("low");
	});
});
