import "../../test-env";

import { db } from "@VISP/db";
import {
	appUser,
	hostedUsage,
	relay,
	relayHealth,
	relayHealthHourly,
	relayHealthSample,
	relayPath,
	relayStreamSession,
	spendBudget,
	unitPrice,
	user,
} from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";
import type { Context } from "../../context";
import type { RelayForecast } from "../../relay-forecast";
import { utcDayStart } from "../../relay-forecast";
import { adminRouter } from "../admin";
import { adminAlertsRouter } from "./alerts";
import {
	type AdminAlert,
	forecastAlerts,
	RELAY_HEALTH_STALE_MS,
	type RelayAlertInput,
	relayAlerts,
	SESSION_SUCCESS_MIN_SESSIONS,
	SUCCESS_RATE_TARGET,
	sessionSuccessAlert,
	sortAlerts,
	spendAlert,
} from "./alerts-rules";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const NOW = new Date("2026-10-10T12:00:00Z");

const relayInput = (overrides: Partial<RelayAlertInput>): RelayAlertInput => ({
	relayId: 1,
	name: "eu-1",
	capacityPaths: 100,
	maxForwarders: 20,
	assignedPaths: 0,
	peakLivePaths: null,
	peakForwarders: null,
	reportedAt: new Date(NOW.getTime() - 30_000),
	diskUsedPct: 10,
	...overrides,
});

const byKind = (alerts: AdminAlert[], kind: AdminAlert["kind"]) =>
	alerts.filter((alert) => alert.kind === kind);

describe("relay rules", () => {
	test("healthy relay raises nothing", () => {
		expect(relayAlerts(relayInput({}), NOW)).toEqual([]);
	});

	test("path capacity: 80 % warns, 95 % is critical, both inclusive", () => {
		const severity = (assignedPaths: number) =>
			byKind(
				relayAlerts(relayInput({ assignedPaths }), NOW),
				"relay_capacity",
			)[0]?.severity ?? null;
		expect(severity(79)).toBeNull();
		expect(severity(80)).toBe("warning");
		expect(severity(94)).toBe("warning");
		expect(severity(95)).toBe("critical");
		expect(severity(120)).toBe("critical");
	});

	test("paths count the larger of assigned and peak live", () => {
		const alerts = relayAlerts(
			relayInput({ assignedPaths: 10, peakLivePaths: 96 }),
			NOW,
		);
		expect(byKind(alerts, "relay_capacity")).toEqual([
			expect.objectContaining({
				id: "relay_capacity:1",
				severity: "critical",
				href: "/relays",
			}),
		]);
	});

	test("forwarders: peak vs max_forwarders; none without slots or samples", () => {
		const severity = (overrides: Partial<RelayAlertInput>) =>
			byKind(relayAlerts(relayInput(overrides), NOW), "relay_forwarders")[0]
				?.severity ?? null;
		expect(severity({ peakForwarders: 15 })).toBeNull();
		expect(severity({ peakForwarders: 16 })).toBe("warning");
		expect(severity({ peakForwarders: 19 })).toBe("critical");
		expect(severity({ peakForwarders: null })).toBeNull();
		expect(severity({ maxForwarders: 0, peakForwarders: 3 })).toBeNull();
	});

	test("disk: 80 % warns, 90 % is critical", () => {
		const severity = (diskUsedPct: number | null) =>
			byKind(relayAlerts(relayInput({ diskUsedPct }), NOW), "relay_disk")[0]
				?.severity ?? null;
		expect(severity(79.9)).toBeNull();
		expect(severity(80)).toBe("warning");
		expect(severity(89.9)).toBe("warning");
		expect(severity(90)).toBe("critical");
		expect(severity(null)).toBeNull();
	});

	test("stale: strictly older than 2 minutes, or never reported", () => {
		const stale = (reportedAt: Date | null) =>
			byKind(relayAlerts(relayInput({ reportedAt }), NOW), "relay_stale");
		expect(stale(new Date(NOW.getTime() - RELAY_HEALTH_STALE_MS))).toEqual([]);
		const reportedAt = new Date(NOW.getTime() - RELAY_HEALTH_STALE_MS - 1);
		expect(stale(reportedAt)).toEqual([
			expect.objectContaining({
				id: "relay_stale:1",
				severity: "critical",
				since: reportedAt.toISOString(),
			}),
		]);
		expect(stale(null)).toEqual([
			expect.objectContaining({
				severity: "critical",
				title: "eu-1: no health report",
			}),
		]);
	});
});

test("forecast: under 4 weeks to 80 % warns", () => {
	const forecast = (weeksTo80Pct: number | null): RelayForecast => ({
		slopePerWeek: 1,
		currentPeak: 10,
		weeksTo80Pct,
		weeksTo100Pct: null,
		confidence: "ok",
		rSquared: 0.9,
		points: 28,
		method: "linear_daily_peak",
	});
	const alerts = (paths: number | null, forwarders: number | null) =>
		forecastAlerts({
			relayId: 7,
			name: "eu-7",
			paths: forecast(paths),
			forwarders: forecast(forwarders),
		});
	expect(alerts(4, null)).toEqual([]);
	expect(alerts(3.99, 1).map(({ id, severity }) => [id, severity])).toEqual([
		["relay_forecast:7:paths", "warning"],
		["relay_forecast:7:forwarders", "warning"],
	]);
});

describe("session success rule", () => {
	const severity = (started: number, stable: number) =>
		sessionSuccessAlert({ started, stable })?.severity ?? null;

	test("needs at least 10 sessions", () => {
		expect(SESSION_SUCCESS_MIN_SESSIONS).toBe(10);
		expect(severity(9, 0)).toBeNull();
		expect(severity(10, 0)).toBe("critical");
	});

	test("below target warns, more than 10 pp below is critical", () => {
		expect(SUCCESS_RATE_TARGET).toBe(0.95);
		expect(severity(20, 19)).toBeNull(); // 95 %: on target
		expect(severity(20, 18)).toBe("warning"); // 90 %
		expect(severity(20, 17)).toBe("warning"); // 85 %: exactly target − 10 pp
		expect(severity(100, 84)).toBe("critical"); // 84 %
		expect(severity(20, 16)).toBe("critical"); // 80 %
		expect(sessionSuccessAlert({ started: 20, stable: 18 })).toMatchObject({
			id: "session_success",
			href: "/reliability",
		});
	});
});

test("spend rule: 80 % warns, 100 % is critical, spend over a 0 budget too", () => {
	const severity = (
		spentEur: number | null,
		budgetEur: number | null,
		pct: number | null,
	) =>
		spendAlert({
			feature: "tts",
			week: "2026-10-05T00:00:00.000Z",
			spentEur,
			budgetEur,
			pct,
		})?.severity ?? null;
	expect(severity(7.99, 10, 79.9)).toBeNull();
	expect(severity(8, 10, 80)).toBe("warning");
	expect(severity(9.99, 10, 99.9)).toBe("warning");
	expect(severity(10, 10, 100)).toBe("critical");
	expect(severity(1, 0, null)).toBe("critical");
	expect(severity(0, 0, 0)).toBeNull();
	expect(severity(null, 10, null)).toBeNull();
	expect(severity(5, null, null)).toBeNull();
});

test("sort: critical first, then rule order, then id", () => {
	const alert = (
		id: string,
		severity: AdminAlert["severity"],
		kind: AdminAlert["kind"],
	): AdminAlert => ({ id, severity, kind, title: id, detail: "", href: "/" });
	const sorted = sortAlerts([
		alert("spend_budget:tts", "warning", "spend_budget"),
		alert("relay_disk:10", "critical", "relay_disk"),
		alert("session_success", "critical", "session_success"),
		alert("relay_disk:9", "critical", "relay_disk"),
		alert("relay_stale:3", "critical", "relay_stale"),
		alert("relay_capacity:1", "warning", "relay_capacity"),
	]);
	expect(sorted.map((entry) => entry.id)).toEqual([
		"relay_stale:3",
		"relay_disk:9",
		"relay_disk:10",
		"session_success",
		"relay_capacity:1",
		"spend_budget:tts",
	]);
});

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

function sessionFor(id: string, role: string): Context["session"] {
	return {
		user: { id, role, banned: false, banExpires: null },
		session: { id: `session-${id}`, userId: id, token: `token-${id}` },
	} as unknown as Context["session"];
}

integration("admin.alerts.list", () => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const adminId = `alerts-admin-${suffix}`;
	const memberId = `alerts-member-${suffix}`;
	const streamerId = `alerts-streamer-${suffix}`;
	const relayIds: number[] = [];
	const ids: Record<string, number> = {};

	const ctx = (id: string, role: string) => ({
		auth: null,
		headers: new Headers(),
		session: sessionFor(id, role),
	});
	const list = () =>
		adminAlertsRouter.createCaller(ctx(adminId, "admin")).list();

	async function createRelay(
		key: string,
		capacityPaths: number,
		maxForwarders: number,
		enabled = true,
	) {
		const [created] = await db
			.insert(relay)
			.values({
				name: `alerts-${key}-${suffix}`,
				host: `${key}.relay.test`,
				apiUrl: `http://${key}.relay.test:9997`,
				pingUrl: `https://${key}.relay.test/ping`,
				region: "test",
				capacityPaths,
				maxForwarders,
				publicIp: "192.0.2.40",
				enabled,
			})
			.returning({ id: relay.id });
		if (!created) throw new Error("relay insert returned no row");
		relayIds.push(created.id);
		ids[key] = created.id;
		return created.id;
	}

	async function report(relayId: number, ageMs: number, diskUsedPct: number) {
		const diskTotalKb = 1_000_000;
		await db.insert(relayHealth).values({
			relayId,
			reportedAt: new Date(Date.now() - ageMs),
			cpuCount: 4,
			load1: 0.5,
			load5: 0.5,
			load15: 0.5,
			memTotalKb: 1_000_000,
			memAvailableKb: 500_000,
			diskTotalKb,
			diskAvailableKb: Math.round(diskTotalKb * (1 - diskUsedPct / 100)),
			uptimeSeconds: 1000,
		});
	}

	async function sample(
		relayId: number,
		ageMs: number,
		livePaths: number | null,
		activeForwarders: number | null,
	) {
		await db.insert(relayHealthSample).values({
			relayId,
			reportedAt: new Date(Date.now() - ageMs),
			load1: 0.5,
			cpuCount: 4,
			memUsedPct: 30,
			diskUsedPct: 40,
			livePaths,
			activeForwarders,
		});
	}

	let pathSeq = 0;
	async function createPath(relayId: number, directTwitch = false) {
		pathSeq++;
		const [path] = await db
			.insert(relayPath)
			.values({
				relayId,
				userId: streamerId,
				seq: pathSeq,
				slug: `alerts-${suffix}-${pathSeq}`,
				label: "main",
				directTwitch,
			})
			.returning({ id: relayPath.id });
		if (!path) throw new Error("path insert returned no row");
		return path.id;
	}

	let directPathId: number;
	/**
	 * Replaces the streamer's sessions: `stable` of `started` last two
	 * minutes, the rest 30 s; all 1–2 h old.
	 */
	async function seedSessions(started: number, stable: number) {
		await db
			.delete(relayStreamSession)
			.where(inArray(relayStreamSession.pathId, [directPathId]));
		if (started === 0) return;
		await db.insert(relayStreamSession).values(
			Array.from({ length: started }, (_, index) => {
				const startedAt = new Date(Date.now() - 2 * HOUR + index * MINUTE);
				return {
					pathId: directPathId,
					startedAt,
					endedAt: new Date(
						startedAt.getTime() + (index < stable ? 120_000 : 30_000),
					),
				};
			}),
		);
	}

	const mine = (alerts: AdminAlert[]) =>
		alerts.filter((alert) =>
			relayIds.some(
				(relayId) =>
					alert.id.endsWith(`:${relayId}`) || alert.id.includes(`:${relayId}:`),
			),
		);
	const find = (alerts: AdminAlert[], id: string) =>
		alerts.find((alert) => alert.id === id);

	beforeAll(async () => {
		// Spend and session success are fleet-wide, so start from a clean slate
		// like the spend and reliability tests do.
		await db.delete(user);
		await db.delete(unitPrice);
		await db.delete(spendBudget);
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
			{
				id: streamerId,
				name: "Streamer",
				email: `${streamerId}@example.test`,
				role: "user",
			},
		]);
		await db.insert(appUser).values({ id: streamerId, handle: `s${suffix}` });

		// Peak-live paths at 100 % (critical); forwarders at 80 % (warning).
		await createRelay("full", 10, 5);
		await report(ids.full as number, 30_000, 50);
		await sample(ids.full as number, 10 * MINUTE, 10, 4);

		// 8 of 10 paths assigned (warning). The 10-live sample is older than
		// the peak window and must not count. Disk 85 %: warning.
		await createRelay("assigned", 10, 0);
		await report(ids.assigned as number, 30_000, 85);
		await sample(ids.assigned as number, 61 * MINUTE, 10, null);
		await sample(ids.assigned as number, 5 * MINUTE, 2, null);
		for (let i = 0; i < 8; i++) await createPath(ids.assigned as number);

		// Last report 3 minutes ago (critical), disk 95 % (critical).
		await createRelay("stale", 10, 2);
		await report(ids.stale as number, 3 * MINUTE, 95);

		// Just inside the 2-minute rule, disk just below 80 %: nothing.
		await createRelay("fresh", 10, 2);
		await report(ids.fresh as number, RELAY_HEALTH_STALE_MS - 10_000, 79);

		// Enabled and never reported: critical.
		await createRelay("silent", 10, 2);

		// Disabled: stale, full disk and full paths, still nothing. Also holds
		// the streamer's Direct path for the session rule.
		await createRelay("disabled", 1, 0, false);
		await report(ids.disabled as number, DAY, 99);
		directPathId = await createPath(ids.disabled as number, true);

		// Growing two peak paths a day from 40 to 66 over 14 days: 80 of 100
		// is about a week away (forecast warning), but no capacity alert now.
		await createRelay("growing", 100, 0);
		await report(ids.growing as number, 30_000, 10);
		const today = utcDayStart(Date.now());
		await db.insert(relayHealthHourly).values(
			Array.from({ length: 14 }, (_, index) => ({
				relayId: ids.growing as number,
				hour: new Date(today - (14 - index) * DAY + 18 * HOUR),
				avgLoad1: 0.5,
				maxLoad1: 1,
				maxMemUsedPct: 30,
				maxDiskUsedPct: 40,
				maxLivePaths: 40 + 2 * index,
				maxActiveForwarders: null,
				samples: 120,
			})),
		);
	});

	afterAll(async () => {
		await db.delete(user);
		await db.delete(unitPrice);
		await db.delete(spendBudget);
		await db.delete(relay).where(inArray(relay.id, relayIds));
	});

	test("rejects non-admins with FORBIDDEN", async () => {
		await expect(
			adminAlertsRouter.createCaller(ctx(memberId, "user")).list(),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("is mounted as admin.alerts", async () => {
		const alerts = await adminRouter
			.createCaller(ctx(adminId, "admin"))
			.alerts.list();
		expect(Array.isArray(alerts)).toBe(true);
	});

	test("relay capacity, disk and stale rules", async () => {
		const alerts = await list();
		const severities = Object.fromEntries(
			mine(alerts).map((alert) => [alert.id, alert.severity]),
		);
		expect(severities).toEqual({
			[`relay_capacity:${ids.full}`]: "critical",
			[`relay_forwarders:${ids.full}`]: "warning",
			[`relay_capacity:${ids.assigned}`]: "warning",
			[`relay_disk:${ids.assigned}`]: "warning",
			[`relay_stale:${ids.stale}`]: "critical",
			[`relay_disk:${ids.stale}`]: "critical",
			[`relay_stale:${ids.silent}`]: "critical",
			[`relay_forecast:${ids.growing}:paths`]: "warning",
		});
		expect(find(alerts, `relay_capacity:${ids.assigned}`)?.detail).toContain(
			"8 assigned, peak 2 live",
		);
		expect(find(alerts, `relay_stale:${ids.stale}`)?.since).toBeString();
	});

	test("sorted critical first, then by rule", async () => {
		const alerts = await list();
		expect(alerts).toEqual(sortAlerts(alerts));
		const firstWarning = alerts.findIndex(
			(alert) => alert.severity === "warning",
		);
		if (firstWarning >= 0) {
			expect(
				alerts.slice(firstWarning).every((a) => a.severity === "warning"),
			).toBe(true);
		}
	});

	test("session success: min-sessions guard and both levels", async () => {
		const sessionAlert = async () =>
			find(await list(), "session_success")?.severity ?? null;

		await seedSessions(9, 0);
		expect(await sessionAlert()).toBeNull();

		await seedSessions(10, 10);
		expect(await sessionAlert()).toBeNull();

		await seedSessions(10, 9);
		expect(await sessionAlert()).toBe("warning");

		await seedSessions(20, 17);
		expect(await sessionAlert()).toBe("warning");

		await seedSessions(10, 8);
		expect(await sessionAlert()).toBe("critical");

		await seedSessions(0, 0);
	});

	test("spend: this ISO week against its budget", async () => {
		const spendSeverity = async () =>
			Object.fromEntries(
				(await list())
					.filter((alert) => alert.kind === "spend_budget")
					.map((alert) => [alert.id, alert.severity]),
			);
		await db.insert(unitPrice).values({
			feature: "tts",
			unit: "characters",
			provider: "elevenlabs",
			eurPerUnit: "0.001",
			validFrom: new Date("2026-01-01T00:00:00Z"),
		});
		await db.insert(spendBudget).values([
			{ feature: "tts", weeklyEur: "10.00", updatedBy: adminId },
			// Unpriced: spend unknown, never an alert.
			{ feature: "audio_isolation", weeklyEur: "0.00", updatedBy: adminId },
		]);
		const usage = (units: number, occurredAt: Date, feature = "tts") => ({
			userId: streamerId,
			feature: feature as "tts" | "audio_isolation",
			units,
			unit: (feature === "tts" ? "characters" : "seconds") as
				| "characters"
				| "seconds",
			provider: "elevenlabs",
			occurredAt,
		});
		// Last week's spend is far over, but only this week counts.
		await db
			.insert(hostedUsage)
			.values([
				usage(50_000, new Date(Date.now() - 8 * DAY)),
				usage(100, new Date(), "audio_isolation"),
			]);
		expect(await spendSeverity()).toEqual({});

		await db.insert(hostedUsage).values(usage(7_990, new Date()));
		expect(await spendSeverity()).toEqual({});

		await db.insert(hostedUsage).values(usage(10, new Date()));
		expect(await spendSeverity()).toEqual({ "spend_budget:tts": "warning" });

		await db.insert(hostedUsage).values(usage(2_000, new Date()));
		const alerts = await list();
		expect(find(alerts, "spend_budget:tts")).toMatchObject({
			severity: "critical",
			href: "/usage",
			title: "Hosted TTS over weekly budget",
		});
	});
});
