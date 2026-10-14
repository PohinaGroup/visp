import { describe, expect, test } from "bun:test";

import "./test-env";
import {
	checkObsBackupManifestLimits,
	getObsBackupUploadUrl,
	OBS_BACKUP_FILE_MAX_BYTES,
	OBS_BACKUP_MAX_BYTES,
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

	test("accepts every path the plugin writes", () => {
		for (const path of [
			"manifest.json",
			"scenes/Main.json",
			"scenes/My Scene.json",
			"scenes/Ääkköset 台.json",
			"profiles/Untitled/basic.ini",
			"profiles/My Profile/basic.ini",
			"media/000001",
			"media/000002.png",
			"media/000003.mp4",
			"scenes/.hidden.json",
			"media/console.png",
		]) {
			expect(validObsBackupPath(path)).toBe(true);
		}
	});

	test("rejects paths Windows would resolve outside the restore folder", () => {
		for (const path of [
			"C:/Users/x/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/x.bat",
			"C:x.bat",
			"c:/x",
			"media/x:stream",
			"/etc/passwd",
			"//server/share/x",
			"media/../../x",
			"media/./x",
			"media\\x",
			"media/a\u0000b",
			"media/a\nb",
			"media/a\u007fb",
			...["<", ">", '"', "|", "?", "*"].map((c) => `media/a${c}b`),
			"media/trailing.",
			"media/trailing ",
			"media./x",
			"CON",
			"media/con",
			"media/NUL.json",
			"media/com1.png",
			"media/LPT9",
			"media/aux.tar.gz",
			"x".repeat(513),
			"",
		]) {
			expect(validObsBackupPath(path)).toBe(false);
		}
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
				files: [{ ...file, path: "C:/Windows/System32/evil.dll" }],
			},
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
	test("caps file and backup sizes when sealing but still reads older backups", () => {
		const file = (path: string, byteSize: number) => ({
			path,
			originalPath: path,
			byteSize,
		});
		const manifest = (files: ReturnType<typeof file>[]) =>
			parseObsBackupManifest({ version: 1, createdAt: "x", files });
		const stored = manifest([file("media/000001", 3 * 1024 ** 3)]);
		expect(stored.files[0]?.byteSize).toBe(3 * 1024 ** 3);
		expect(() => checkObsBackupManifestLimits(stored)).toThrow("1 GB per-file");
		expect(() =>
			checkObsBackupManifestLimits(
				manifest([file("media/000001", OBS_BACKUP_FILE_MAX_BYTES)]),
			),
		).not.toThrow();
		const tooMuch = manifest([
			file("media/000001", OBS_BACKUP_FILE_MAX_BYTES),
			file("media/000002", OBS_BACKUP_FILE_MAX_BYTES),
			file(
				"media/000003",
				OBS_BACKUP_MAX_BYTES - 2 * OBS_BACKUP_FILE_MAX_BYTES + 1,
			),
		]);
		try {
			checkObsBackupManifestLimits(tooMuch);
			throw new Error("expected a size error");
		} catch (error) {
			expect(error).toBeInstanceOf(ObsBackupError);
			expect((error as ObsBackupError).status).toBe(413);
		}
		expect(() => manifest([file("media/000001", 4 * 1024 ** 3 + 1)])).toThrow(
			ObsBackupError,
		);
	});
});
