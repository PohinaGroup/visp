import { describe, expect, test } from "bun:test";
import { authCookieFromCallback } from "./auth-callback";

describe("authCookieFromCallback", () => {
	test("accepts only the app callback and decodes its session cookie", () => {
		expect(
			authCookieFromCallback(
				"visp:///?cookie=better-auth.session_token%3Dabc%3B%20HttpOnly",
				"visp",
			),
		).toBe("better-auth.session_token=abc; HttpOnly");
		expect(authCookieFromCallback("other:///?cookie=forged", "visp")).toBe(
			undefined,
		);
		expect(authCookieFromCallback("not a URL", "visp")).toBeUndefined();
	});
});
