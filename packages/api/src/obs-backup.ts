import { env } from "@VISP/env/server";
import { createObjectStore, type ObjectStore } from "@VISP/object-store";

export const OBS_BACKUP_FILE_MAX_BYTES = 4 * 1024 * 1024 * 1024;

const uploads = createObjectStore({
	accessKeyId: env.S3_ACCESS_KEY_ID,
	bucket: env.S3_BUCKET,
	endpoint: env.S3_UPLOAD_ENDPOINT ?? env.S3_ENDPOINT,
	region: env.S3_REGION,
	secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});

export function obsBackupKey(userId: string, backupId: string, path: string) {
	return `obs-backups/${userId}/${backupId}/${path}`;
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

export async function getObsBackupUploadUrl(
	userId: string,
	backupId: string,
	path: string,
	client: Pick<ObjectStore, "presign"> = uploads,
) {
	if (!validObsBackupPath(path)) throw new Error("Invalid backup file path");
	return client.presign(obsBackupKey(userId, backupId, path), {
		expiresIn: 60 * 60,
		method: "PUT",
	});
}
