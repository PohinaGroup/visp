import { beforeAll, describe, expect, test } from "bun:test";

beforeAll(() => {
	process.env.SKIP_ENV_VALIDATION = "true";
	process.env.PUBLISH_URL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
		"base64",
	);
});

describe("encrypted secrets", () => {
	test("round trips only with the matching AAD", async () => {
		const { decryptSecret, encryptSecret } = await import("./encrypted-secret");
		const encrypted = encryptSecret(
			"srt://example.com:9000?passphrase=secret",
			"one",
		);

		expect(encrypted).not.toContain("secret");
		expect(decryptSecret(encrypted, "one")).toBe(
			"srt://example.com:9000?passphrase=secret",
		);
		expect(() => decryptSecret(encrypted, "two")).toThrow(
			"Stored secret cannot be revealed",
		);
	});

	test("rejects malformed envelopes without exposing their contents", async () => {
		const { decryptSecret } = await import("./encrypted-secret");
		expect(() => decryptSecret("plaintext", "one")).toThrow(
			"Stored secret cannot be revealed",
		);
	});
});
