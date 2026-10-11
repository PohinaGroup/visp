import "./test-env";
import { db } from "@VISP/db";
import {
	appUser,
	customDirectDestination,
	customDirectOutput,
	directDestination,
	pathState,
	relay,
	relayHealth,
	relayHealthHourly,
	relayHealthSample,
	relayPath,
	user,
} from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { tryAdvisoryLock } from "./advisory-lock";
import { reportRelayHealth, usedPct } from "./relay-health";
import { rollupAndPruneRelayHealth } from "./relay-health-retention";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

test("used percent comes from total minus available and never leaves 0–100", () => {
	expect(usedPct(1000, 250)).toBe(75);
	expect(usedPct(0, 0)).toBe(0);
	expect(usedPct(1000, 2000)).toBe(0);
});

integration("relay health history", () => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const relayName = `health-history-${suffix}`;
	const userId = `health-history-user-${suffix}`;
	let relayId: number;

	beforeAll(async () => {
		const [created] = await db
			.insert(relay)
			.values({
				name: relayName,
				host: "relay.test",
				apiUrl: "http://relay.test:9997",
				pingUrl: "https://relay.test/ping",
				region: "test",
				capacityPaths: 10,
				maxForwarders: 4,
				publicIp: "192.0.2.10",
			})
			.returning({ id: relay.id });
		if (!created) throw new Error("relay insert returned no row");
		relayId = created.id;
		await db
			.insert(user)
			.values({ id: userId, name: "History", email: `${userId}@example.test` });
		await db.insert(appUser).values({ id: userId, handle: userId });
		const paths = await db
			.insert(relayPath)
			.values([
				{ relayId, userId, seq: 1, slug: `${userId}-1`, label: "Live" },
				{ relayId, userId, seq: 2, slug: `${userId}-2`, label: "Idle" },
			])
			.returning({ id: relayPath.id });
		const [live, idle] = paths;
		if (!live || !idle) throw new Error("path insert returned no rows");
		await db.insert(pathState).values([
			{ pathId: live.id, publishing: true, directTwitchState: "live" },
			{ pathId: idle.id, publishing: false, directKickState: "stopped" },
		]);
		// Every forwarder kind capacity enforcement counts against
		// max_forwarders: a portrait destination and a custom output, live, plus
		// a custom output that only holds a reservation (no encoder yet).
		await db.insert(directDestination).values({
			userId,
			pathId: live.id,
			provider: "youtube",
			role: "portrait",
			crop: { x: 0.3418, y: 0, w: 0.3164, h: 1, aspect: "9:16" },
			state: "live",
		});
		await db.insert(customDirectDestination).values(
			["dest", "dest-2"].map((name) => ({
				id: `${userId}-${name}`,
				userId,
				name,
				protocol: "rtmp" as const,
				encryptedUrl: "opaque",
				endpointSummary: "rtmp://example.test",
			})),
		);
		await db.insert(customDirectOutput).values([
			{
				id: `${userId}-out-live`,
				userId,
				destinationId: `${userId}-dest`,
				pathId: live.id,
				state: "live",
			},
			{
				id: `${userId}-out-reserved`,
				userId,
				destinationId: `${userId}-dest-2`,
				pathId: idle.id,
				reservedRelayId: relayId,
				reservedUntil: new Date(Date.now() + 60_000),
			},
		]);
	});

	afterAll(async () => {
		await db.delete(user).where(eq(user.id, userId));
		await db.delete(relay).where(eq(relay.id, relayId));
	});

	const samples = () =>
		db
			.select()
			.from(relayHealthSample)
			.where(eq(relayHealthSample.relayId, relayId))
			.orderBy(asc(relayHealthSample.reportedAt));
	const hourly = () =>
		db
			.select()
			.from(relayHealthHourly)
			.where(eq(relayHealthHourly.relayId, relayId))
			.orderBy(asc(relayHealthHourly.hour));

	const report = () => ({
		relay: relayName,
		cpuCount: 4,
		load1: 1.5,
		load5: 1,
		load15: 0.5,
		memTotalKb: 8_000_000,
		memAvailableKb: 2_000_000,
		diskTotalKb: 100_000_000,
		diskAvailableKb: 90_000_000,
		uptimeSeconds: 3600,
	});

	test("a pushed report also lands as a history sample", async () => {
		expect(await reportRelayHealth(report())).toBe(true);
		const [sample] = await samples();
		expect(sample).toMatchObject({
			cpuCount: 4,
			load1: 1.5,
			memUsedPct: 75,
			diskUsedPct: 10,
			livePaths: 1,
			// Twitch landscape + YouTube portrait + live custom output; the
			// reserved-only custom output runs no encoder yet.
			activeForwarders: 3,
		});
		expect(Date.now() - (sample?.reportedAt.getTime() ?? 0)).toBeLessThan(
			60_000,
		);
		await db
			.delete(relayHealthSample)
			.where(eq(relayHealthSample.relayId, relayId));
	});

	test("a failed history insert is logged and the report still succeeds", async () => {
		const realInsert = db.insert.bind(db);
		const insert = spyOn(db, "insert").mockImplementation(((
			table: Parameters<typeof db.insert>[0],
		) => {
			if (table !== relayHealthSample) return realInsert(table);
			return {
				values: () => ({
					onConflictDoNothing: () =>
						Promise.reject(new Error("sample table unavailable")),
				}),
			};
		}) as unknown as typeof db.insert);
		const errors: unknown[][] = [];
		try {
			const result = await reportRelayHealth(
				{ ...report(), load1: 2.5 },
				{ error: (...args: unknown[]) => void errors.push(args) },
			);
			expect(result).toBe(true);
		} finally {
			insert.mockRestore();
		}
		expect(errors).toHaveLength(1);
		expect(String(errors[0]?.[0])).toContain("sample insert failed");
		// The live snapshot was still saved; only history is missing.
		const [live] = await db
			.select({ load1: relayHealth.load1 })
			.from(relayHealth)
			.where(eq(relayHealth.relayId, relayId));
		expect(live?.load1).toBe(2.5);
		expect(await samples()).toHaveLength(0);
	});

	test("rollup aggregates old samples by hour, prunes, and is idempotent", async () => {
		const now = new Date("2026-10-10T12:20:00Z");
		// Raw cutoff is now − 30 d truncated to the hour: 2026-09-10T12:00Z.
		const sample = (
			at: string,
			load1: number,
			mem: number,
			disk: number,
			live: number | null,
			forwarders: number | null,
		) => ({
			relayId,
			reportedAt: new Date(at),
			load1,
			cpuCount: 4,
			memUsedPct: mem,
			diskUsedPct: disk,
			livePaths: live,
			activeForwarders: forwarders,
		});
		await db.insert(relayHealthSample).values([
			sample("2026-09-10T10:05:00Z", 1, 40, 10, 2, null),
			sample("2026-09-10T10:35:00Z", 3, 60, 12, null, 1),
			sample("2026-09-10T11:59:30Z", 2, 50, 11, 0, 0),
			// Older than now − 30 d but inside the current cutoff hour: kept raw
			// until the whole hour can roll at once.
			sample("2026-09-10T12:05:00Z", 9, 90, 90, 9, 9),
			sample("2026-10-10T12:00:00Z", 1, 1, 1, 1, 1),
		]);
		await db.insert(relayHealthHourly).values([
			{
				relayId,
				hour: new Date("2025-09-01T00:00:00Z"),
				avgLoad1: 1,
				maxLoad1: 1,
				maxMemUsedPct: 1,
				maxDiskUsedPct: 1,
				samples: 120,
			},
			{
				relayId,
				hour: new Date("2025-09-15T00:00:00Z"),
				avgLoad1: 1,
				maxLoad1: 1,
				maxMemUsedPct: 1,
				maxDiskUsedPct: 1,
				samples: 120,
			},
		]);

		const first = await rollupAndPruneRelayHealth(now);
		expect(first?.rolledSamples).toBeGreaterThanOrEqual(3);
		expect(first?.prunedHourly).toBeGreaterThanOrEqual(1);
		expect(
			(await samples()).map((row) => row.reportedAt.toISOString()),
		).toEqual(["2026-09-10T12:05:00.000Z", "2026-10-10T12:00:00.000Z"]);
		const rolled = await hourly();
		expect(rolled.map((row) => row.hour.toISOString())).toEqual([
			"2025-09-15T00:00:00.000Z",
			"2026-09-10T10:00:00.000Z",
			"2026-09-10T11:00:00.000Z",
		]);
		expect(rolled[1]).toMatchObject({
			avgLoad1: 2,
			maxLoad1: 3,
			maxMemUsedPct: 60,
			maxDiskUsedPct: 12,
			maxLivePaths: 2,
			maxActiveForwarders: 1,
			samples: 2,
		});
		expect(rolled[2]).toMatchObject({
			avgLoad1: 2,
			samples: 1,
			maxLivePaths: 0,
			maxActiveForwarders: 0,
		});

		const again = await rollupAndPruneRelayHealth(now);
		expect(again).toEqual({ rolledSamples: 0, hourlyRows: 0, prunedHourly: 0 });
		expect(await hourly()).toEqual(rolled);

		// A straggler in an already-rolled hour merges instead of replacing it.
		await db
			.insert(relayHealthSample)
			.values(sample("2026-09-10T10:50:00Z", 5, 70, 5, 4, null));
		await rollupAndPruneRelayHealth(now);
		const merged = (await hourly())[1];
		expect(merged).toMatchObject({
			maxLoad1: 5,
			maxMemUsedPct: 70,
			maxDiskUsedPct: 12,
			maxLivePaths: 4,
			maxActiveForwarders: 1,
			samples: 3,
		});
		expect(merged?.avgLoad1).toBeCloseTo(3, 5);
	});

	test("a second instance skips while one holds the lock", async () => {
		const held = await tryAdvisoryLock("relay-health-retention");
		if (!held) throw new Error("retention lock was already held");
		try {
			expect(await rollupAndPruneRelayHealth()).toBeNull();
		} finally {
			await held.release();
		}
	});
});
