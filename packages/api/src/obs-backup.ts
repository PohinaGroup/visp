import { db } from "@VISP/db";
import { obsBackup } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { createObjectStore, type ObjectStore } from "@VISP/object-store";
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { z } from "zod";

export const OBS_BACKUP_FILE_MAX_BYTES = 4 * 1024 * 1024 * 1024;
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
const URL_TTL_SECONDS = 60 * 60;
const STAT_CONCURRENCY = 8;

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

export function validObsBackupPath(path: string) {
	return (
		path.length > 0 &&
		path.length <= 512 &&
		!path.includes("\\") &&
		!path.includes("\0") &&
		path.split("/").every((part) => part && part !== "." && part !== "..")
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
	byteSize: z.number().int().min(1).max(OBS_BACKUP_FILE_MAX_BYTES),
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
}

export async function createObsBackup(
	userId: string,
	input: { label?: string; os?: string; obsVersion?: string } = {},
	client: Pick<ObjectStore, "list" | "delete"> = storage,
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
	await settlePendingObsBackups(userId);
	const pending = await db.$count(
		obsBackup,
		and(eq(obsBackup.userId, userId), isNull(obsBackup.completedAt)),
	);
	if (pending >= OBS_BACKUP_MAX_PENDING)
		throw new ObsBackupError(
			429,
			"Another backup is still uploading. Try again later.",
		);
	const [row] = await db
		.insert(obsBackup)
		.values({
			id: randomUUID(),
			userId,
			label: input.label?.trim().slice(0, 256) || null,
			os: input.os?.trim().slice(0, 256) || null,
			obsVersion: input.obsVersion?.trim().slice(0, 256) || null,
		})
		.returning();
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
		expiresIn: URL_TTL_SECONDS,
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
	const row = await ownedBackup(userId, backupId);
	if (row.completedAt)
		throw new ObsBackupError(409, "Backup is already complete");
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
 * Seals a backup once the plugin has uploaded the manifest: every listed file
 * must exist at its declared size, so a listed backup is always restorable.
 */
export async function completeObsBackup(
	userId: string,
	backupId: string,
	client: Pick<ObjectStore, "read" | "stat" | "list" | "delete"> = storage,
): Promise<ObsBackupSummary> {
	const row = await ownedBackup(userId, backupId);
	if (row.completedAt) return summarize(row);
	const manifest = await readManifest(userId, backupId, client);
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
	const [completed] = await db
		.update(obsBackup)
		.set({
			completedAt: new Date(),
			fileCount: manifest.files.length,
			totalBytes: manifest.files.reduce((sum, file) => sum + file.byteSize, 0),
			label: row.label ?? v2?.sceneCollection ?? null,
			os: row.os ?? v2?.os ?? null,
			obsVersion: row.obsVersion ?? v2?.obsVersion ?? null,
		})
		.where(and(eq(obsBackup.id, backupId), eq(obsBackup.userId, userId)))
		.returning();
	if (!completed) throw new ObsBackupError(404, "Backup not found");
	await pruneObsBackups(userId, client);
	return summarize(completed);
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

/**
 * Plugins released before restore never call the complete endpoint. Seal any
 * of their backups whose manifest has landed so they can still be restored
 * and do not count against the pending limit.
 */
export async function settlePendingObsBackups(
	userId: string,
	client: Pick<ObjectStore, "read" | "stat" | "list" | "delete"> = storage,
) {
	const pending = await db.query.obsBackup.findMany({
		columns: { id: true },
		where: and(eq(obsBackup.userId, userId), isNull(obsBackup.completedAt)),
		orderBy: [obsBackup.createdAt],
	});
	for (const { id } of pending) {
		await completeObsBackup(userId, id, client).catch((error) => {
			if (!(error instanceof ObsBackupError)) throw error;
		});
	}
}

export async function listObsBackups(userId: string) {
	await settlePendingObsBackups(userId);
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
				expiresIn: URL_TTL_SECONDS,
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
