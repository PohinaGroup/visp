import { db } from "@VISP/db";
import {
	appUser,
	brbHighlight,
	pathState,
	relayPath,
} from "@VISP/db/schema/index";
import type { ObjectStore } from "@VISP/object-store";
import { createHash, randomUUID } from "node:crypto";
import { and, count, eq, isNotNull, isNull, max, sql } from "drizzle-orm";
import { snapshotUploads } from "./snapshots";

const UPLOAD_URL_TTL_S = 60;
export const MAX_BRB_HIGHLIGHTS = 5;
export const MAX_BRB_HIGHLIGHT_BYTES = 25 * 1024 * 1024;
export const MAX_BRB_HIGHLIGHT_DURATION_MS = 30_000;

export function brbHighlightKey(userId: string, id: string) {
	return `brb/${userId}/highlights/${id}.mp4`;
}

export function brbHighlightUploadKey(
	userId: string,
	id: string,
	uploadId: string,
) {
	return `brb/${userId}/highlights/uploads/${id}-${uploadId}.mp4`;
}

export function validateBrbHighlight(input: {
	contentType: string;
	codec: string;
	durationMs: number;
	byteSize: number;
}) {
	if (input.contentType !== "video/mp4") return "type" as const;
	if (!input.codec.toLowerCase().startsWith("avc1")) return "codec" as const;
	if (input.durationMs <= 0 || input.durationMs > MAX_BRB_HIGHLIGHT_DURATION_MS)
		return "duration" as const;
	if (input.byteSize <= 0 || input.byteSize > MAX_BRB_HIGHLIGHT_BYTES)
		return "size" as const;
	return null;
}

export function inspectBrbHighlightMp4(bytes: Uint8Array) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const typeAt = (offset: number) =>
		String.fromCharCode(
			bytes[offset] ?? 0,
			bytes[offset + 1] ?? 0,
			bytes[offset + 2] ?? 0,
			bytes[offset + 3] ?? 0,
		);
	type Box = { type: string; content: number; end: number };
	const boxes = (start: number, end: number): Box[] | null => {
		const result: Box[] = [];
		for (let offset = start; offset < end; ) {
			if (offset + 8 > end) return null;
			const size = view.getUint32(offset);
			if (size < 8 || offset + size > end) return null;
			result.push({
				type: typeAt(offset + 4),
				content: offset + 8,
				end: offset + size,
			});
			offset += size;
		}
		return result;
	};
	const top = boxes(0, bytes.length);
	const moov = top?.find(({ type }) => type === "moov");
	if (!top?.some(({ type }) => type === "ftyp") || !moov) return null;
	const moovBoxes = boxes(moov.content, moov.end);
	const mvhd = moovBoxes?.find(({ type }) => type === "mvhd");
	const tracks = moovBoxes?.filter(({ type }) => type === "trak");
	if (!mvhd || !tracks?.length) return null;
	const version = view.getUint8(mvhd.content);
	const timescaleOffset = mvhd.content + (version === 1 ? 20 : 12);
	const durationOffset = mvhd.content + (version === 1 ? 24 : 16);
	if (durationOffset + (version === 1 ? 8 : 4) > mvhd.end) return null;
	const timescale = view.getUint32(timescaleOffset);
	const duration =
		version === 1
			? Number(view.getBigUint64(durationOffset))
			: view.getUint32(durationOffset);
	if (!timescale || !duration) return null;
	const video = tracks
		.map((trak) => {
			const trakBoxes = boxes(trak.content, trak.end);
			const tkhd = trakBoxes?.find(({ type }) => type === "tkhd");
			const mdia = trakBoxes?.find(({ type }) => type === "mdia");
			if (!tkhd || tkhd.end - tkhd.content < 8 || !mdia) return null;
			const minf = boxes(mdia.content, mdia.end)?.find(
				({ type }) => type === "minf",
			);
			const stbl = minf
				? boxes(minf.content, minf.end)?.find(({ type }) => type === "stbl")
				: null;
			const stsd = stbl
				? boxes(stbl.content, stbl.end)?.find(({ type }) => type === "stsd")
				: null;
			if (!stsd || stsd.content + 8 > stsd.end) return null;
			const entryCount = view.getUint32(stsd.content + 4);
			const entries = boxes(stsd.content + 8, stsd.end);
			const avc1 = entries
				?.slice(0, entryCount)
				.find(({ type }) => type === "avc1");
			if (!avc1 || avc1.content + 78 > avc1.end) return null;
			const avcC = boxes(avc1.content + 78, avc1.end)?.find(
				({ type }) => type === "avcC",
			);
			if (
				!avcC ||
				avcC.end - avcC.content < 7 ||
				view.getUint8(avcC.content) !== 1
			)
				return null;
			const width = view.getUint32(tkhd.end - 8) / 65_536;
			const height = view.getUint32(tkhd.end - 4) / 65_536;
			return Number.isInteger(width) &&
				Number.isInteger(height) &&
				width > 0 &&
				height > 0
				? { width, height }
				: null;
		})
		.find((track) => track !== null);
	if (!video) return null;
	return {
		codec: "avc1",
		durationMs: Math.round((duration * 1000) / timescale),
		width: video.width,
		height: video.height,
	};
}

async function highlightsEnabled(userId: string) {
	const [row] = await db
		.select({
			enabled: appUser.brbHighlights,
			deleting: appUser.brbHighlightsDeleting,
		})
		.from(appUser)
		.where(eq(appUser.id, userId))
		.limit(1);
	if (!row?.enabled || row.deleting)
		throw new Error("BRB highlights are not enabled");
}

async function readBounded(response: Response, limit: number) {
	if (!response.body) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > limit) {
			await reader.cancel();
			throw new Error("That clip is over 25 MB");
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return bytes;
}

export async function getBrbHighlightUploadUrl(
	userId: string,
	client: Pick<ObjectStore, "presign"> = snapshotUploads,
) {
	await highlightsEnabled(userId);
	const [total] = await db
		.select({ value: count() })
		.from(brbHighlight)
		.where(
			and(eq(brbHighlight.userId, userId), isNull(brbHighlight.deletedAt)),
		);
	if ((total?.value ?? 0) >= MAX_BRB_HIGHLIGHTS)
		throw new Error("Highlights library is full (5 clips)");
	const id = randomUUID();
	const uploadId = randomUUID();
	const key = brbHighlightUploadKey(userId, id, uploadId);
	return {
		id,
		uploadId,
		url: await client.presign(key, {
			expiresIn: UPLOAD_URL_TTL_S,
			method: "PUT",
		}),
		contentType: "video/mp4" as const,
		maxBytes: MAX_BRB_HIGHLIGHT_BYTES,
	};
}

export type BrbHighlightMetadata = {
	id: string;
	uploadId: string;
	filename?: string;
	label?: string;
};

async function persistedHighlight(userId: string, id: string) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
		return tx.query.brbHighlight.findFirst({
			where: and(eq(brbHighlight.id, id), eq(brbHighlight.userId, userId)),
		});
	});
}

async function inspectUpload(
	key: string,
	client: Pick<ObjectStore, "stat" | "presign">,
) {
	const stat = await client.stat(key);
	if (stat.byteSize > MAX_BRB_HIGHLIGHT_BYTES)
		throw new Error("That clip is over 25 MB");
	if (stat.byteSize <= 0 || stat.contentType !== "video/mp4")
		throw new Error("Use an MP4 (H.264) video");
	const response = await fetch(
		await client.presign(key, {
			expiresIn: UPLOAD_URL_TTL_S,
			method: "GET",
		}),
	);
	if (!response.ok) throw new Error("Uploaded highlight is unavailable");
	const bytes = await readBounded(response, MAX_BRB_HIGHLIGHT_BYTES);
	if (bytes.length !== stat.byteSize)
		throw new Error("Uploaded highlight changed during validation");
	const inspected = inspectBrbHighlightMp4(bytes);
	if (
		!inspected ||
		validateBrbHighlight({
			contentType: stat.contentType,
			codec: inspected.codec,
			durationMs: inspected.durationMs,
			byteSize: stat.byteSize,
		})
	)
		throw new Error("Use an MP4 (H.264) video up to 30 seconds");
	return {
		...inspected,
		byteSize: stat.byteSize,
		contentType: stat.contentType,
		checksum: createHash("sha256").update(bytes).digest("hex"),
	};
}

export async function confirmBrbHighlightUpload(
	userId: string,
	input: BrbHighlightMetadata,
	client: Pick<
		ObjectStore,
		"stat" | "copy" | "delete" | "presign"
	> = snapshotUploads,
) {
	const key = brbHighlightKey(userId, input.id);
	const uploadKey = brbHighlightUploadKey(userId, input.id, input.uploadId);
	try {
		const persisted = await persistedHighlight(userId, input.id);
		if (persisted?.deletedAt) throw new Error("That upload has expired");
		if (persisted) {
			await client.delete(uploadKey).catch(() => undefined);
			return persisted;
		}
		// Object I/O and CPU-heavy parsing deliberately happen before the lock.
		const media = await inspectUpload(uploadKey, client);
		const clip = await db.transaction(async (tx) => {
			await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
			const existing = await tx.query.brbHighlight.findFirst({
				where: and(
					eq(brbHighlight.id, input.id),
					eq(brbHighlight.userId, userId),
				),
			});
			if (existing?.deletedAt) throw new Error("That upload has expired");
			if (existing) return existing;
			const [owner] = await tx
				.select({
					enabled: appUser.brbHighlights,
					deleting: appUser.brbHighlightsDeleting,
				})
				.from(appUser)
				.where(eq(appUser.id, userId))
				.limit(1);
			if (!owner?.enabled || owner.deleting)
				throw new Error("BRB highlights are not enabled");
			const [positions] = await tx
				.select({ total: count(), highest: max(brbHighlight.position) })
				.from(brbHighlight)
				.where(
					and(eq(brbHighlight.userId, userId), isNull(brbHighlight.deletedAt)),
				);
			if ((positions?.total ?? 0) >= MAX_BRB_HIGHLIGHTS)
				throw new Error("Highlights library is full (5 clips)");
			await client.copy(uploadKey, key);
			const promoted = await inspectUpload(key, client);
			if (promoted.checksum !== media.checksum)
				throw new Error("Uploaded highlight changed during confirmation");
			const [inserted] = await tx
				.insert(brbHighlight)
				.values({
					id: input.id,
					...promoted,
					userId,
					label:
						input.label?.trim().slice(0, 80) ||
						input.filename?.slice(0, 80) ||
						"Highlight",
					filename: input.filename?.slice(0, 255) || `${input.id}.mp4`,
					storageKey: key,
					position: (positions?.highest ?? -1) + 1,
				})
				.returning();
			return inserted;
		});
		await client.delete(uploadKey).catch(() => undefined);
		return clip;
	} catch (error) {
		try {
			const existing = await persistedHighlight(userId, input.id);
			if (existing && !existing.deletedAt) {
				await client.delete(uploadKey).catch(() => undefined);
				return existing;
			}
			await db.transaction(async (tx) => {
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtext(${userId}))`,
				);
				const owner = await tx.query.brbHighlight.findFirst({
					where: and(
						eq(brbHighlight.id, input.id),
						eq(brbHighlight.userId, userId),
					),
				});
				await client.delete(uploadKey).catch(() => undefined);
				if (!owner) await client.delete(key).catch(() => undefined);
			});
		} catch {
			// Ownership is unknown while the database is unavailable. Deleting the
			// blob could corrupt an already committed, retrying confirmation.
			throw error;
		}
		throw error;
	}
}

export async function updateBrbHighlight(
	userId: string,
	id: string,
	input: { label?: string; enabled?: boolean },
) {
	await highlightsEnabled(userId);
	const values = {
		...(input.label === undefined
			? {}
			: { label: input.label.trim().slice(0, 80) }),
		...(input.enabled === undefined ? {} : { enabled: input.enabled }),
		updatedAt: new Date(),
	};
	const [clip] = await db
		.update(brbHighlight)
		.set(values)
		.where(
			and(
				eq(brbHighlight.id, id),
				eq(brbHighlight.userId, userId),
				isNull(brbHighlight.deletedAt),
			),
		)
		.returning();
	return clip ?? null;
}

export async function reorderBrbHighlights(userId: string, ids: string[]) {
	await highlightsEnabled(userId);
	return db.transaction(async (tx) => {
		const current = await tx
			.select({ id: brbHighlight.id })
			.from(brbHighlight)
			.where(
				and(eq(brbHighlight.userId, userId), isNull(brbHighlight.deletedAt)),
			);
		if (
			current.length !== ids.length ||
			new Set(ids).size !== ids.length ||
			current.some(({ id }) => !ids.includes(id))
		)
			throw new Error("Invalid highlight order");
		await tx
			.update(brbHighlight)
			.set({ position: sql`${brbHighlight.position} + 100` })
			.where(
				and(eq(brbHighlight.userId, userId), isNull(brbHighlight.deletedAt)),
			);
		for (const [position, id] of ids.entries()) {
			await tx
				.update(brbHighlight)
				.set({ position, updatedAt: new Date() })
				.where(and(eq(brbHighlight.id, id), eq(brbHighlight.userId, userId)));
		}
		return { ids };
	});
}

export async function deleteBrbHighlight(
	userId: string,
	id: string,
	client: Pick<ObjectStore, "delete"> = snapshotUploads,
) {
	await highlightsEnabled(userId);
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
		const clip = await tx.query.brbHighlight.findFirst({
			columns: { storageKey: true },
			where: and(
				eq(brbHighlight.id, id),
				eq(brbHighlight.userId, userId),
				isNull(brbHighlight.deletedAt),
			),
		});
		if (!clip) return false;
		const snapshots = await tx
			.select({ snapshot: pathState.brbHighlightsSnapshot })
			.from(pathState)
			.innerJoin(relayPath, eq(relayPath.id, pathState.pathId))
			.where(and(eq(relayPath.userId, userId), isNotNull(pathState.brbSince)));
		const active = snapshots.some(({ snapshot }) =>
			snapshot?.clips.some(({ key }) => key === clip.storageKey),
		);
		if (!active) await client.delete(clip.storageKey);
		await tx
			.update(brbHighlight)
			.set({ deletedAt: new Date(), enabled: false, updatedAt: new Date() })
			.where(and(eq(brbHighlight.id, id), eq(brbHighlight.userId, userId)));
		return true;
	});
}

export async function cleanupDeletedBrbHighlightsForUser(
	userId: string,
	client: Pick<ObjectStore, "delete"> = snapshotUploads,
) {
	const snapshots = await db
		.select({ snapshot: pathState.brbHighlightsSnapshot })
		.from(pathState)
		.innerJoin(relayPath, eq(relayPath.id, pathState.pathId))
		.where(and(eq(relayPath.userId, userId), isNotNull(pathState.brbSince)));
	const active = new Set(
		snapshots.flatMap(
			({ snapshot }) => snapshot?.clips.map(({ key }) => key) ?? [],
		),
	);
	const deleted = await db
		.select({ key: brbHighlight.storageKey })
		.from(brbHighlight)
		.where(
			and(eq(brbHighlight.userId, userId), isNotNull(brbHighlight.deletedAt)),
		);
	await Promise.all(
		deleted
			.filter(({ key }) => !active.has(key))
			.map(({ key }) => client.delete(key)),
	);
}

export async function cleanupDeletedBrbHighlightsForPath(
	pathId: number,
	client: Pick<ObjectStore, "delete"> = snapshotUploads,
) {
	const path = await db.query.relayPath.findFirst({
		columns: { userId: true },
		where: eq(relayPath.id, pathId),
	});
	if (path) await cleanupDeletedBrbHighlightsForUser(path.userId, client);
}

export async function setBrbHighlightPrefs(
	userId: string,
	input: { muted?: boolean; overlay?: boolean },
) {
	await highlightsEnabled(userId);
	if (input.muted === undefined && input.overlay === undefined)
		throw new Error("No highlight preference provided");
	await db
		.update(appUser)
		.set({
			...(input.muted === undefined ? {} : { brbHighlightsMuted: input.muted }),
			...(input.overlay === undefined
				? {}
				: { brbHighlightsOverlay: input.overlay }),
		})
		.where(eq(appUser.id, userId));
	return input;
}
