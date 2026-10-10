import "../../test-env";
import { db } from "@VISP/db";
import {
	relay,
	relayHealth,
	relayHealthHourly,
	relayHealthSample,
	user,
} from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import type { Context } from "../../context";
import { rollupAndPruneRelayHealth } from "../../relay-health-retention";
import { adminRouter } from "../admin";
import {
	adminRelayHistoryRouter,
	pickRelayHistoryBucket,
	relayHistoryInput,
} from "./relay-history";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test("bucket defaults follow the range: raw ≤ 6 h, hour ≤ 14 d, else day", () => {
	const to = new Date("2026-10-10T12:00:00Z");
	const back = (ms: number) => new Date(to.getTime() - ms);
	expect(pickRelayHistoryBucket(back(HOUR), to)).toBe("raw");
	expect(pickRelayHistoryBucket(back(6 * HOUR), to)).toBe("raw");
	expect(pickRelayHistoryBucket(back(6 * HOUR + 1), to)).toBe("hour");
	expect(pickRelayHistoryBucket(back(7 * DAY), to)).toBe("hour");
	expect(pickRelayHistoryBucket(back(14 * DAY), to)).toBe("hour");
	expect(pickRelayHistoryBucket(back(14 * DAY + 1), to)).toBe("day");
	expect(pickRelayHistoryBucket(back(90 * DAY), to)).toBe("day");
});

test("input rejects an empty or inverted range", () => {
	const at = "2026-10-10T12:00:00Z";
	expect(relayHistoryInput.safeParse({ from: at, to: at }).success).toBe(false);
	expect(
		relayHistoryInput.safeParse({ from: "2026-10-11T00:00:00Z", to: at })
			.success,
	).toBe(false);
	expect(
		relayHistoryInput.safeParse({ from: "2026-10-09T12:00:00Z", to: at })
			.success,
	).toBe(true);
});

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

function sessionFor(id: string, role: string | null): Context["session"] {
	return {
		user: { id, role, banned: false, banExpires: null },
		session: { id: `session-${id}`, userId: id, token: `token-${id}` },
	} as unknown as Context["session"];
}

integration("admin relay history", () => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const adminId = `relay-history-admin-${suffix}`;
	const memberId = `relay-history-member-${suffix}`;
	// Whole hours, so bucket boundaries in the assertions are exact.
	const now = new Date(Math.floor(Date.now() / HOUR) * HOUR);
	const relayIds: number[] = [];
	let alpha: number;
	let beta: number;
	let rollupRelay: number;

	const ctx = (id: string) => ({
		auth: null,
		headers: new Headers(),
		session: sessionFor(id, id === adminId ? "admin" : "user"),
	});
	const caller = () => adminRelayHistoryRouter.createCaller(ctx(adminId));
	const at = (ms: number) => new Date(now.getTime() - ms);

	async function createRelay(name: string, capacityPaths: number) {
		const [created] = await db
			.insert(relay)
			.values({
				name: `${name}-${suffix}`,
				host: `${name}.relay.test`,
				apiUrl: `http://${name}.relay.test:9997`,
				pingUrl: `https://${name}.relay.test/ping`,
				region: "test",
				capacityPaths,
				maxForwarders: 4,
				publicIp: "192.0.2.20",
			})
			.returning({ id: relay.id });
		if (!created) throw new Error("relay insert returned no row");
		relayIds.push(created.id);
		return created.id;
	}

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
		alpha = await createRelay("history-alpha", 10);
		beta = await createRelay("history-beta", 20);
		rollupRelay = await createRelay("history-rollup", 10);

		await db.insert(relayHealth).values({
			relayId: alpha,
			cpuCount: 8,
			load1: 1,
			load5: 1,
			load15: 1,
			memTotalKb: 1000,
			memAvailableKb: 500,
			diskTotalKb: 1000,
			diskAvailableKb: 500,
			uptimeSeconds: 60,
		});

		// Alpha, raw window: two samples in the hour starting 2 h ago, one in
		// the hour starting 1 h ago.
		await db.insert(relayHealthSample).values([
			{
				relayId: alpha,
				reportedAt: new Date(at(2 * HOUR).getTime() + 5 * 60_000),
				load1: 1,
				cpuCount: 4,
				memUsedPct: 40,
				diskUsedPct: 50,
				livePaths: 2,
				activeForwarders: 1,
			},
			{
				relayId: alpha,
				reportedAt: new Date(at(2 * HOUR).getTime() + 35 * 60_000),
				load1: 3,
				cpuCount: 4,
				memUsedPct: 60,
				diskUsedPct: 51,
				livePaths: 5,
				activeForwarders: null,
			},
			{
				relayId: alpha,
				reportedAt: new Date(at(HOUR).getTime() + 10 * 60_000),
				load1: 2,
				cpuCount: 4,
				memUsedPct: 45,
				diskUsedPct: 52,
				livePaths: null,
				activeForwarders: null,
			},
			// A straggler in an hour that has already been rolled up.
			{
				relayId: alpha,
				reportedAt: new Date(at(35 * DAY).getTime() + 20 * 60_000),
				load1: 4,
				cpuCount: 4,
				memUsedPct: 90,
				diskUsedPct: 60,
				livePaths: 9,
				activeForwarders: 3,
			},
		]);
		// Alpha, beyond the raw window: rollups only (no cpu_count kept).
		await db.insert(relayHealthHourly).values([
			{
				relayId: alpha,
				hour: at(35 * DAY),
				avgLoad1: 1,
				maxLoad1: 2,
				maxMemUsedPct: 70,
				maxDiskUsedPct: 55,
				maxLivePaths: 6,
				maxActiveForwarders: 2,
				samples: 3,
			},
			{
				relayId: alpha,
				hour: at(34 * DAY),
				avgLoad1: 0.5,
				maxLoad1: 1,
				maxMemUsedPct: 30,
				maxDiskUsedPct: 56,
				maxLivePaths: null,
				maxActiveForwarders: null,
				samples: 120,
			},
		]);
		// Beta: one recent sample so the fleet query returns two series.
		await db.insert(relayHealthSample).values({
			relayId: beta,
			reportedAt: new Date(at(HOUR).getTime() + 15 * 60_000),
			load1: 0.25,
			cpuCount: 2,
			memUsedPct: 10,
			diskUsedPct: 20,
			livePaths: 1,
			activeForwarders: 0,
		});
	});

	afterAll(async () => {
		await db.delete(relay).where(inArray(relay.id, relayIds));
		await db.delete(user).where(inArray(user.id, [adminId, memberId]));
	});

	test("non-admins are refused", async () => {
		const member = adminRelayHistoryRouter.createCaller(ctx(memberId));
		await expect(
			member.history({
				from: at(DAY).toISOString(),
				to: now.toISOString(),
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		const anonymous = adminRelayHistoryRouter.createCaller({
			auth: null,
			headers: new Headers(),
			session: null,
		});
		await expect(
			anonymous.history({
				from: at(DAY).toISOString(),
				to: now.toISOString(),
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	test("is mounted on the admin router as relayHistory", async () => {
		const result = await adminRouter
			.createCaller(ctx(adminId))
			.relayHistory.history({
				relayId: beta,
				from: at(3 * HOUR).toISOString(),
				to: now.toISOString(),
			});
		expect(result.relays.map((row) => row.relayId)).toEqual([beta]);
	});

	test("hourly buckets for every relay in one call, with capacities", async () => {
		const result = await caller().history({
			from: at(7 * DAY).toISOString(),
			to: now.toISOString(),
		});
		expect(result.bucket).toBe("hour");
		const a = result.relays.find((row) => row.relayId === alpha);
		const b = result.relays.find((row) => row.relayId === beta);
		const r = result.relays.find((row) => row.relayId === rollupRelay);
		expect(a).toMatchObject({ capacityPaths: 10, maxForwarders: 4 });
		expect(b?.capacityPaths).toBe(20);
		// Relays without history still get a row, so the table can render them.
		expect(r?.series).toEqual([]);
		expect(a?.series).toEqual([
			{
				t: at(2 * HOUR).toISOString(),
				load1Avg: 2,
				load1Max: 3,
				cpuCount: 4,
				memUsedPctMax: 60,
				diskUsedPctMax: 51,
				livePathsMax: 5,
				activeForwardersMax: 1,
			},
			{
				t: at(HOUR).toISOString(),
				load1Avg: 2,
				load1Max: 2,
				cpuCount: 4,
				memUsedPctMax: 45,
				diskUsedPctMax: 52,
				livePathsMax: null,
				activeForwardersMax: null,
			},
		]);
		expect(b?.series).toHaveLength(1);
		expect(b?.series[0]?.load1Avg).toBe(0.25);
	});

	test("short ranges default to raw samples; relayId narrows", async () => {
		const result = await caller().history({
			relayId: alpha,
			from: at(3 * HOUR).toISOString(),
			to: now.toISOString(),
		});
		expect(result.bucket).toBe("raw");
		expect(result.relays).toHaveLength(1);
		expect(result.relays[0]?.series.map((point) => point.load1Max)).toEqual([
			1, 3, 2,
		]);
	});

	test("rollups and raw samples merge into one series across the 30-day boundary", async () => {
		const result = await caller().history({
			relayId: alpha,
			from: at(40 * DAY).toISOString(),
			to: now.toISOString(),
			bucket: "hour",
		});
		const series = result.relays[0]?.series ?? [];
		expect(series.map((point) => point.t)).toEqual([
			at(35 * DAY).toISOString(),
			at(34 * DAY).toISOString(),
			at(2 * HOUR).toISOString(),
			at(HOUR).toISOString(),
		]);
		// Rollup (3 samples, mean 1) + straggler (load 4): weighted, not 50/50.
		expect(series[0]).toEqual({
			t: at(35 * DAY).toISOString(),
			load1Avg: (1 * 3 + 4) / 4,
			load1Max: 4,
			cpuCount: 4,
			memUsedPctMax: 90,
			diskUsedPctMax: 60,
			livePathsMax: 9,
			activeForwardersMax: 3,
		});
		// A rollup-only hour falls back to the relay's latest core count.
		expect(series[1]?.cpuCount).toBe(8);
		expect(series[1]?.livePathsMax).toBeNull();
	});

	test("daily buckets read the same before and after a rollup", async () => {
		// Samples straddling the raw window, then roll the old ones away.
		const old = at(31 * DAY + 3 * HOUR);
		await db.insert(relayHealthSample).values(
			[0, 1, 2, 3].map((index) => ({
				relayId: rollupRelay,
				reportedAt: new Date(old.getTime() + index * 10 * 60_000),
				load1: index + 1,
				cpuCount: 2,
				memUsedPct: 20 + index,
				diskUsedPct: 30,
				livePaths: index,
				activeForwarders: 1,
			})),
		);
		await db.insert(relayHealthSample).values({
			relayId: rollupRelay,
			reportedAt: at(29 * DAY),
			load1: 0.5,
			cpuCount: 2,
			memUsedPct: 10,
			diskUsedPct: 31,
			livePaths: 1,
			activeForwarders: 0,
		});
		const query = () =>
			caller().history({
				relayId: rollupRelay,
				from: at(40 * DAY).toISOString(),
				to: now.toISOString(),
			});
		const before = await query();
		expect(before.bucket).toBe("day");
		const rolled = await rollupAndPruneRelayHealth(now);
		expect(rolled?.rolledSamples).toBeGreaterThanOrEqual(4);
		const after = await query();
		const series = after.relays[0]?.series ?? [];
		expect(series).toHaveLength(2);
		expect(series[0]?.load1Avg).toBeCloseTo(2.5, 5);
		expect(series[0]?.load1Max).toBe(4);
		expect(series[0]?.livePathsMax).toBe(3);
		expect(
			series.map(({ cpuCount: _cpu, load1Avg: _avg, ...rest }) => rest),
		).toEqual(
			(before.relays[0]?.series ?? []).map(
				({ cpuCount: _cpu, load1Avg: _avg, ...rest }) => rest,
			),
		);
	});

	test("refuses ranges too wide for the requested bucket", async () => {
		await expect(
			caller().history({
				from: at(7 * DAY).toISOString(),
				to: now.toISOString(),
				bucket: "raw",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
