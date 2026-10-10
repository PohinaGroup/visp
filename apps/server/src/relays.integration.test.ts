import "./test-env";
import { createPath, ensureRelayUser } from "@VISP/api/relay";
import { chooseRelay, ensureDefaultRelay } from "@VISP/api/relays";
import { db } from "@VISP/db";
import {
	account,
	appUser,
	pathState,
	relay,
	relayPath,
	user,
} from "@VISP/db/schema/index";
import {
	afterAll,
	beforeAll,
	beforeEach,
	test as bunTest,
	describe,
	expect,
} from "bun:test";
import { eq, inArray, like, ne } from "drizzle-orm";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const test = bunTest.serial;

const PREFIX = "regions-test-";
type RelayRow = typeof relay.$inferSelect;

integration("regional relay assignment", () => {
	let defaultRelay: RelayRow;
	let originalDefaultRegion = "default";
	let fi2: RelayRow;
	let usEast: RelayRow;
	let usEast2: RelayRow;
	let singapore: RelayRow;

	async function addRelay(name: string, region: string, capacityPaths = 10) {
		const [row] = await db
			.insert(relay)
			.values({
				name: `${PREFIX}${name}`,
				host: `${name}.regions.test`,
				apiUrl: `http://${name}.regions.test:9997`,
				pingUrl: `https://${name}.regions.test/ping`,
				region,
				capacityPaths,
				maxForwarders: 2,
				publicIp: "192.0.2.50",
			})
			.onConflictDoUpdate({
				target: relay.name,
				set: { region, capacityPaths, enabled: true, drainedAt: null },
			})
			.returning();
		if (!row) throw new Error(`missing relay ${name}`);
		return row;
	}

	async function addUser(id: string) {
		await db.insert(user).values({
			id,
			name: id,
			email: `${id}@regions.test`,
		});
		await db.insert(appUser).values({ id, handle: id });
	}

	async function fill(target: RelayRow, count: number) {
		for (let index = 0; index < count; index += 1) {
			const id = `${PREFIX}filler-${target.id}-${index}`;
			await addUser(id);
			await db.insert(relayPath).values({
				relayId: target.id,
				userId: id,
				seq: 1,
				slug: `${id}-1`,
				label: "main",
			});
		}
	}

	beforeAll(async () => {
		await ensureDefaultRelay();
		const found = await db.query.relay.findFirst({
			where: eq(relay.name, "default"),
		});
		if (!found) throw new Error("default relay missing");
		originalDefaultRegion = found.region;
	});

	beforeEach(async () => {
		// Same reset as the machine suite: users (and their paths) go away,
		// relays persist.
		await db.delete(user);
		await ensureDefaultRelay();
		// Only this suite's relays and the default relay are candidates.
		await db
			.update(relay)
			.set({ enabled: false })
			.where(ne(relay.name, "default"));
		const [updated] = await db
			.update(relay)
			.set({
				region: "Finland",
				enabled: true,
				drainedAt: null,
				capacityPaths: 1_000,
			})
			.where(eq(relay.name, "default"))
			.returning();
		if (!updated) throw new Error("default relay missing");
		defaultRelay = updated;
		fi2 = await addRelay("fi-2", "finland");
		usEast = await addRelay("us-east", "us-east");
		usEast2 = await addRelay("us-east-2", "US-East");
		singapore = await addRelay("sg", "Singapore");
	});

	afterAll(async () => {
		await db.delete(user);
		await db
			.update(relay)
			.set({ enabled: false })
			.where(like(relay.name, `${PREFIX}%`));
		await db
			.update(relay)
			.set({ region: originalDefaultRegion })
			.where(eq(relay.name, "default"));
	});

	test("without a preference a new user stays in the default region, not the emptiest relay", async () => {
		// The default relay is busier than every far-away relay.
		await fill(defaultRelay, 3);
		await fill(fi2, 1);
		const picked = await chooseRelay(`${PREFIX}new`);
		// Least loaded *within* Finland (case-insensitive region match).
		expect(picked?.id).toBe(fi2.id);
		expect([usEast.id, usEast2.id, singapore.id]).not.toContain(picked?.id);
	});

	test("preferred beats owned, owned beats region, region beats load", async () => {
		await addUser(`${PREFIX}owner`);
		await db.insert(relayPath).values({
			relayId: singapore.id,
			userId: `${PREFIX}owner`,
			seq: 1,
			slug: `${PREFIX}owner-1`,
			label: "main",
		});
		expect((await chooseRelay(`${PREFIX}owner`, usEast.id))?.id).toBe(
			usEast.id,
		);
		expect((await chooseRelay(`${PREFIX}owner`))?.id).toBe(singapore.id);
		expect((await chooseRelay(`${PREFIX}new`, usEast.id))?.id).toBe(usEast.id);
	});

	test("a full, drained or disabled preferred relay falls back within its region", async () => {
		await db
			.update(relay)
			.set({ drainedAt: new Date() })
			.where(eq(relay.id, usEast.id));
		expect((await chooseRelay(`${PREFIX}new`, usEast.id))?.id).toBe(usEast2.id);
		await db
			.update(relay)
			.set({ drainedAt: null, enabled: false })
			.where(eq(relay.id, usEast.id));
		expect((await chooseRelay(`${PREFIX}new`, usEast.id))?.id).toBe(usEast2.id);
		await db
			.update(relay)
			.set({ enabled: true, capacityPaths: 1 })
			.where(inArray(relay.id, [usEast.id, usEast2.id]));
		await fill(usEast, 1);
		await fill(usEast2, 1);
		// The whole US region is full: the default relay, not Singapore.
		expect((await chooseRelay(`${PREFIX}new`, usEast.id))?.id).toBe(
			defaultRelay.id,
		);
	});

	test("a full owned relay keeps the user in their region", async () => {
		await db
			.update(relay)
			.set({ capacityPaths: 1 })
			.where(eq(relay.id, usEast.id));
		await addUser(`${PREFIX}us-user`);
		await db.insert(relayPath).values({
			relayId: usEast.id,
			userId: `${PREFIX}us-user`,
			seq: 1,
			slug: `${PREFIX}us-user-1`,
			label: "main",
		});
		expect((await chooseRelay(`${PREFIX}us-user`))?.id).toBe(usEast2.id);
	});

	test("when the default region is full it falls back to the least-loaded relay anywhere", async () => {
		await db
			.update(relay)
			.set({ capacityPaths: 1 })
			.where(inArray(relay.id, [defaultRelay.id, fi2.id]));
		await fill(defaultRelay, 1);
		await fill(fi2, 1);
		await fill(usEast, 2);
		await fill(usEast2, 1);
		expect((await chooseRelay(`${PREFIX}new`))?.id).toBe(singapore.id);
		await db
			.update(relay)
			.set({ enabled: false })
			.where(inArray(relay.id, [usEast.id, usEast2.id, singapore.id]));
		expect(await chooseRelay(`${PREFIX}new`)).toBeNull();
	});

	test("an active Direct session still pins the user to its relay", async () => {
		await addUser(`${PREFIX}direct`);
		const [path] = await db
			.insert(relayPath)
			.values({
				relayId: singapore.id,
				userId: `${PREFIX}direct`,
				seq: 1,
				slug: `${PREFIX}direct-1`,
				label: "main",
			})
			.returning();
		if (!path) throw new Error("missing path");
		await db.insert(pathState).values({
			pathId: path.id,
			directTwitchReservedUntil: new Date(Date.now() + 60_000),
		});
		expect((await chooseRelay(`${PREFIX}direct`, usEast.id))?.id).toBe(
			singapore.id,
		);
	});

	test("account creation and new devices use the region default", async () => {
		await fill(defaultRelay, 2);
		await fill(fi2, 1);
		const id = `${PREFIX}signup`;
		await db.insert(user).values({
			id,
			name: "Signup",
			email: `${id}@regions.test`,
		});
		await db.insert(account).values({
			id: `${id}-twitch`,
			accountId: `${id}-twitch`,
			providerId: "twitch",
			userId: id,
		});
		await ensureRelayUser(id, "Regions Signup");
		const [first] = await db
			.select()
			.from(relayPath)
			.where(eq(relayPath.userId, id));
		expect(first?.relayId).toBe(fi2.id);
		const second = await createPath(id, "camera", singapore.id);
		expect(second.relayId).toBe(singapore.id);
		const third = await createPath(id, "camera 2");
		// Owned relays win over the region default once the user has paths.
		expect([fi2.id, singapore.id]).toContain(third.relayId);
	});
});
