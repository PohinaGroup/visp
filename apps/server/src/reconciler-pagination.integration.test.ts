import "./test-env";

import { hashSecret } from "@VISP/api/password";
import { applyPathHook, reconcilePathState } from "@VISP/api/relay";
import { ensureDefaultRelay } from "@VISP/api/relays";
import { db } from "@VISP/db";
import {
	appUser,
	pathState,
	relay,
	relayPath,
	relayStreamSession,
	user,
} from "@VISP/db/schema/index";
import {
	afterEach,
	beforeEach,
	test as bunTest,
	describe,
	expect,
} from "bun:test";
import { eq, inArray } from "drizzle-orm";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const test = bunTest.serial;
const originalFetch = globalThis.fetch;

async function seed() {
	await db
		.insert(user)
		.values([{ id: "user-a", name: "Alpha", email: "alpha@example.test" }]);
	await db.insert(appUser).values([
		{
			id: "user-a",
			handle: "alpha",
			publishSecretHash: await hashSecret("publish-a"),
			readSecretHash: await hashSecret("read-a"),
		},
	]);
	const defaultRelay = await db.query.relay.findFirst({
		where: eq(relay.name, "default"),
	});
	if (!defaultRelay) throw new Error("default test relay was not created");
	const paths = await db
		.insert(relayPath)
		.values(
			["alpha-1", "alpha-2"].map((slug, index) => ({
				relayId: defaultRelay.id,
				userId: "user-a",
				seq: index + 1,
				slug,
				label: slug,
			})),
		)
		.returning();
	for (const path of paths) {
		await applyPathHook("ready", { path: path.slug, sourceType: "srtConn" });
	}
	return paths.map((path) => path.id);
}

async function snapshot(pathIds: number[]) {
	const states = await db
		.select({
			pathId: pathState.pathId,
			publishing: pathState.publishing,
			lastEventAt: pathState.lastEventAt,
		})
		.from(pathState)
		.where(inArray(pathState.pathId, pathIds))
		.orderBy(pathState.pathId);
	const openSessions = await db.query.relayStreamSession.findMany({
		where: inArray(relayStreamSession.pathId, pathIds),
	});
	return {
		states,
		open: openSessions.filter((session) => !session.endedAt).length,
	};
}

/** A relay whose list spans two pages; `second` overrides page 1's response. */
function twoPages(second?: () => Response) {
	const item = (name: string) => ({
		name,
		ready: true,
		readers: [],
		source: { type: "srtConn" },
	});
	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = new URL(String(input));
		if (!url.pathname.endsWith("/v3/paths/list")) {
			return new Response("unexpected", { status: 500 });
		}
		if (url.searchParams.get("page") === "1") {
			if (second) return second();
			return Response.json({
				pageCount: 2,
				itemCount: 2,
				items: [item("alpha-2")],
			});
		}
		return Response.json({
			pageCount: 2,
			itemCount: 2,
			items: [item("alpha-1")],
		});
	}) as typeof fetch;
}

integration("reconciler pagination", () => {
	beforeEach(async () => {
		await db.delete(user);
		await ensureDefaultRelay();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("a path on the second page stays live", async () => {
		const pathIds = await seed();
		twoPages();
		await reconcilePathState("http://relay.test:9997");
		const after = await snapshot(pathIds);
		expect(after.states.map((state) => state.publishing)).toEqual([true, true]);
		expect(after.open).toBe(2);
	});

	test("a failed or short page makes no writes", async () => {
		const pathIds = await seed();
		const before = await snapshot(pathIds);
		for (const second of [
			() => new Response("down", { status: 503 }),
			() => Response.json({ error: "bad" }),
			() => Response.json({ pageCount: 2, itemCount: 3, items: [] }),
		]) {
			twoPages(second);
			await reconcilePathState("http://relay.test:9997");
			expect(await snapshot(pathIds)).toEqual(before);
		}
	});

	test("a complete read still stops a path that is gone", async () => {
		const [first, second] = await seed();
		if (!first || !second) throw new Error("paths were not seeded");
		globalThis.fetch = (async () =>
			Response.json({
				pageCount: 1,
				itemCount: 1,
				items: [{ name: "alpha-1", ready: true, readers: [] }],
			})) as unknown as typeof fetch;
		await reconcilePathState("http://relay.test:9997");
		const after = await snapshot([first, second]);
		expect(after.states.map((state) => state.publishing)).toEqual([
			true,
			false,
		]);
		expect(after.open).toBe(1);
	});
});
