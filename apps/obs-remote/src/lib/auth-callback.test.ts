import { describe, expect, test } from "bun:test";
import {
	AUTH_STATE_PARAM,
	AUTH_STATE_TTL_MS,
	authStateFromBytes,
	bindAuthRequest,
	decideAuthCallback,
	isBrowserAuthRequest,
	type PendingAuthCallback,
	parsePendingAuthCallback,
	secureRandomBytes,
	serializePendingAuthCallback,
	withAuthState,
} from "./auth-callback";

const NOW = 1_800_000_000_000;
const STATE = "a".repeat(64);
const COOKIE = "better-auth.session_token=abc; HttpOnly";
const ENCODED_COOKIE = encodeURIComponent(COOKIE);

function pendingFor(
	callbackURL = "obsremote:///",
	state = STATE,
	now = NOW,
): PendingAuthCallback {
	const body = { callbackURL, errorCallbackURL: callbackURL };
	return bindAuthRequest(body, state, now);
}

// What the server sends back: the stored callback URL with `cookie` appended
// through URLSearchParams, exactly like @better-auth/expo's after hook.
function serverRedirect(callbackURL: string, cookie = COOKIE): string {
	const url = new URL(callbackURL);
	url.searchParams.set("cookie", cookie);
	return url.toString();
}

describe("authStateFromBytes", () => {
	test("hex-encodes and refuses fewer than 128 bits", () => {
		const bytes = new Uint8Array(16);
		bytes.set([0, 15, 255, 16]);
		expect(authStateFromBytes(bytes)).toBe(`000fff10${"00".repeat(12)}`);
		expect(authStateFromBytes(new Uint8Array(32))).toHaveLength(64);
		expect(() => authStateFromBytes(new Uint8Array(15))).toThrow();
	});
});

describe("secureRandomBytes", () => {
	test("uses Web Crypto when the runtime has it", () => {
		const bytes = secureRandomBytes(32, {
			crypto: {
				getRandomValues: (target) => target.fill(7),
			},
		});
		expect(Array.from(bytes)).toEqual(new Array(32).fill(7));
	});

	test("falls back to native UUIDv4 and skips the fixed nibbles", () => {
		let calls = 0;
		const bytes = secureRandomBytes(32, {
			expo: {
				uuidv4: () => {
					calls++;
					return "01234567-89ab-4cde-8f01-23456789abcd";
				},
			},
		});
		expect(calls).toBe(3);
		expect(bytes).toHaveLength(32);
		expect(authStateFromBytes(bytes).slice(0, 30)).toBe(
			"0123456789abcdef0123456789abcd",
		);
	});

	test("refuses without a secure source or with a malformed UUID", () => {
		expect(() => secureRandomBytes(32, {})).toThrow();
		expect(() =>
			secureRandomBytes(32, { expo: { uuidv4: () => "not-a-uuid" } }),
		).toThrow();
	});

	test("produces a state from the real runtime", () => {
		expect(authStateFromBytes(secureRandomBytes(32))).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe("isBrowserAuthRequest", () => {
	test("matches social sign-in and link-social with a callback URL", () => {
		expect(
			isBrowserAuthRequest("/api/auth/sign-in/social", { callbackURL: "/" }),
		).toBe(true);
		expect(
			isBrowserAuthRequest("/api/auth/link-social", { callbackURL: "/" }),
		).toBe(true);
	});

	test("skips idToken sign-in, other routes and bodies without a callback", () => {
		expect(
			isBrowserAuthRequest("/api/auth/sign-in/social", {
				callbackURL: "/",
				idToken: { token: "t" },
			}),
		).toBe(false);
		expect(
			isBrowserAuthRequest("/api/auth/sign-in/social", { provider: "apple" }),
		).toBe(false);
		expect(
			isBrowserAuthRequest("/api/auth/get-session", { callbackURL: "/" }),
		).toBe(false);
		expect(isBrowserAuthRequest("/api/auth/link-social", undefined)).toBe(
			false,
		);
	});
});

describe("bindAuthRequest", () => {
	test("puts the state on every callback URL and records them", () => {
		const body: Record<string, unknown> & { callbackURL: string } = {
			callbackURL: "/",
			errorCallbackURL: "/",
			provider: "twitch",
		};
		const pending = bindAuthRequest(
			body,
			STATE,
			NOW,
			(url) => `obsremote://${url}`,
		);
		const bound = `obsremote:///?${AUTH_STATE_PARAM}=${STATE}`;
		expect(body.callbackURL).toBe(bound);
		expect(body.errorCallbackURL).toBe(bound);
		expect(body.provider).toBe("twitch");
		expect(pending).toEqual({
			callbackURLs: [bound, bound],
			expiresAt: NOW + AUTH_STATE_TTL_MS,
			state: STATE,
		});
	});

	test("refuses to start an unbindable flow", () => {
		expect(() => bindAuthRequest({ callbackURL: "/" }, STATE, NOW)).toThrow();
	});

	test("keeps dev-client callback shapes intact", () => {
		expect(withAuthState("exp://192.168.1.5:8081/--/", STATE)).toBe(
			`exp://192.168.1.5:8081/--/?${AUTH_STATE_PARAM}=${STATE}`,
		);
	});
});

describe("pending state storage", () => {
	test("round-trips and rejects malformed records", () => {
		const pending = pendingFor();
		expect(
			parsePendingAuthCallback(serializePendingAuthCallback(pending)),
		).toEqual(pending);
		expect(parsePendingAuthCallback(null)).toBeUndefined();
		expect(parsePendingAuthCallback("not json")).toBeUndefined();
		expect(
			parsePendingAuthCallback(JSON.stringify({ ...pending, state: "short" })),
		).toBeUndefined();
		expect(
			parsePendingAuthCallback(
				JSON.stringify({ ...pending, callbackURLs: [] }),
			),
		).toBeUndefined();
	});
});

describe("decideAuthCallback", () => {
	const pending = pendingFor();
	const valid = serverRedirect(pending.callbackURLs[0] ?? "");

	test("accepts the callback of a pending sign-in and consumes its state", () => {
		expect(valid).toBe(
			`obsremote:///?${AUTH_STATE_PARAM}=${STATE}&cookie=${ENCODED_COOKIE.replaceAll("%20", "+")}`,
		);
		expect(decideAuthCallback(valid, pending, NOW + 1000)).toEqual({
			consume: true,
			cookie: COOKIE,
		});
	});

	test("rejects any callback when no sign-in is pending", () => {
		expect(decideAuthCallback(valid, undefined, NOW)).toEqual({
			consume: false,
		});
		expect(
			decideAuthCallback(
				`obsremote://x?cookie=${ENCODED_COOKIE}`,
				undefined,
				NOW,
			),
		).toEqual({ consume: false });
	});

	test("rejects a forged link without or with the wrong state, keeping the pending one", () => {
		expect(
			decideAuthCallback(
				`obsremote:///?cookie=${ENCODED_COOKIE}`,
				pending,
				NOW,
			),
		).toEqual({ consume: false });
		expect(
			decideAuthCallback(
				serverRedirect(`obsremote:///?${AUTH_STATE_PARAM}=${"b".repeat(64)}`),
				pending,
				NOW,
			),
		).toEqual({ consume: false });
		expect(
			decideAuthCallback(
				serverRedirect(`obsremote:///?${AUTH_STATE_PARAM}=${STATE.slice(1)}`),
				pending,
				NOW,
			),
		).toEqual({ consume: false });
		expect(
			decideAuthCallback(
				`${valid}&${AUTH_STATE_PARAM}=${"b".repeat(64)}`,
				pending,
				NOW,
			),
		).toEqual({ consume: false });
	});

	test("rejects and drops an expired state", () => {
		expect(decideAuthCallback(valid, pending, NOW + AUTH_STATE_TTL_MS)).toEqual(
			{ consume: true },
		);
	});

	test("is single-use", () => {
		let stored: PendingAuthCallback | undefined = pending;
		const first = decideAuthCallback(valid, stored, NOW);
		if (first.consume) stored = undefined;
		expect(first.cookie).toBe(COOKIE);
		expect(decideAuthCallback(valid, stored, NOW)).toEqual({ consume: false });
	});

	test("rejects the right state on the wrong scheme, host or path", () => {
		const query = `?${AUTH_STATE_PARAM}=${STATE}&cookie=${ENCODED_COOKIE}`;
		for (const url of [
			`other:///${query}`,
			`https://obsremote.example/${query}`,
			`obsremote://evil/${query}`,
			`obsremote:///settings${query}`,
			"not a URL",
		]) {
			expect(decideAuthCallback(url, pending, NOW)).toEqual({
				consume: false,
			});
		}
	});

	test("consumes an error callback without releasing a cookie", () => {
		const error = `obsremote:///?${AUTH_STATE_PARAM}=${STATE}&error=access_denied`;
		expect(decideAuthCallback(error, pending, NOW)).toEqual({ consume: true });
	});

	test("rejects ambiguous duplicate cookies", () => {
		expect(
			decideAuthCallback(`${valid}&cookie=${ENCODED_COOKIE}`, pending, NOW),
		).toEqual({ consume: true });
	});

	test("matches dev-client callbacks against what was sent", () => {
		const dev = pendingFor("exp://192.168.1.5:8081/--/");
		expect(
			decideAuthCallback(serverRedirect(dev.callbackURLs[0] ?? ""), dev, NOW)
				.cookie,
		).toBe(COOKIE);
		expect(decideAuthCallback(valid, dev, NOW)).toEqual({ consume: false });
	});
});
