import { beforeAll, describe, expect, test } from "bun:test";
import "./test-env";

beforeAll(() => {
	process.env.SKIP_ENV_VALIDATION = "true";
	process.env.DATABASE_URL = "postgresql://localhost/visp_test";
	process.env.PUBLISH_URL_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
		"base64",
	);
});

describe("custom Direct destination metadata", () => {
	test("normalizes names and creates domain-separated AAD", async () => {
		const { customDestinationAad, normalizeCustomDestinationName } =
			await import("./direct-custom");
		expect(normalizeCustomDestinationName("  Backup ingest  ")).toBe(
			"Backup ingest",
		);
		expect(customDestinationAad("user-1", "destination-1")).toBe(
			"custom-direct:user-1:destination-1",
		);
		expect(() => normalizeCustomDestinationName(" ")).toThrow();
	});

	test("serializes only safe metadata", async () => {
		const { serializeCustomDestination } = await import("./direct-custom");
		const summary = serializeCustomDestination({
			id: "destination-1",
			name: "Primary",
			protocol: "srt",
			endpointSummary: "srt://ingest.example.com:9000",
			createdAt: new Date("2026-08-27T10:00:00.000Z"),
			updatedAt: new Date("2026-08-27T11:00:00.000Z"),
		});

		expect(summary).toEqual({
			id: "destination-1",
			name: "Primary",
			protocol: "srt",
			endpointSummary: "srt://ingest.example.com:9000",
			createdAt: "2026-08-27T10:00:00.000Z",
			updatedAt: "2026-08-27T11:00:00.000Z",
		});
		expect(JSON.stringify(summary)).not.toContain("encrypted");
	});

	test("maps invalid destination URLs to a safe domain error", async () => {
		const { createCustomDirectDestination, DirectCustomError } = await import(
			"./direct-custom"
		);
		const failure = createCustomDirectDestination(
			"user-1",
			{ name: "Bad", url: "http://secret.example/path/key" },
			async () => ["1.1.1.1"],
		);
		await expect(failure).rejects.toBeInstanceOf(DirectCustomError);
		await expect(failure).rejects.toThrow("Destination URL is not valid");
		await expect(failure).rejects.not.toThrow("secret.example");
	});
});
