// DB-backed tests point the shared pool at the test database before anything
// parses the env module, the same way apps/server/src/test-env.ts does.
if (process.env.TEST_DATABASE_URL) {
	process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

import "../../test-env";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

// Imported after the env shim above so the pool picks up TEST_DATABASE_URL.
const { db } = await import("@VISP/db");
const { adminAuditLog, appUser, relay, user } = await import(
	"@VISP/db/schema/index"
);
const { eq, inArray } = await import("drizzle-orm");
const { adminRouter } = await import("../admin");
const { writeAdminAudit } = await import("../../admin-audit");

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration("admin audit log", () => {
	const run = crypto.randomUUID().slice(0, 8);
	const adminId = `audit-admin-${run}`;
	const otherAdminId = `audit-admin-2-${run}`;
	const targetId = `audit-target-${run}`;
	const relayName = `audit-relay-${run}`;
	let relayId = 0;

	type Caller = ReturnType<typeof adminRouter.createCaller>;
	const callerFor = (id: string): Caller =>
		adminRouter.createCaller({
			auth: null,
			headers: new Headers(),
			// adminProcedure re-reads role and ban state from the user row; the
			// session only has to name the user.
			session: {
				user: { id, role: "admin", banned: false, banExpires: null },
				session: { id: `session-${id}`, userId: id },
			} as never,
		});

	const quietly = async <T>(work: () => Promise<T>) => {
		const info = console.info;
		const error = console.error;
		const errors: string[] = [];
		console.info = () => {};
		console.error = (message: unknown) => void errors.push(String(message));
		try {
			return { result: await work(), errors };
		} finally {
			console.info = info;
			console.error = error;
		}
	};

	beforeAll(async () => {
		await db.insert(user).values([
			{
				id: adminId,
				name: "Audit Admin",
				email: `${adminId}@example.test`,
				role: "admin",
			},
			{
				id: otherAdminId,
				name: "Other Admin",
				email: `${otherAdminId}@example.test`,
				role: "admin",
			},
			{
				id: targetId,
				name: "Audit Target",
				email: `${targetId}@example.test`,
			},
		]);
		await db.insert(appUser).values({ id: targetId, handle: `audit${run}` });
		const [created] = await db
			.insert(relay)
			.values({
				name: relayName,
				host: "relay.audit.test",
				apiUrl: "https://relay.audit.test/api",
				pingUrl: "https://relay.audit.test/ping",
				region: "test",
				capacityPaths: 10,
				maxForwarders: 2,
				publicIp: "192.0.2.10",
				enabled: false,
			})
			.returning({ id: relay.id });
		relayId = created?.id ?? 0;
	});

	afterAll(async () => {
		await db
			.delete(adminAuditLog)
			.where(inArray(adminAuditLog.actorId, [adminId, otherAdminId]));
		await db.delete(relay).where(eq(relay.id, relayId));
		await db
			.delete(user)
			.where(inArray(user.id, [adminId, otherAdminId, targetId]));
	});

	const rowsFor = (target: string) =>
		db
			.select()
			.from(adminAuditLog)
			.where(eq(adminAuditLog.targetId, target))
			.orderBy(adminAuditLog.id);

	test("ban, setRole and setFlag write rows with before and after", async () => {
		const admin = callerFor(adminId);
		const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
		await quietly(async () => {
			await admin.users.ban({ userId: targetId, reason: "abuse", expiresAt });
			await admin.users.unban({ userId: targetId });
			await admin.users.setRole({ userId: targetId, role: "admin" });
			await admin.users.setRole({ userId: targetId, role: "user" });
			await admin.users.setFlag({
				userId: targetId,
				flag: "betterTts",
				enabled: true,
			});
		});

		const rows = await rowsFor(targetId);
		expect(
			rows.map(({ actorId, targetType, action, before, after }) => ({
				actorId,
				targetType,
				action,
				before,
				after,
			})),
		).toEqual([
			{
				actorId: adminId,
				targetType: "user",
				action: "ban",
				before: { banned: false, banReason: null, banExpires: null },
				after: {
					banned: true,
					banReason: "abuse",
					banExpires: expiresAt,
					revokedSessions: 0,
				},
			},
			{
				actorId: adminId,
				targetType: "user",
				action: "unban",
				before: { banned: true, banReason: "abuse", banExpires: expiresAt },
				after: { banned: false, banReason: null, banExpires: null },
			},
			{
				actorId: adminId,
				targetType: "user",
				action: "set_role",
				before: { role: "user" },
				after: { role: "admin" },
			},
			{
				actorId: adminId,
				targetType: "user",
				action: "set_role",
				before: { role: "admin" },
				after: { role: "user" },
			},
			{
				actorId: adminId,
				targetType: "user",
				action: "set_flag:better_tts",
				before: { betterTts: false },
				after: { betterTts: true },
			},
		]);
	});

	test("relay updates record only the fields that changed", async () => {
		const admin = callerFor(otherAdminId);
		await quietly(() =>
			admin.relays.update({ id: relayId, enabled: true, region: "test" }),
		);
		const [row] = await rowsFor(String(relayId));
		expect(row).toMatchObject({
			actorId: otherAdminId,
			targetType: "relay",
			action: "relay_update",
			before: { enabled: false },
			after: { enabled: true },
		});
	});

	test("list joins names and filters by actor, target and action prefix", async () => {
		const admin = callerFor(adminId);
		const forTarget = await admin.audit.list({
			targetType: "user",
			targetId,
		});
		expect(forTarget.total).toBe(5);
		expect(forTarget.items.map(({ action }) => action)).toEqual([
			"set_flag:better_tts",
			"set_role",
			"set_role",
			"unban",
			"ban",
		]);
		expect(forTarget.items[0]).toMatchObject({
			actorId: adminId,
			actorName: "Audit Admin",
			actorEmail: `${adminId}@example.test`,
			targetName: "Audit Target",
			targetEmail: `${targetId}@example.test`,
			before: { betterTts: false },
			after: { betterTts: true },
		});
		expect(typeof forTarget.items[0]?.createdAt).toBe("string");

		const relays = await admin.audit.list({ targetType: "relay" });
		const relayRow = relays.items.find(
			(item) => item.targetId === String(relayId),
		);
		expect(relayRow).toMatchObject({
			actorName: "Other Admin",
			targetName: relayName,
			targetEmail: null,
		});

		const byOther = await admin.audit.list({ actorId: otherAdminId });
		expect(byOther.items.map(({ action }) => action)).toEqual(["relay_update"]);

		const roles = await admin.audit.list({ actorId: adminId, action: "set_" });
		expect(roles.items.map(({ action }) => action)).toEqual([
			"set_flag:better_tts",
			"set_role",
			"set_role",
		]);
		const flags = await admin.audit.list({
			actorId: adminId,
			action: "set_flag:",
		});
		expect(flags.total).toBe(1);
		// The prefix is literal: LIKE wildcards in it match nothing.
		const wildcard = await admin.audit.list({ actorId: adminId, action: "%" });
		expect(wildcard.total).toBe(0);
	});

	test("list pages newest first with an offset cursor", async () => {
		const admin = callerFor(adminId);
		const first = await admin.audit.list({ targetId, limit: 2 });
		expect(first.items).toHaveLength(2);
		expect(first.nextCursor).toBe("2");
		const second = await admin.audit.list({
			targetId,
			limit: 2,
			cursor: first.nextCursor ?? undefined,
		});
		expect(second.nextCursor).toBe("4");
		const last = await admin.audit.list({
			targetId,
			limit: 2,
			cursor: second.nextCursor ?? undefined,
		});
		expect(last.items.map(({ action }) => action)).toEqual(["ban"]);
		expect(last.nextCursor).toBeNull();
		const ids = [...first.items, ...second.items, ...last.items].map(
			({ id }) => id,
		);
		expect(new Set(ids).size).toBe(5);
	});

	test("a failed audit write is logged and leaves the admin's transaction usable", async () => {
		const { result, errors } = await quietly(() =>
			db.transaction(async (tx) => {
				const written = await writeAdminAudit(
					{
						actorId: adminId,
						// Violates the target_type check constraint.
						targetType: "device" as "user",
						targetId,
						action: "broken",
					},
					tx,
				);
				const [updated] = await tx
					.update(user)
					.set({ name: "Audit Target Renamed" })
					.where(eq(user.id, targetId))
					.returning({ name: user.name });
				return { written, name: updated?.name };
			}),
		);
		expect(result).toEqual({ written: false, name: "Audit Target Renamed" });
		expect(
			errors.some((line) => line.includes("admin_audit_write_failed")),
		).toBe(true);
		const [renamed] = await db
			.select({ name: user.name })
			.from(user)
			.where(eq(user.id, targetId));
		expect(renamed?.name).toBe("Audit Target Renamed");
		expect(
			(await rowsFor(targetId)).some(({ action }) => action === "broken"),
		).toBe(false);
	});

	test("non-admins cannot read the log", async () => {
		await expect(callerFor(targetId).audit.list({})).rejects.toThrow(
			"Administrator access required",
		);
	});
});
