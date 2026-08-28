import { describe, expect, test } from "bun:test";
import { hashSecret, verifySecret } from "./password";

describe("password", () => {
	test("hashes and verifies secrets", async () => {
		const secret = "relay-read-secret";
		const hash = await hashSecret(secret);
		expect(await verifySecret(secret, hash)).toBe(true);
		expect(await verifySecret("wrong", hash)).toBe(false);
	});

	test("verifies legacy Bun argon2id hashes", async () => {
		const secret = "test-secret-123";
		const legacyHash =
			"$argon2id$v=19$m=65536,t=2,p=1$RfGQvVpO6zKRxSLwRON+ljJEvbFleXMKgqFZOkRWW4s$7xfV8Fc20zUNUyHnpHYFMI8V4/5qTPYrh7wmTVT8pvE";
		expect(await verifySecret(secret, legacyHash)).toBe(true);
	});
});
