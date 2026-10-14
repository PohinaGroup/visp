import "./test-env";
import { db } from "@VISP/db";
import { appUser, obsBackup, user } from "@VISP/db/schema/index";
import type { ObjectStore } from "@VISP/object-store";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
	completeObsBackup,
	createObsBackup,
	listObsBackups,
	OBS_BACKUP_ACCOUNT_MAX_BYTES,
	OBS_BACKUP_MAX_PENDING,
	OBS_BACKUP_MAX_UPLOAD_URLS,
	OBS_BACKUP_PENDING_TTL_MS,
	OBS_BACKUP_RETENTION,
	OBS_BACKUP_SETTLE_RETRY_MS,
	ObsBackupError,
	obsBackupKey,
	obsBackupPrefix,
	prepareObsBackupUpload,
	reconcileDueObsBackups,
	reconcileSealedObsBackup,
	resetObsBackupSettleAttemptsForTests,
	settlePendingObsBackups,
} from "./obs-backup";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

type Store = Pick<ObjectStore, "read" | "stat" | "list" | "delete">;

/** In-memory object storage that counts the calls each backup operation makes. */
function memoryStore() {
	const objects = new Map<string, Uint8Array>();
	const calls = { read: 0, stat: 0, list: 0, delete: 0 };
	let failListing = false;
	const store: Store = {
		async read(key, maxBytes) {
			calls.read += 1;
			const object = objects.get(key);
			if (!object) throw new Error("S3 read failed: 404");
			if (object.length > maxBytes)
				throw new Error("Object exceeds maximum size");
			return object;
		},
		async stat(key) {
			calls.stat += 1;
			const object = objects.get(key);
			if (!object) throw new Error("S3 head failed: 404");
			return {
				byteSize: object.length,
				contentType: null,
				lastModified: new Date(),
			};
		},
		async list(prefix) {
			calls.list += 1;
			if (failListing) throw new Error("S3 list failed: 403");
			return [...objects.keys()].filter((key) => key.startsWith(prefix));
		},
		async delete(key) {
			calls.delete += 1;
			objects.delete(key);
		},
	};
	return {
		objects,
		calls,
		store,
		failListing(value: boolean) {
			failListing = value;
		},
	};
}

const scene = new TextEncoder().encode('{"sources":[]}');

function writeLegacyBackup(
	objects: Map<string, Uint8Array>,
	userId: string,
	backupId: string,
	{ uploadScene = true } = {},
) {
	if (uploadScene)
		objects.set(obsBackupKey(userId, backupId, "scenes/Main.json"), scene);
	objects.set(
		obsBackupKey(userId, backupId, "manifest.json"),
		new TextEncoder().encode(
			JSON.stringify({
				version: 1,
				createdAt: "2026-10-10T10:00:00Z",
				files: [
					{
						path: "scenes/Main.json",
						originalPath: "/obs/Main.json",
						byteSize: scene.length,
					},
				],
			}),
		),
	);
}

integration("OBS backups (PostgreSQL)", () => {
	const userId = `obs-backup-${randomUUID().slice(0, 8)}`;

	beforeAll(async () => {
		await db
			.insert(user)
			.values({ id: userId, name: "Backup", email: `${userId}@example.test` });
		await db.insert(appUser).values({ id: userId, handle: userId });
	});

	beforeEach(() => resetObsBackupSettleAttemptsForTests());

	afterEach(async () => {
		await db.delete(obsBackup).where(eq(obsBackup.userId, userId));
	});

	afterAll(async () => {
		await db.delete(user).where(eq(user.id, userId));
	});

	test("parallel creates cannot open more than the pending limit", async () => {
		const { store } = memoryStore();
		const results = await Promise.allSettled(
			Array.from({ length: OBS_BACKUP_MAX_PENDING * 3 }, () =>
				createObsBackup(userId, { os: "windows" }, store),
			),
		);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(OBS_BACKUP_MAX_PENDING);
		for (const result of results) {
			if (result.status === "rejected") {
				expect(result.reason).toBeInstanceOf(ObsBackupError);
				expect((result.reason as ObsBackupError).status).toBe(429);
			}
		}
		expect(
			await db.$count(
				obsBackup,
				and(eq(obsBackup.userId, userId), isNull(obsBackup.completedAt)),
			),
		).toBe(OBS_BACKUP_MAX_PENDING);
	});

	test("listing seals legacy backups once per interval and one per request", async () => {
		const { objects, calls, store } = memoryStore();
		const legacy: string[] = [];
		for (let index = 0; index < OBS_BACKUP_MAX_PENDING; index += 1)
			legacy.push((await createObsBackup(userId, {}, store)).id);
		// The scene never arrives, so sealing keeps failing.
		for (const id of legacy)
			writeLegacyBackup(objects, userId, id, { uploadScene: false });
		resetObsBackupSettleAttemptsForTests();
		calls.read = 0;

		expect(await listObsBackups(userId, store)).toEqual([]);
		expect(calls.read).toBe(1);
		// Each request tries the next backup that has not been tried recently.
		await listObsBackups(userId, store);
		await listObsBackups(userId, store);
		expect(calls.read).toBe(OBS_BACKUP_MAX_PENDING);
		for (let index = 0; index < 5; index += 1)
			await listObsBackups(userId, store);
		expect(calls.read).toBe(OBS_BACKUP_MAX_PENDING);

		// After the retry interval a backup whose files landed is sealed.
		const [first] = legacy;
		if (!first) throw new Error("no legacy backup");
		objects.set(obsBackupKey(userId, first, "scenes/Main.json"), scene);
		await settlePendingObsBackups(
			userId,
			store,
			Date.now() + OBS_BACKUP_SETTLE_RETRY_MS,
		);
		const listed = await listObsBackups(userId, store);
		expect(listed.map((backup) => backup.id)).toEqual([first]);
	});

	test("listing never auto-seals backups from plugins that complete them", async () => {
		const { objects, calls, store } = memoryStore();
		const { id } = await createObsBackup(
			userId,
			{ os: "windows", obsVersion: "31.1.0" },
			store,
		);
		writeLegacyBackup(objects, userId, id);
		calls.read = 0;
		expect(await listObsBackups(userId, store)).toEqual([]);
		expect(calls.read).toBe(0);
		expect((await completeObsBackup(userId, id, store)).fileCount).toBe(1);
	});

	test("abandoned uploads expire on the next list", async () => {
		const { objects, store } = memoryStore();
		const id = randomUUID();
		await db.insert(obsBackup).values({
			id,
			userId,
			os: "windows",
			createdAt: new Date(Date.now() - OBS_BACKUP_PENDING_TTL_MS - 60_000),
		});
		objects.set(obsBackupKey(userId, id, "scenes/Main.json"), scene);
		await listObsBackups(userId, store);
		expect(
			await db.query.obsBackup.findFirst({ where: eq(obsBackup.id, id) }),
		).toBeUndefined();
		expect(objects.size).toBe(0);
	});

	test("a failed prune does not undo a completed backup", async () => {
		const { objects, store, failListing } = memoryStore();
		const completedAt = new Date(Date.now() - 60_000);
		await db.insert(obsBackup).values(
			Array.from({ length: OBS_BACKUP_RETENTION }, () => ({
				id: randomUUID(),
				userId,
				completedAt,
				fileCount: 1,
				totalBytes: scene.length,
			})),
		);
		const { id } = await createObsBackup(userId, { os: "linux" }, store);
		writeLegacyBackup(objects, userId, id);
		failListing(true);
		const original = console.error;
		console.error = () => {};
		try {
			const summary = await completeObsBackup(userId, id, store);
			expect(summary.completedAt).not.toBeNull();
		} finally {
			console.error = original;
		}
		const row = await db.query.obsBackup.findFirst({
			where: eq(obsBackup.id, id),
		});
		expect(row?.completedAt).not.toBeNull();
	});
	test("rejects a backup that would exceed the account quota and frees it", async () => {
		const { objects, store } = memoryStore();
		const completedAt = new Date(Date.now() - 60_000);
		// Sealed backups retention keeps already fill the quota.
		await db.insert(obsBackup).values(
			[0, 1].map(() => ({
				id: randomUUID(),
				userId,
				completedAt,
				fileCount: 1,
				totalBytes: OBS_BACKUP_ACCOUNT_MAX_BYTES / 2,
			})),
		);
		const { id } = await createObsBackup(userId, { os: "linux" }, store);
		writeLegacyBackup(objects, userId, id);
		const rejected = await completeObsBackup(userId, id, store).catch(
			(error) => error,
		);
		expect(rejected).toBeInstanceOf(ObsBackupError);
		expect((rejected as ObsBackupError).status).toBe(413);
		expect(
			await db.query.obsBackup.findFirst({ where: eq(obsBackup.id, id) }),
		).toBeUndefined();
		expect(
			[...objects.keys()].some((key) =>
				key.startsWith(obsBackupPrefix(userId, id)),
			),
		).toBe(false);
	});

	test("backups retention will prune do not count against the quota", async () => {
		const { objects, store } = memoryStore();
		const now = Date.now();
		await db.insert(obsBackup).values([
			{
				id: randomUUID(),
				userId,
				completedAt: new Date(now - 3_600_000),
				fileCount: 1,
				totalBytes: OBS_BACKUP_ACCOUNT_MAX_BYTES,
			},
			...Array.from({ length: OBS_BACKUP_RETENTION - 1 }, () => ({
				id: randomUUID(),
				userId,
				completedAt: new Date(now - 60_000),
				fileCount: 1,
				totalBytes: scene.length,
			})),
		]);
		const { id } = await createObsBackup(userId, { os: "linux" }, store);
		writeLegacyBackup(objects, userId, id);
		expect((await completeObsBackup(userId, id, store)).completedAt).not.toBe(
			null,
		);
	});

	test("parallel completions cannot both fit in the last of the quota", async () => {
		const { objects, store } = memoryStore();
		await db.insert(obsBackup).values({
			id: randomUUID(),
			userId,
			completedAt: new Date(Date.now() - 60_000),
			fileCount: 1,
			totalBytes: OBS_BACKUP_ACCOUNT_MAX_BYTES - scene.length - 1,
		});
		const ids: string[] = [];
		for (let index = 0; index < 2; index += 1) {
			const { id } = await createObsBackup(userId, { os: "linux" }, store);
			writeLegacyBackup(objects, userId, id);
			ids.push(id);
		}
		const results = await Promise.allSettled(
			ids.map((id) => completeObsBackup(userId, id, store)),
		);
		expect(
			results.filter((result) => result.status === "fulfilled"),
		).toHaveLength(1);
		const rejected = results.find((result) => result.status === "rejected");
		expect((rejected as PromiseRejectedResult).reason.status).toBe(413);
	});

	test("rejects manifests over the per-file or per-backup size caps", async () => {
		const { objects, store } = memoryStore();
		const { id } = await createObsBackup(userId, { os: "linux" }, store);
		const big = 3 * 1024 * 1024 * 1024;
		objects.set(
			obsBackupKey(userId, id, "manifest.json"),
			new TextEncoder().encode(
				JSON.stringify({
					version: 1,
					createdAt: "2026-10-10T10:00:00Z",
					files: [{ path: "media/000001", originalPath: "/a", byteSize: big }],
				}),
			),
		);
		objects.set(obsBackupKey(userId, id, "media/000001"), scene);
		const rejected = await completeObsBackup(userId, id, store).catch(
			(error) => error,
		);
		expect((rejected as ObsBackupError).status).toBe(413);
		expect(objects.size).toBe(0);
		expect(
			await db.query.obsBackup.findFirst({ where: eq(obsBackup.id, id) }),
		).toBeUndefined();
	});

	test("sealing deletes objects the manifest does not list", async () => {
		const { objects, store } = memoryStore();
		const { id } = await createObsBackup(userId, { os: "linux" }, store);
		writeLegacyBackup(objects, userId, id);
		const stray = obsBackupKey(userId, id, "media/stash.bin");
		objects.set(stray, new Uint8Array(64));
		const other = obsBackupKey(userId, "other-backup", "media/keep.bin");
		objects.set(other, new Uint8Array(1));
		await completeObsBackup(userId, id, store);
		expect(objects.has(stray)).toBe(false);
		expect(objects.has(other)).toBe(true);
		expect(objects.has(obsBackupKey(userId, id, "manifest.json"))).toBe(true);
		expect(objects.has(obsBackupKey(userId, id, "scenes/Main.json"))).toBe(
			true,
		);

		// Upload URLs outlive sealing; the delayed check drops later additions.
		objects.set(stray, new Uint8Array(64));
		await reconcileSealedObsBackup(userId, id, store);
		expect(objects.has(stray)).toBe(false);
		expect(
			await db.query.obsBackup.findFirst({ where: eq(obsBackup.id, id) }),
		).toBeDefined();

		// A listed file overwritten after sealing makes the backup unusable.
		objects.set(
			obsBackupKey(userId, id, "scenes/Main.json"),
			new Uint8Array(1024),
		);
		await reconcileSealedObsBackup(userId, id, store);
		expect(
			await db.query.obsBackup.findFirst({ where: eq(obsBackup.id, id) }),
		).toBeUndefined();
		expect(
			[...objects.keys()].some((key) =>
				key.startsWith(obsBackupPrefix(userId, id)),
			),
		).toBe(false);
	});

	test("the delayed check survives a restart: it runs from the row's due time", async () => {
		const { objects, store } = memoryStore();
		const { id } = await createObsBackup(userId, { os: "linux" }, store);
		writeLegacyBackup(objects, userId, id);
		await completeObsBackup(userId, id, store);
		const sealed = await db.query.obsBackup.findFirst({
			where: eq(obsBackup.id, id),
		});
		expect(sealed?.reconcileAfter?.getTime()).toBeGreaterThan(Date.now());
		// Not due yet: a listing leaves it alone.
		expect(await reconcileDueObsBackups(userId, store)).toBe(0);

		// Tampered inside the upload-URL window, then the process restarted.
		objects.set(
			obsBackupKey(userId, id, "scenes/Main.json"),
			new Uint8Array(1024),
		);
		const later = (sealed?.reconcileAfter?.getTime() ?? 0) + 1;
		expect(await reconcileDueObsBackups(userId, store, later)).toBe(1);
		expect(
			await db.query.obsBackup.findFirst({ where: eq(obsBackup.id, id) }),
		).toBeUndefined();
		expect(await reconcileDueObsBackups(userId, store, later)).toBe(0);
	});

	test("a replaced manifest after sealing removes the backup", async () => {
		const { objects, store } = memoryStore();
		const { id } = await createObsBackup(userId, { os: "linux" }, store);
		writeLegacyBackup(objects, userId, id);
		await completeObsBackup(userId, id, store);
		objects.set(
			obsBackupKey(userId, id, "manifest.json"),
			new TextEncoder().encode("not json"),
		);
		await reconcileSealedObsBackup(userId, id, store);
		expect(
			await db.query.obsBackup.findFirst({ where: eq(obsBackup.id, id) }),
		).toBeUndefined();
	});

	test("caps the upload URLs a backup can mint", async () => {
		const { objects, store } = memoryStore();
		const presign = {
			presign: async (key: string) => `https://s3.test/${key}`,
		};
		const { id } = await createObsBackup(userId, { os: "linux" }, store);
		await db
			.update(obsBackup)
			.set({ fileCount: OBS_BACKUP_MAX_UPLOAD_URLS - 1 })
			.where(eq(obsBackup.id, id));
		expect(
			await prepareObsBackupUpload(userId, id, "media/000001", presign),
		).toContain(obsBackupKey(userId, id, "media/000001"));
		const rejected = await prepareObsBackupUpload(
			userId,
			id,
			"media/000002",
			presign,
		).catch((error) => error);
		expect((rejected as ObsBackupError).status).toBe(429);

		// Far more URLs than the manifest lists cannot be sealed.
		writeLegacyBackup(objects, userId, id);
		const sealed = await completeObsBackup(userId, id, store).catch(
			(error) => error,
		);
		expect((sealed as ObsBackupError).status).toBe(413);
		expect(
			await db.query.obsBackup.findFirst({ where: eq(obsBackup.id, id) }),
		).toBeUndefined();
	});

	test("upload URLs count per backup and stop once sealed", async () => {
		const { objects, store } = memoryStore();
		const presign = {
			presign: async (key: string) => `https://s3.test/${key}`,
		};
		const { id } = await createObsBackup(userId, { os: "linux" }, store);
		await prepareObsBackupUpload(userId, id, "scenes/Main.json", presign);
		await prepareObsBackupUpload(userId, id, "manifest.json", presign);
		const pending = await db.query.obsBackup.findFirst({
			where: eq(obsBackup.id, id),
		});
		expect(pending?.fileCount).toBe(2);
		writeLegacyBackup(objects, userId, id);
		expect((await completeObsBackup(userId, id, store)).fileCount).toBe(1);
		const rejected = await prepareObsBackupUpload(
			userId,
			id,
			"media/000001",
			presign,
		).catch((error) => error);
		expect((rejected as ObsBackupError).status).toBe(409);
		const missing = await prepareObsBackupUpload(
			userId,
			randomUUID(),
			"media/000001",
			presign,
		).catch((error) => error);
		expect((missing as ObsBackupError).status).toBe(404);
	});
});
