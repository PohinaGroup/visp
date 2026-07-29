import { db } from "@VISP/db";
import { pathState, relayPath } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import {
	createObjectStore,
	type ObjectStore,
} from "@VISP/object-store";
import { and, eq, gte, isNull } from "drizzle-orm";

const PATH_ONLINE_FOR_MS = 60_000;
const SNAPSHOT_FRESH_FOR_MS = 120_000;

const snapshots = createObjectStore({
	accessKeyId: env.S3_ACCESS_KEY_ID,
	bucket: env.S3_BUCKET,
	endpoint: env.S3_ENDPOINT,
	region: env.S3_REGION,
	secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});

const snapshotUploads = createObjectStore({
	accessKeyId: env.S3_ACCESS_KEY_ID,
	bucket: env.S3_BUCKET,
	endpoint: env.S3_UPLOAD_ENDPOINT ?? env.S3_ENDPOINT,
	region: env.S3_REGION,
	secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});

type SnapshotReader = Pick<ObjectStore, "presign" | "stat">;

export function snapshotKey(pathId: number) {
	return `snapshots/${pathId}.jpg`;
}

export async function getSnapshotUploadUrl(
	path: string,
	client: Pick<ObjectStore, "presign"> = snapshotUploads,
) {
	const [livePath] = await db
		.select({ id: relayPath.id })
		.from(relayPath)
		.innerJoin(pathState, eq(pathState.pathId, relayPath.id))
		.where(
			and(
				eq(relayPath.slug, path),
				isNull(relayPath.revokedAt),
				eq(pathState.publishing, true),
				gte(pathState.lastEventAt, new Date(Date.now() - PATH_ONLINE_FOR_MS)),
			),
		)
		.limit(1);
	if (!livePath) return null;

	return client.presign(snapshotKey(livePath.id), {
		expiresIn: 60,
		method: "PUT",
	});
}

export async function listSnapshots(
	userId: string,
	client: SnapshotReader = snapshots,
) {
	const now = Date.now();
	const livePaths = await db
		.select({ id: relayPath.id, label: relayPath.label })
		.from(relayPath)
		.innerJoin(pathState, eq(pathState.pathId, relayPath.id))
		.where(
			and(
				eq(relayPath.userId, userId),
				isNull(relayPath.revokedAt),
				eq(pathState.publishing, true),
				gte(pathState.lastEventAt, new Date(now - PATH_ONLINE_FOR_MS)),
			),
		)
		.orderBy(relayPath.seq);

	return Promise.all(
		livePaths.map(async (path) => {
			try {
				const key = snapshotKey(path.id);
				const stat = await client.stat(key);
				const fresh =
					now - stat.lastModified.getTime() <= SNAPSHOT_FRESH_FOR_MS;
				return {
					pathId: path.id,
					label: path.label,
					capturedAt: stat.lastModified.toISOString(),
					url: fresh
						? await client.presign(key, { expiresIn: 120, method: "GET" })
						: null,
				};
			} catch {
				return {
					pathId: path.id,
					label: path.label,
					capturedAt: null,
					url: null,
				};
			}
		}),
	);
}
