import "./test-env";

import { applyDirectState, stopDirectForPaths } from "@VISP/api/direct";
import { applyCustomDirectState } from "@VISP/api/direct-custom";
import { reconcileForwarderSessions } from "@VISP/api/forwarder-sessions";
import { ensureDefaultRelay } from "@VISP/api/relays";
import { db } from "@VISP/db";
import {
	appUser,
	customDirectDestination,
	customDirectOutput,
	directDestination,
	forwarderSession,
	pathState,
	relay,
	relayPath,
	user,
} from "@VISP/db/schema/index";
import { beforeEach, test as bunTest, describe, expect } from "bun:test";
import { asc, eq } from "drizzle-orm";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const test = bunTest.serial;

async function seedPath() {
	await db
		.insert(user)
		.values({ id: "fwd-user", name: "Fwd", email: "fwd@example.test" });
	await db.insert(appUser).values({ id: "fwd-user", handle: "fwd" });
	const defaultRelay = await db.query.relay.findFirst({
		where: eq(relay.name, "default"),
	});
	if (!defaultRelay) throw new Error("default test relay was not created");
	const [path] = await db
		.insert(relayPath)
		.values({
			relayId: defaultRelay.id,
			userId: "fwd-user",
			seq: 1,
			slug: "fwd-1",
			label: "main",
		})
		.returning();
	if (!path) throw new Error("test path was not created");
	return { path, relayId: defaultRelay.id };
}

function sessionsFor(pathId: number) {
	return db
		.select()
		.from(forwarderSession)
		.where(eq(forwarderSession.pathId, pathId))
		.orderBy(asc(forwarderSession.id));
}

integration("Direct forwarder sessions", () => {
	beforeEach(async () => {
		await db.delete(user);
		await ensureDefaultRelay();
	});

	test("entering an occupied state opens one row; leaving closes it", async () => {
		const { path, relayId } = await seedPath();
		await applyDirectState({
			slug: path.slug,
			provider: "twitch",
			state: "starting",
		});
		let rows = await sessionsFor(path.id);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			relayId,
			destination: "twitch",
			destinationRef: null,
			role: "landscape",
			endedAt: null,
		});

		// starting → live → brb → live stays one forwarder, one row.
		for (const state of ["live", "brb", "live", "starting"] as const) {
			await applyDirectState({ slug: path.slug, provider: "twitch", state });
		}
		rows = await sessionsFor(path.id);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.endedAt).toBeNull();

		await applyDirectState({
			slug: path.slug,
			provider: "twitch",
			state: "stopped",
		});
		rows = await sessionsFor(path.id);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.endedAt).toBeInstanceOf(Date);
		expect(rows[0]?.endedAt?.getTime() ?? 0).toBeGreaterThanOrEqual(
			rows[0]?.startedAt.getTime() ?? Number.POSITIVE_INFINITY,
		);

		// A new start is a new session, not a reopened one.
		await applyDirectState({
			slug: path.slug,
			provider: "twitch",
			state: "live",
		});
		rows = await sessionsFor(path.id);
		expect(rows).toHaveLength(2);
		expect(rows[1]?.endedAt).toBeNull();
	});

	test("double enter and concurrent syncs keep one open row per forwarder", async () => {
		const { path } = await seedPath();
		await Promise.all([
			applyDirectState({ slug: path.slug, provider: "kick", state: "live" }),
			applyDirectState({ slug: path.slug, provider: "kick", state: "live" }),
			reconcileForwarderSessions(),
			reconcileForwarderSessions(),
		]);
		await reconcileForwarderSessions();
		const rows = await sessionsFor(path.id);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ destination: "kick", endedAt: null });
	});

	test("portrait and custom outputs are tracked as separate forwarders", async () => {
		const { path } = await seedPath();
		const [portrait] = await db
			.insert(directDestination)
			.values({
				userId: "fwd-user",
				pathId: path.id,
				provider: "youtube",
				role: "portrait",
				crop: { x: 0.3418, y: 0, w: 0.3164, h: 1, aspect: "9:16" },
			})
			.returning();
		await db.insert(customDirectDestination).values({
			id: "fwd-custom-dest",
			userId: "fwd-user",
			name: "Restream",
			protocol: "rtmp",
			encryptedUrl: "opaque",
			endpointSummary: "rtmp://example.test",
		});
		await db.insert(customDirectOutput).values({
			id: "fwd-custom-out",
			userId: "fwd-user",
			destinationId: "fwd-custom-dest",
			pathId: path.id,
		});

		await applyDirectState({
			slug: path.slug,
			provider: "youtube",
			state: "live",
		});
		await applyDirectState({
			slug: path.slug,
			provider: "youtube",
			role: "portrait",
			state: "live",
		});
		await applyCustomDirectState({
			slug: path.slug,
			outputId: "fwd-custom-out",
			state: "live",
		});
		const open = await sessionsFor(path.id);
		expect(
			open.map((row) => [row.destination, row.destinationRef, row.role]),
		).toEqual([
			["youtube", null, "landscape"],
			["youtube", String(portrait?.id), "portrait"],
			["custom", "fwd-custom-out", "landscape"],
		]);

		// The not-ready teardown closes every forwarder on the path.
		await stopDirectForPaths([path.id]);
		const closed = await sessionsFor(path.id);
		expect(closed).toHaveLength(3);
		expect(closed.every((row) => row.endedAt !== null)).toBe(true);
	});

	test("reconciler opens missed starts and closes rows orphaned by a restart", async () => {
		const { path, relayId } = await seedPath();
		// A crash left these open while the forwarders were already gone.
		await db.insert(forwarderSession).values([
			{ pathId: path.id, relayId, destination: "twitch" },
			{
				pathId: path.id,
				relayId,
				destination: "custom",
				destinationRef: "deleted-output",
			},
		]);
		// And a state write nobody synced (e.g. before this code shipped).
		await db
			.insert(pathState)
			.values({ pathId: path.id, directKickState: "retrying" });

		await reconcileForwarderSessions();
		const rows = await sessionsFor(path.id);
		expect(rows.map((row) => [row.destination, row.endedAt === null])).toEqual([
			["twitch", false],
			["custom", false],
			["kick", true],
		]);

		// Revoking the device ends its sessions even if state was never reset.
		await db
			.update(relayPath)
			.set({ revokedAt: new Date() })
			.where(eq(relayPath.id, path.id));
		await reconcileForwarderSessions();
		expect(
			(await sessionsFor(path.id)).every((row) => row.endedAt !== null),
		).toBe(true);
	});
});
