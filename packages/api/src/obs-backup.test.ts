import { describe, expect, test } from "bun:test";

import "./test-env";
import {
	getObsBackupUploadUrl,
	obsBackupKey,
	validObsBackupPath,
} from "./obs-backup";

describe("OBS backups", () => {
	test("keeps each upload inside its owner's backup", async () => {
		expect(obsBackupKey("user-a", "backup-a", "scenes/main.json")).toBe(
			"obs-backups/user-a/backup-a/scenes/main.json",
		);
		await expect(
			getObsBackupUploadUrl("user-a", "backup-a", "../other", {
				presign: () => Promise.resolve("unused"),
			}),
		).rejects.toThrow("Invalid backup file path");
		expect(validObsBackupPath("media/000001")).toBe(true);
	});
});
