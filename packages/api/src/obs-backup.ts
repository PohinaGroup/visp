import { db } from "@VISP/db";
import { obsBackup } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { createObjectStore, type ObjectStore } from "@VISP/object-store";
import { randomUUID } from "node:crypto";
import {
	and,
	count,
	desc,
	eq,
	isNotNull,
	isNull,
	lt,
	lte,
	sql,
} from "drizzle-orm";
import { z } from "zod";

const GIB = 1024 * 1024 * 1024;
/**
 * Largest file a new backup may hold. OBS backups are scene JSON, profile
 * ini files and linked local media (images, stingers, video loops), so 1 GiB
 * leaves room for long video loops while keeping storage bounded.
 */
export const OBS_BACKUP_FILE_MAX_BYTES = GIB;
/** Largest total a new backup may hold. */
export const OBS_BACKUP_MAX_BYTES = 2 * GIB;
/** Sealed backups an account keeps (after retention) may hold at most this. */
export const OBS_BACKUP_ACCOUNT_MAX_BYTES = 5 * GIB;
/** Backups sealed before the caps above could hold files up to 4 GiB. */
const STORED_FILE_MAX_BYTES = 4 * GIB;
/** Completed backups kept per account; older ones are pruned on completion. */
export const OBS_BACKUP_RETENTION = 10;
/** Unfinished backups an account may have open at once. */
export const OBS_BACKUP_MAX_PENDING = 3;
/** An unfinished backup older than this is abandoned and cleaned up. */
export const OBS_BACKUP_PENDING_TTL_MS = 24 * 60 * 60 * 1000;
export const OBS_BACKUP_MANIFEST_MAX_BYTES = 4 * 1024 * 1024;
export const OBS_BACKUP_MANIFEST_MAX_FILES = 10_000;
export const OBS_BACKUP_DOWNLOAD_BATCH = 100;
export const OBS_BACKUP_MANIFEST_PATH = "manifest.json";
/** Listing seals at most this many legacy backups per request. */
export const OBS_BACKUP_SETTLE_PER_REQUEST = 1;
/** A legacy backup that failed to seal is not retried sooner than this. */
export const OBS_BACKUP_SETTLE_RETRY_MS = 10 * 60 * 1000;
/** The plugin asks for each upload URL right before it starts that PUT. */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;
/**
 * Upload URLs a backup may mint beyond one per manifest file plus the manifest
 * itself. The plugin asks exactly once per file, so this is only headroom.
 */
const UPLOAD_URL_SLACK = 16;
export const OBS_BACKUP_MAX_UPLOAD_URLS =
	OBS_BACKUP_MANIFEST_MAX_FILES + 1 + UPLOAD_URL_SLACK;
/** Re-check a sealed backup once every upload URL it handed out has expired. */
const RECONCILE_DELAY_MS = (UPLOAD_URL_TTL_SECONDS + 60) * 1000;
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;
const STAT_CONCURRENCY = 8;
const SETTLE_ATTEMPTS_MAX = 10_000;

/** Server-side reads, listings and deletes. */
const storage = createObjectStore({
	accessKeyId: env.S3_ACCESS_KEY_ID,
	bucket: env.S3_BUCKET,
	endpoint: env.S3_ENDPOINT,
	region: env.S3_REGION,
	secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});

/** Presigned URLs the OBS plugin opens from the streamer's computer. */
const uploads = createObjectStore({
	accessKeyId: env.S3_ACCESS_KEY_ID,
	bucket: env.S3_BUCKET,
	endpoint: env.S3_UPLOAD_ENDPOINT ?? env.S3_ENDPOINT,
	region: env.S3_REGION,
	secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});

const restoreStore: Pick<ObjectStore, "read" | "presign"> = {
	read: (key, maxBytes) => storage.read(key, maxBytes),
	presign: (key, options) => uploads.presign(key, options),
};

/** Carries the HTTP status a machine route should answer with. */
export class ObsBackupError extends Error {
	constructor(
		readonly status: 400 | 404 | 409 | 413 | 422 | 429,
		message: string,
	) {
		super(message);
		this.name = "ObsBackupError";
	}
}

export function obsBackupPrefix(userId: string, backupId: string) {
	return `obs-backups/${userId}/${backupId}/`;
}

export function obsBackupUserPrefix(userId: string) {
	return `obs-backups/${userId}/`;
}

export function obsBackupKey(userId: string, backupId: string, path: string) {
	return `${obsBackupPrefix(userId, backupId)}${path}`;
}

/** Device names Windows resolves anywhere, even with an extension (CON.json). */
const WINDOWS_RESERVED_NAME =
	/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
/** Drive letters and streams (`:`), wildcards, pipes and quotes Windows rejects. */
const WINDOWS_RESERVED_CHARACTERS = '<>:"|?*';

function safePathCharacter(character: string) {
	const code = character.charCodeAt(0);
	return (
		code >= 0x20 &&
		code !== 0x7f &&
		character !== "\\" &&
		!WINDOWS_RESERVED_CHARACTERS.includes(character)
	);
}

function safePathSegment(part: string) {
	return (
		part.length > 0 &&
		part !== "." &&
		part !== ".." &&
		// Windows drops trailing dots and spaces, so "a." would land on "a".
		!part.endsWith(".") &&
		!part.endsWith(" ") &&
		!WINDOWS_RESERVED_NAME.test(part)
	);
}

/**
 * A relative path that stays inside the restore folder on every OS the plugin
 * runs on: no drive letters (`C:/...`), no absolute or parent segments, and
 * nothing Windows would reinterpret. Mirrored by valid_backup_path in the plugin.
 */
export function validObsBackupPath(path: string) {
	return (
		path.length > 0 &&
		path.length <= 512 &&
		[...path].every(safePathCharacter) &&
		path.split("/").every(safePathSegment)
	);
}

const optionalText = z.string().trim().min(1).max(256).optional();

const manifestFile = z.object({
	path: z
		.string()
		.refine(
			(path) => validObsBackupPath(path) && path !== OBS_BACKUP_MANIFEST_PATH,
		),
	originalPath: z.string().max(4096),
	byteSize: z.number().int().min(1).max(STORED_FILE_MAX_BYTES),
	sha256: z
		.string()
		.regex(/^[0-9a-f]{64}$/i)
		.transform((hash) => hash.toLowerCase())
		.optional(),
});

const manifestV1 = z.object({
	version: z.literal(1),
	createdAt: z.string().max(64),
	files: z.array(manifestFile).min(1).max(OBS_BACKUP_MANIFEST_MAX_FILES),
});

const manifestV2 = manifestV1.extend({
	version: z.literal(2),
	files: z
		.array(manifestFile.required({ sha256: true }))
		.min(1)
		.max(OBS_BACKUP_MANIFEST_MAX_FILES),
	os: optionalText,
	obsVersion: optionalText,
	sceneCollection: optionalText,
	profile: optionalText,
});

const manifestSchema = z
	.discriminatedUnion("version", [manifestV1, manifestV2])
	.refine(
		(manifest) =>
			new Set(manifest.files.map((file) => file.path)).size ===
			manifest.files.length,
		{ message: "Duplicate backup file path" },
	);

export type ObsBackupManifest = z.infer<typeof manifestSchema>;
export type ObsBackupManifestFile = ObsBackupManifest["files"][number];

/** Accepts both manifest versions the OBS plugin has ever written. */
export function parseObsBackupManifest(value: unknown): ObsBackupManifest {
	const parsed = manifestSchema.safeParse(value);
	if (!parsed.success)
		throw new ObsBackupError(422, "The backup manifest is invalid");
	return parsed.data;
}

/**
 * Sealing applies tighter limits than reading, so backups sealed before the
 * caps existed stay restorable.
 */
export function checkObsBackupManifestLimits(manifest: ObsBackupManifest) {
	const tooLarge = manifest.files.find(
		(file) => file.byteSize > OBS_BACKUP_FILE_MAX_BYTES,
	);
	if (tooLarge)
		throw new ObsBackupError(
			413,
			`${tooLarge.path} is larger than the 1 GB per-file backup limit`,
		);
	if (obsBackupManifestBytes(manifest) > OBS_BACKUP_MAX_BYTES)
		throw new ObsBackupError(
			413,
			"Backups must be 2 GB or smaller. Remove large media from your scenes and try again.",
		);
}

function obsBackupManifestBytes(manifest: ObsBackupManifest) {
	return manifest.files.reduce((sum, file) => sum + file.byteSize, 0);
}

export type ObsBackupSummary = {
	id: string;
	createdAt: string;
	completedAt: string | null;
	fileCount: number;
	totalBytes: number;
	label: string | null;
	os: string | null;
	obsVersion: string | null;
};

function summarize(row: typeof obsBackup.$inferSelect): ObsBackupSummary {
	return {
		id: row.id,
		createdAt: row.createdAt.toISOString(),
		completedAt: row.completedAt?.toISOString() ?? null,
		fileCount: row.fileCount,
		totalBytes: row.totalBytes,
		label: row.label,
		os: row.os,
		obsVersion: row.obsVersion,
	};
}

async function ownedBackup(userId: string, backupId: string) {
	const row = await db.query.obsBackup.findFirst({
		where: and(eq(obsBackup.id, backupId), eq(obsBackup.userId, userId)),
	});
	if (!row) throw new ObsBackupError(404, "Backup not found");
	return row;
}

async function completedBackup(userId: string, backupId: string) {
	const row = await ownedBackup(userId, backupId);
	if (!row.completedAt) throw new ObsBackupError(409, "Backup is not complete");
	return row;
}

async function deleteObjectsUnder(
	prefix: string,
	client: Pick<ObjectStore, "list" | "delete">,
) {
	const keys = await client.list(prefix);
	for (let index = 0; index < keys.length; index += STAT_CONCURRENCY) {
		await Promise.all(
			keys
				.slice(index, index + STAT_CONCURRENCY)
				.map((key) => client.delete(key)),
		);
	}
}

/** Objects first: a failed delete leaves the row so the user can retry. */
async function removeBackup(
	userId: string,
	backupId: string,
	client: Pick<ObjectStore, "list" | "delete">,
) {
	await deleteObjectsUnder(obsBackupPrefix(userId, backupId), client);
	await db
		.delete(obsBackup)
		.where(and(eq(obsBackup.id, backupId), eq(obsBackup.userId, userId)));
	settleAttempts.delete(backupId);
}

/** Unfinished backups past OBS_BACKUP_PENDING_TTL_MS are abandoned uploads. */
async function removeAbandonedObsBackups(
	userId: string,
	client: Pick<ObjectStore, "list" | "delete">,
) {
	const abandoned = await db.query.obsBackup.findMany({
		columns: { id: true },
		where: and(
			eq(obsBackup.userId, userId),
			isNull(obsBackup.completedAt),
			lt(obsBackup.createdAt, new Date(Date.now() - OBS_BACKUP_PENDING_TTL_MS)),
		),
	});
	for (const { id } of abandoned) await removeBackup(userId, id, client);
}

export async function createObsBackup(
	userId: string,
	input: { label?: string; os?: string; obsVersion?: string } = {},
	client: Pick<ObjectStore, "read" | "stat" | "list" | "delete"> = storage,
) {
	await removeAbandonedObsBackups(userId, client);
	await settlePendingObsBackups(userId, client);
	await reconcileDueObsBackups(userId, client);
	// Count and insert under one per-account lock so parallel creates cannot
	// both see room for one more pending backup.
	const row = await db.transaction(async (tx) => {
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtext(${`obs-backup:${userId}`}))`,
		);
		const [pending] = await tx
			.select({ value: count() })
			.from(obsBackup)
			.where(and(eq(obsBackup.userId, userId), isNull(obsBackup.completedAt)));
		if ((pending?.value ?? 0) >= OBS_BACKUP_MAX_PENDING)
			throw new ObsBackupError(
				429,
				"Another backup is still uploading. Try again later.",
			);
		const [inserted] = await tx
			.insert(obsBackup)
			.values({
				id: randomUUID(),
				userId,
				label: input.label?.trim().slice(0, 256) || null,
				os: input.os?.trim().slice(0, 256) || null,
				obsVersion: input.obsVersion?.trim().slice(0, 256) || null,
			})
			.returning();
		return inserted;
	});
	if (!row) throw new Error("Backup was not created");
	return { id: row.id };
}

export async function getObsBackupUploadUrl(
	userId: string,
	backupId: string,
	path: string,
	client: Pick<ObjectStore, "presign"> = uploads,
) {
	if (!validObsBackupPath(path)) throw new Error("Invalid backup file path");
	return client.presign(obsBackupKey(userId, backupId, path), {
		expiresIn: UPLOAD_URL_TTL_SECONDS,
		method: "PUT",
	});
}

/** Only the owner may add files, and only until the backup is sealed. */
export async function prepareObsBackupUpload(
	userId: string,
	backupId: string,
	path: string,
	client: Pick<ObjectStore, "presign"> = uploads,
) {
	if (!validObsBackupPath(path))
		throw new ObsBackupError(400, "Invalid backup file path");
	// A pending backup's fileCount counts the upload URLs handed out; sealing
	// overwrites it with the manifest's file count.
	const [counted] = await db
		.update(obsBackup)
		.set({ fileCount: sql`${obsBackup.fileCount} + 1` })
		.where(
			and(
				eq(obsBackup.id, backupId),
				eq(obsBackup.userId, userId),
				isNull(obsBackup.completedAt),
				lt(obsBackup.fileCount, OBS_BACKUP_MAX_UPLOAD_URLS),
			),
		)
		.returning({ id: obsBackup.id });
	if (!counted) {
		const row = await ownedBackup(userId, backupId);
		if (row.completedAt)
			throw new ObsBackupError(409, "Backup is already complete");
		throw new ObsBackupError(429, "This backup has too many files");
	}
	return getObsBackupUploadUrl(userId, backupId, path, client);
}

async function readManifest(
	userId: string,
	backupId: string,
	client: Pick<ObjectStore, "read">,
) {
	let bytes: Uint8Array;
	try {
		bytes = await client.read(
			obsBackupKey(userId, backupId, OBS_BACKUP_MANIFEST_PATH),
			OBS_BACKUP_MANIFEST_MAX_BYTES,
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "Object exceeds maximum size"
		)
			throw new ObsBackupError(413, "The backup manifest is too large");
		throw new ObsBackupError(422, "The backup manifest is missing");
	}
	let json: unknown;
	try {
		json = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new ObsBackupError(422, "The backup manifest is invalid");
	}
	return parseObsBackupManifest(json);
}

/**
 * Deletes every object under the backup's prefix that its manifest does not
 * list. Returns false when a listed file no longer has its declared size,
 * which only happens if a still-valid upload URL overwrote it after sealing.
 */
async function reconcileObsBackupObjects(
	userId: string,
	backupId: string,
	manifest: ObsBackupManifest,
	client: Pick<ObjectStore, "stat" | "list" | "delete">,
	{ checkSizes }: { checkSizes: boolean },
) {
	const prefix = obsBackupPrefix(userId, backupId);
	const sizes = new Map(
		manifest.files.map((file) => [`${prefix}${file.path}`, file.byteSize]),
	);
	const manifestKey = obsBackupKey(userId, backupId, OBS_BACKUP_MANIFEST_PATH);
	const keys = await client.list(prefix);
	const unlisted = keys.filter((key) => key !== manifestKey && !sizes.has(key));
	for (let index = 0; index < unlisted.length; index += STAT_CONCURRENCY) {
		await Promise.all(
			unlisted
				.slice(index, index + STAT_CONCURRENCY)
				.map((key) => client.delete(key)),
		);
	}
	if (!checkSizes) return true;
	const listed = [...sizes];
	let intact = true;
	for (let index = 0; index < listed.length; index += STAT_CONCURRENCY) {
		await Promise.all(
			listed
				.slice(index, index + STAT_CONCURRENCY)
				.map(async ([key, byteSize]) => {
					// A failed stat is not proof of tampering; only a wrong size is.
					const stat = await client.stat(key).catch(() => null);
					if (stat && stat.byteSize !== byteSize) intact = false;
				}),
		);
	}
	return intact;
}

/**
 * Upload URLs stay valid for UPLOAD_URL_TTL_SECONDS after sealing, so check
 * again once they have all expired: drop objects added since, and remove the
 * backup if its manifest or a listed file was overwritten (restore would
 * reject it anyway). A storage error only skips the check.
 */
export async function reconcileSealedObsBackup(
	userId: string,
	backupId: string,
	client: Pick<ObjectStore, "read" | "stat" | "list" | "delete"> = storage,
) {
	const row = await db.query.obsBackup.findFirst({
		where: and(eq(obsBackup.id, backupId), eq(obsBackup.userId, userId)),
	});
	if (!row?.completedAt) return;
	let manifest: ObsBackupManifest;
	try {
		manifest = await readManifest(userId, backupId, client);
	} catch (error) {
		const tampered =
			error instanceof ObsBackupError &&
			(error.status === 413 ||
				error.message === "The backup manifest is invalid");
		if (tampered) await removeBackup(userId, backupId, client);
		return;
	}
	const intact =
		manifest.files.length === row.fileCount &&
		obsBackupManifestBytes(manifest) === row.totalBytes &&
		(await reconcileObsBackupObjects(userId, backupId, manifest, client, {
			checkSizes: true,
		}));
	if (!intact) await removeBackup(userId, backupId, client);
}

/**
 * Runs the delayed check for every sealed backup whose time has come. The
 * due time lives on the row, so a restart between sealing and the check only
 * postpones it to this account's next listing or backup. Claiming the row
 * first keeps two instances from checking the same backup.
 */
export async function reconcileDueObsBackups(
	userId: string,
	client: Pick<ObjectStore, "read" | "stat" | "list" | "delete"> = storage,
	now = Date.now(),
) {
	const due = await db
		.update(obsBackup)
		.set({ reconcileAfter: null })
		.where(
			and(
				eq(obsBackup.userId, userId),
				isNotNull(obsBackup.completedAt),
				lte(obsBackup.reconcileAfter, new Date(now)),
			),
		)
		.returning({ id: obsBackup.id });
	for (const { id } of due) {
		await reconcileSealedObsBackup(userId, id, client).catch((error) => {
			console.error("Failed to reconcile OBS backup objects", error);
		});
	}
	return due.length;
}

/** Best effort: runs the due check promptly when this process is still up. */
function scheduleReconcile(
	userId: string,
	client: Pick<ObjectStore, "read" | "stat" | "list" | "delete">,
) {
	const timer = setTimeout(() => {
		reconcileDueObsBackups(userId, client).catch((error) => {
			console.error("Failed to reconcile OBS backup objects", error);
		});
	}, RECONCILE_DELAY_MS + 1_000);
	timer.unref?.();
}

/** Sum of the sealed backups retention keeps once one more is sealed. */
async function retainedBytes(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	userId: string,
) {
	const rows = await tx
		.select({ totalBytes: obsBackup.totalBytes })
		.from(obsBackup)
		.where(and(eq(obsBackup.userId, userId), isNotNull(obsBackup.completedAt)))
		.orderBy(desc(obsBackup.completedAt), desc(obsBackup.createdAt))
		.limit(OBS_BACKUP_RETENTION - 1);
	return rows.reduce((sum, row) => sum + row.totalBytes, 0);
}

/**
 * Seals a backup once the plugin has uploaded the manifest: every listed file
 * must exist at its declared size, so a listed backup is always restorable.
 * Sealing also enforces the per-file, per-backup and per-account size caps
 * and deletes anything uploaded under the backup that the manifest omits.
 */
export async function completeObsBackup(
	userId: string,
	backupId: string,
	client: Pick<ObjectStore, "read" | "stat" | "list" | "delete"> = storage,
): Promise<ObsBackupSummary> {
	const row = await ownedBackup(userId, backupId);
	if (row.completedAt) return summarize(row);
	const manifest = await readManifest(userId, backupId, client);
	try {
		checkObsBackupManifestLimits(manifest);
		if (row.fileCount > manifest.files.length + 1 + UPLOAD_URL_SLACK)
			throw new ObsBackupError(
				413,
				"This backup requested more uploads than its manifest lists",
			);
	} catch (error) {
		// It can never be sealed, so free its storage now rather than in a day.
		await removeBackup(userId, backupId, client).catch(() => {});
		throw error;
	}
	for (
		let index = 0;
		index < manifest.files.length;
		index += STAT_CONCURRENCY
	) {
		await Promise.all(
			manifest.files
				.slice(index, index + STAT_CONCURRENCY)
				.map(async (file) => {
					const stat = await client
						.stat(obsBackupKey(userId, backupId, file.path))
						.catch(() => null);
					if (!stat || stat.byteSize !== file.byteSize)
						throw new ObsBackupError(
							422,
							`Backup file ${file.path} is missing or incomplete`,
						);
				}),
		);
	}
	const v2 = manifest.version === 2 ? manifest : null;
	const totalBytes = obsBackupManifestBytes(manifest);
	// Check the quota and seal under the per-account lock so two completions
	// cannot each see room for themselves.
	const sealed = await db
		.transaction(async (tx) => {
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtext(${`obs-backup:${userId}`}))`,
			);
			const [current] = await tx
				.select()
				.from(obsBackup)
				.where(and(eq(obsBackup.id, backupId), eq(obsBackup.userId, userId)));
			if (!current) throw new ObsBackupError(404, "Backup not found");
			if (current.completedAt) return { row: current, sealedNow: false };
			if (
				(await retainedBytes(tx, userId)) + totalBytes >
				OBS_BACKUP_ACCOUNT_MAX_BYTES
			)
				throw new ObsBackupError(
					413,
					"This backup would put your VISP backups over the 5 GB storage limit. Delete older backups and try again.",
				);
			const [completed] = await tx
				.update(obsBackup)
				.set({
					completedAt: new Date(),
					reconcileAfter: new Date(Date.now() + RECONCILE_DELAY_MS),
					fileCount: manifest.files.length,
					totalBytes,
					label: row.label ?? v2?.sceneCollection ?? null,
					os: row.os ?? v2?.os ?? null,
					obsVersion: row.obsVersion ?? v2?.obsVersion ?? null,
				})
				.where(and(eq(obsBackup.id, backupId), eq(obsBackup.userId, userId)))
				.returning();
			if (!completed) throw new ObsBackupError(404, "Backup not found");
			return { row: completed, sealedNow: true };
		})
		.catch(async (error) => {
			// Over quota: the plugin starts a fresh backup after the user frees
			// space, so this one's objects only cost storage.
			if (error instanceof ObsBackupError && error.status === 413)
				await removeBackup(userId, backupId, client).catch(() => {});
			throw error;
		});
	if (!sealed.sealedNow) return summarize(sealed.row);
	settleAttempts.delete(backupId);
	// The backup is sealed either way; a storage hiccup here only delays
	// cleanup until the delayed reconcile or the next completion.
	await reconcileObsBackupObjects(userId, backupId, manifest, client, {
		checkSizes: false,
	}).catch((error) => {
		console.error("Failed to remove unlisted OBS backup objects", error);
	});
	scheduleReconcile(userId, client);
	await pruneObsBackups(userId, client).catch((error) => {
		console.error("Failed to prune old OBS backups", error);
	});
	return summarize(sealed.row);
}

/** Keeps the newest OBS_BACKUP_RETENTION completed backups. */
export async function pruneObsBackups(
	userId: string,
	client: Pick<ObjectStore, "list" | "delete"> = storage,
	keep = OBS_BACKUP_RETENTION,
) {
	const stale = await db.query.obsBackup.findMany({
		columns: { id: true },
		where: and(eq(obsBackup.userId, userId), isNotNull(obsBackup.completedAt)),
		orderBy: [desc(obsBackup.completedAt), desc(obsBackup.createdAt)],
		offset: keep,
	});
	for (const { id } of stale) await removeBackup(userId, id, client);
	return stale.length;
}

/** Backup id -> when listing last tried to seal it (per process). */
const settleAttempts = new Map<string, number>();

function rememberSettleAttempt(backupId: string, now: number) {
	if (settleAttempts.size >= SETTLE_ATTEMPTS_MAX) {
		for (const [id, at] of settleAttempts) {
			if (now - at >= OBS_BACKUP_SETTLE_RETRY_MS) settleAttempts.delete(id);
		}
		if (settleAttempts.size >= SETTLE_ATTEMPTS_MAX) {
			const oldest = settleAttempts.keys().next().value;
			if (oldest) settleAttempts.delete(oldest);
		}
	}
	settleAttempts.set(backupId, now);
}

export function resetObsBackupSettleAttemptsForTests() {
	settleAttempts.clear();
}

/**
 * Plugins released before restore never call the complete endpoint. Seal any
 * of their backups whose manifest has landed so they can still be restored
 * and do not count against the pending limit.
 *
 * Only those plugins need it: they create backups without an `os`, which
 * every newer plugin sends. Sealing reads the manifest and stats every file,
 * so each request seals at most OBS_BACKUP_SETTLE_PER_REQUEST backups and a
 * backup that failed is left alone for OBS_BACKUP_SETTLE_RETRY_MS. Anything
 * still unsealed is removed once it passes OBS_BACKUP_PENDING_TTL_MS.
 */
export async function settlePendingObsBackups(
	userId: string,
	client: Pick<ObjectStore, "read" | "stat" | "list" | "delete"> = storage,
	now = Date.now(),
) {
	const pending = await db.query.obsBackup.findMany({
		columns: { id: true },
		where: and(
			eq(obsBackup.userId, userId),
			isNull(obsBackup.completedAt),
			isNull(obsBackup.os),
		),
		orderBy: [obsBackup.createdAt],
	});
	let attempted = 0;
	for (const { id } of pending) {
		if (attempted >= OBS_BACKUP_SETTLE_PER_REQUEST) break;
		const last = settleAttempts.get(id);
		if (last !== undefined && now - last < OBS_BACKUP_SETTLE_RETRY_MS) continue;
		rememberSettleAttempt(id, now);
		attempted += 1;
		await completeObsBackup(userId, id, client).catch((error) => {
			if (!(error instanceof ObsBackupError)) throw error;
		});
	}
}

export async function listObsBackups(
	userId: string,
	client: Pick<ObjectStore, "read" | "stat" | "list" | "delete"> = storage,
) {
	await removeAbandonedObsBackups(userId, client);
	await settlePendingObsBackups(userId, client);
	await reconcileDueObsBackups(userId, client);
	const rows = await db.query.obsBackup.findMany({
		where: and(eq(obsBackup.userId, userId), isNotNull(obsBackup.completedAt)),
		orderBy: [desc(obsBackup.completedAt), desc(obsBackup.createdAt)],
	});
	return rows.map(summarize);
}

export async function getObsBackupManifest(
	userId: string,
	backupId: string,
	client: Pick<ObjectStore, "read"> = storage,
) {
	const row = await completedBackup(userId, backupId);
	return {
		backup: summarize(row),
		manifest: await readManifest(userId, backupId, client),
	};
}

/** Presigned GETs, only for files the backup's own manifest lists. */
export async function getObsBackupDownloadUrls(
	userId: string,
	backupId: string,
	paths: string[],
	client: Pick<ObjectStore, "read" | "presign"> = restoreStore,
) {
	if (paths.length === 0 || paths.length > OBS_BACKUP_DOWNLOAD_BATCH)
		throw new ObsBackupError(400, "Request between 1 and 100 files");
	if (!paths.every(validObsBackupPath))
		throw new ObsBackupError(400, "Invalid backup file path");
	await completedBackup(userId, backupId);
	const manifest = await readManifest(userId, backupId, client);
	const listed = new Set(manifest.files.map((file) => file.path));
	if (!paths.every((path) => listed.has(path)))
		throw new ObsBackupError(404, "File is not part of this backup");
	return Promise.all(
		[...new Set(paths)].map(async (path) => ({
			path,
			url: await client.presign(obsBackupKey(userId, backupId, path), {
				expiresIn: DOWNLOAD_URL_TTL_SECONDS,
				method: "GET",
			}),
		})),
	);
}

export async function deleteObsBackup(
	userId: string,
	backupId: string,
	client: Pick<ObjectStore, "list" | "delete"> = storage,
) {
	await ownedBackup(userId, backupId);
	await removeBackup(userId, backupId, client);
}
