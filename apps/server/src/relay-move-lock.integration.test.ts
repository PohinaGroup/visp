import "./test-env";
import { rotatePublishPath } from "@VISP/api/relay";
import { movePublishDevice } from "@VISP/api/relay-move";
import { chooseRelay, ensureDefaultRelay } from "@VISP/api/relays";
import { db } from "@VISP/db";
import { appUser, relay, relayPath, user } from "@VISP/db/schema/index";
import {
	afterAll,
	afterEach,
	beforeEach,
	test as bunTest,
	describe,
	expect,
} from "bun:test";
import { eq, like } from "drizzle-orm";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const test = bunTest.serial;

const PREFIX = "move-lock-test-";
const realFetch = globalThis.fetch;

// A MediaMTX stub whose responses wait until the test releases them.
function blockingFetch() {
	const urls: string[] = [];
	let release: () => void = () => {};
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	let called: () => void = () => {};
	const firstCall = new Promise<void>((resolve) => {
		called = resolve;
	});
	globalThis.fetch = (async (input: string | URL | Request) => {
		urls.push(String(input));
		called();
		await released;
		return new Response(null, { status: 404 });
	}) as unknown as typeof fetch;
	return { firstCall, release, urls };
}

function within<T>(promise: Promise<T>, ms: number) {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error(`still blocked after ${ms} ms`)), ms),
		),
	]);
}

integration("offline region move locking", () => {
	let source: typeof relay.$inferSelect;
	let target: typeof relay.$inferSelect;
	let pathId: number;
	const owner = `${PREFIX}owner`;

	beforeEach(async () => {
		await db.delete(user).where(like(user.id, `${PREFIX}%`));
		await ensureDefaultRelay();
		const rows = [];
		for (const name of ["source", "target"]) {
			const [row] = await db
				.insert(relay)
				.values({
					name: `${PREFIX}${name}`,
					host: `${name}.move-lock.test`,
					apiUrl: `http://${name}.move-lock.test:9997`,
					pingUrl: `https://${name}.move-lock.test/ping`,
					region: "move-lock",
					capacityPaths: 10,
					maxForwarders: 2,
					publicIp: "192.0.2.60",
				})
				.onConflictDoUpdate({
					target: relay.name,
					set: { enabled: true, drainedAt: null, capacityPaths: 10 },
				})
				.returning();
			if (!row) throw new Error(`missing relay ${name}`);
			rows.push(row);
		}
		[source, target] = rows as [typeof source, typeof target];
		await db
			.insert(user)
			.values({ id: owner, name: owner, email: `${owner}@move-lock.test` });
		await db.insert(appUser).values({ id: owner, handle: owner });
		const [path] = await db
			.insert(relayPath)
			.values({
				relayId: source.id,
				userId: owner,
				seq: 1,
				slug: `${owner}-1`,
				label: "main",
			})
			.returning();
		if (!path) throw new Error("missing path");
		pathId = path.id;
		await rotatePublishPath(owner, pathId);
	});

	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	afterAll(async () => {
		await db.delete(user).where(like(user.id, `${PREFIX}%`));
		await db
			.update(relay)
			.set({ enabled: false })
			.where(like(relay.name, `${PREFIX}%`));
	});

	test("relay assignment is not blocked while the old relay is queried", async () => {
		const stub = blockingFetch();
		const move = movePublishDevice(owner, pathId, target.id);
		await stub.firstCall;
		// chooseRelay takes the global assignment lock; it must not wait on the
		// MediaMTX request.
		expect(await within(chooseRelay(`${PREFIX}other`), 1_000)).not.toBeNull();
		stub.release();
		const moved = await move;
		expect(moved?.path.relay.id).toBe(target.id);
		expect(moved?.path.slug).not.toBe(`${owner}-1`);
		expect(stub.urls).toEqual([
			`${source.apiUrl}/v3/paths/get/${owner}-1`,
			`${source.apiUrl}/v3/paths/get/studio/${owner}-1`,
		]);
	});

	test("a publisher admitted during the relay check still blocks the move", async () => {
		const stub = blockingFetch();
		const move = movePublishDevice(owner, pathId, target.id);
		await stub.firstCall;
		// What authenticateMedia records for a newly admitted publisher.
		await db
			.update(relayPath)
			.set({ publishLastConnectedAt: new Date() })
			.where(eq(relayPath.id, pathId));
		stub.release();
		await expect(move).rejects.toThrow("Stop all");
		const [stored] = await db
			.select({ relayId: relayPath.relayId, slug: relayPath.slug })
			.from(relayPath)
			.where(eq(relayPath.id, pathId));
		expect(stored).toEqual({ relayId: source.id, slug: `${owner}-1` });
	});

	test("an address changed during the relay check is verified again", async () => {
		const stub = blockingFetch();
		const move = movePublishDevice(owner, pathId, target.id);
		await stub.firstCall;
		await db
			.update(relayPath)
			.set({ slug: `${owner}-renamed` })
			.where(eq(relayPath.id, pathId));
		stub.release();
		const moved = await move;
		expect(moved?.path.relay.id).toBe(target.id);
		expect(stub.urls).toContain(
			`${source.apiUrl}/v3/paths/get/${owner}-renamed`,
		);
		expect(stub.urls).toContain(
			`${source.apiUrl}/v3/paths/get/studio/${owner}-renamed`,
		);
	});
});
