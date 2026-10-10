import { describe, expect, test } from "bun:test";

import "./test-env";
import {
	getObsBackupUploadUrl,
	ObsBackupError,
	obsBackupKey,
	obsBackupPrefix,
	parseObsBackupManifest,
	validObsBackupPath,
} from "./obs-backup";

const sha = "A".repeat(64);

describe("OBS backups", () => {
	test("keeps each upload inside its owner's backup", async () => {
		expect(obsBackupKey("user-a", "backup-a", "scenes/main.json")).toBe(
			"obs-backups/user-a/backup-a/scenes/main.json",
		);
		expect(obsBackupPrefix("user-a", "backup-a")).toBe(
			"obs-backups/user-a/backup-a/",
		);
		await expect(
			getObsBackupUploadUrl("user-a", "backup-a", "../other", {
				presign: () => Promise.resolve("unused"),
			}),
		).rejects.toThrow("Invalid backup file path");
		expect(validObsBackupPath("media/000001")).toBe(true);
		expect(validObsBackupPath("media//000001")).toBe(false);
		expect(validObsBackupPath("scenes\\main.json")).toBe(false);
	});

	test("reads version 1 manifests from older plugins", () => {
		const manifest = parseObsBackupManifest({
			version: 1,
			createdAt: "2026-10-01T10:00:00Z",
			files: [
				{
					path: "scenes/Main.json",
					originalPath: "C:/Users/me/obs/basic/scenes/Main.json",
					byteSize: 120,
				},
			],
		});
		expect(manifest.version).toBe(1);
		expect(manifest.files[0]?.sha256).toBeUndefined();
	});

	test("reads version 2 manifests with hashes and OBS details", () => {
		const manifest = parseObsBackupManifest({
			version: 2,
			createdAt: "2026-10-01T10:00:00Z",
			os: "windows",
			obsVersion: "31.1.0",
			sceneCollection: "Main",
			profile: "Streaming",
			files: [
				{
					path: "media/000001.png",
					originalPath: "/home/me/logo.png",
					byteSize: 5,
					sha256: sha,
				},
			],
		});
		if (manifest.version !== 2) throw new Error("expected version 2");
		expect(manifest.sceneCollection).toBe("Main");
		expect(manifest.files[0]?.sha256).toBe(sha.toLowerCase());
	});

	test("rejects manifests that could escape the backup or lie about files", () => {
		const file = { path: "scenes/a.json", originalPath: "a", byteSize: 1 };
		for (const manifest of [
			{ version: 3, createdAt: "x", files: [file] },
			{ version: 1, createdAt: "x", files: [] },
			{ version: 1, createdAt: "x", files: [{ ...file, path: "../a" }] },
			{
				version: 1,
				createdAt: "x",
				files: [{ ...file, path: "manifest.json" }],
			},
			{ version: 1, createdAt: "x", files: [{ ...file, byteSize: 0 }] },
			{ version: 1, createdAt: "x", files: [file, file] },
			{ version: 2, createdAt: "x", files: [file] },
			{
				version: 2,
				createdAt: "x",
				files: [{ ...file, sha256: "not-a-hash" }],
			},
		]) {
			expect(() => parseObsBackupManifest(manifest)).toThrow(ObsBackupError);
		}
	});
});
