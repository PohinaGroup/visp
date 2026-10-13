// DB-backed tests point the shared pool at the test database before anything
// parses the env module, the same way apps/server/src/test-env.ts does.
if (process.env.TEST_DATABASE_URL) {
	process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

import "../../test-env";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

// Imported after the env shim above so the pool picks up TEST_DATABASE_URL.
const { db } = await import("@VISP/db");
const { adminAuditLog, relay, user } = await import("@VISP/db/schema/index");
const { eq } = await import("drizzle-orm");
const { adminRouter } = await import("../admin");

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration("admin relay update precondition", () => {
	const run = crypto.randomUUID().slice(0, 8);
	const adminId = `relay-conflict-admin-${run}`;
	let relayId = 0;

	const admin = () =>
		adminRouter.createCaller({
			auth: null,
			headers: new Headers(),
			session: {
				user: { id: adminId, role: "admin", banned: false, banExpires: null },
				session: { id: `session-${adminId}`, userId: adminId },
			} as never,
		});

	const quietly = async <T>(work: () => Promise<T>) => {
		const info = console.info;
		console.info = () => {};
		try {
			return await work();
		} finally {
			console.info = info;
		}
	};

	const stored = async () => {
		const [row] = await db.select().from(relay).where(eq(relay.id, relayId));
		return row;
	};

	beforeAll(async () => {
		await db.insert(user).values({
			id: adminId,
			name: "Relay Conflict Admin",
			email: `${adminId}@example.test`,
			role: "admin",
		});
		const [created] = await db
			.insert(relay)
			.values({
				name: `relay-conflict-${run}`,
				host: "relay.conflict.test",
				apiUrl: "https://relay.conflict.test/api",
				pingUrl: "https://relay.conflict.test/ping",
				region: "test",
				capacityPaths: 10,
				maxForwarders: 2,
				publicIp: "192.0.2.20",
				enabled: true,
			})
			.returning({ id: relay.id });
		relayId = created?.id ?? 0;
	});

	afterAll(async () => {
		await db.delete(adminAuditLog).where(eq(adminAuditLog.actorId, adminId));
		await db.delete(relay).where(eq(relay.id, relayId));
		await db.delete(user).where(eq(user.id, adminId));
	});

	test("applies an update whose expectation matches", async () => {
		await quietly(() =>
			admin().relays.update({
				id: relayId,
				enabled: false,
				expected: { enabled: true },
			}),
		);
		expect((await stored())?.enabled).toBe(false);
	});

	test("refuses a stale toggle with CONFLICT and leaves the row alone", async () => {
		// A second tab still thinks the relay is enabled and clicks Disable.
		await expect(
			quietly(() =>
				admin().relays.update({
					id: relayId,
					enabled: false,
					expected: { enabled: true },
				}),
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await expect(
			quietly(() =>
				admin().relays.update({
					id: relayId,
					capacityPaths: 50,
					expected: { capacityPaths: 99 },
				}),
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		const row = await stored();
		expect(row?.enabled).toBe(false);
		expect(row?.capacityPaths).toBe(10);
	});

	test("checks drain state and still accepts updates without an expectation", async () => {
		await quietly(() =>
			admin().relays.update({
				id: relayId,
				drained: true,
				expected: { drained: false },
			}),
		);
		await expect(
			quietly(() =>
				admin().relays.update({
					id: relayId,
					drained: true,
					expected: { drained: false },
				}),
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
		await quietly(() => admin().relays.update({ id: relayId, enabled: true }));
		const row = await stored();
		expect(row?.drainedAt).not.toBeNull();
		expect(row?.enabled).toBe(true);
	});

	test("an expectation alone is not an update", async () => {
		await expect(
			admin().relays.update({ id: relayId, expected: { enabled: true } }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
