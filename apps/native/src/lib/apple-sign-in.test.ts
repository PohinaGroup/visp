import { describe, expect, mock, test } from "bun:test";
import type { AppleAuthenticationCredential } from "expo-apple-authentication";

let credential: Partial<AppleAuthenticationCredential>;
let signInOptions: { nonce?: string } | undefined;

mock.module("expo-apple-authentication", () => ({
	AppleAuthenticationScope: { EMAIL: 0, FULL_NAME: 1 },
	signInAsync: async (options: { nonce?: string }) => {
		signInOptions = options;
		return credential;
	},
}));
mock.module("expo-crypto", () => ({ randomUUID: () => "nonce-1" }));

const { appleIdToken, isAppleCancellation } = await import("./apple-sign-in");

describe("appleIdToken", () => {
	test("sends the name Apple only reveals on the first authorization", async () => {
		credential = {
			fullName: { familyName: "Juntto", givenName: "Joni" } as never,
			identityToken: "token-1",
		};

		expect(await appleIdToken()).toEqual({
			nonce: "nonce-1",
			token: "token-1",
			user: { name: { firstName: "Joni", lastName: "Juntto" } },
		});
		// The same nonce has to reach Apple, or the server cannot match it back.
		expect(signInOptions?.nonce).toBe("nonce-1");
	});

	test("omits the name on a repeat sign-in so the stored one survives", async () => {
		credential = { fullName: null, identityToken: "token-2" };

		expect((await appleIdToken()).user).toBeUndefined();
	});

	test("refuses to sign in without an identity token", async () => {
		credential = { fullName: null, identityToken: null };

		await expect(appleIdToken()).rejects.toThrow("identity token");
	});
});

describe("isAppleCancellation", () => {
	test("matches only a dismissed sheet", () => {
		expect(isAppleCancellation({ code: "ERR_REQUEST_CANCELED" })).toBe(true);
		expect(isAppleCancellation({ code: "ERR_INVALID_RESPONSE" })).toBe(false);
		expect(isAppleCancellation(new Error("offline"))).toBe(false);
		expect(isAppleCancellation(undefined)).toBe(false);
	});
});
