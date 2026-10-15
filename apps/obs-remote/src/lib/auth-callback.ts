/**
 * Pure helpers that bind an OAuth deep-link callback to a browser sign-in this
 * app started. No React Native imports, so the rules stay unit-testable; the
 * side effects (SecureStore, Linking, the auth client) live in backend.ts.
 * Ported from apps/native/src/lib/auth-callback.ts; keep the two in step.
 *
 * Without this binding any page or app could open
 * `obsremote://anything?cookie=better-auth.session_token=…` while a sign-in is
 * in the browser and silently sign the remote into someone else's account
 * (login CSRF / session fixation).
 */

/** Query parameter that carries the one-time state on the callback URL. */
export const AUTH_STATE_PARAM = "obsremote_auth_state";

/** How long a started browser sign-in may take before its state is refused. */
export const AUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** SecureStore key of the pending state; survives an Android cold start. */
export const PENDING_AUTH_CALLBACK_KEY = "obsremote_auth_pending";

/** Bytes of randomness in a state (256 bits, comfortably above 128). */
export const AUTH_STATE_BYTES = 32;

export type PendingAuthCallback = {
	/** The exact callback URLs (state included) handed to the server. */
	callbackURLs: string[];
	expiresAt: number;
	state: string;
};

export type AuthCallbackDecision = {
	/** The pending state must be deleted (used, or expired). */
	consume: boolean;
	/** Set-Cookie value to merge into the session; only for a bound callback. */
	cookie?: string;
};

const CALLBACK_URL_FIELDS = [
	"callbackURL",
	"errorCallbackURL",
	"newUserCallbackURL",
] as const;

type CallbackURLField = (typeof CALLBACK_URL_FIELDS)[number];
type CallbackURLBody = Partial<Record<CallbackURLField, unknown>> & {
	callbackURL: string;
};

type RandomSource = {
	crypto?: { getRandomValues?: (bytes: Uint8Array) => Uint8Array };
	expo?: { uuidv4?: () => string };
};

/**
 * Cryptographically random bytes without a new dependency: Web Crypto where
 * the runtime has it (web, newer Hermes), otherwise expo-modules-core's native
 * UUIDv4 (SecRandom / SecureRandom, 122 random bits each), which every Expo
 * app installs on `globalThis.expo`. Throws rather than fall back to
 * Math.random, so an unbound sign-in never starts.
 */
export function secureRandomBytes(
	length: number,
	runtime: RandomSource = globalThis as RandomSource,
): Uint8Array {
	const bytes = new Uint8Array(length);
	const getRandomValues = runtime.crypto?.getRandomValues;
	if (getRandomValues) {
		getRandomValues.call(runtime.crypto, bytes);
		return bytes;
	}
	const uuidv4 = runtime.expo?.uuidv4;
	if (!uuidv4) throw new Error("No secure random source is available.");
	let filled = 0;
	while (filled < length) {
		const uuid = uuidv4().toLowerCase();
		if (
			!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
				uuid,
			)
		)
			throw new Error("No secure random source is available.");
		// Skip the version and variant nibbles; 30 fully random hex digits remain.
		const hex = uuid.replaceAll("-", "");
		const random = `${hex.slice(0, 12)}${hex.slice(13, 16)}${hex.slice(17)}`;
		for (
			let index = 0;
			index + 1 < random.length && filled < length;
			index += 2
		)
			bytes[filled++] = Number.parseInt(random.slice(index, index + 2), 16);
	}
	return bytes;
}

export function authStateFromBytes(bytes: Uint8Array): string {
	if (bytes.length < 16) {
		throw new Error("Auth state needs at least 128 bits of randomness.");
	}
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

/**
 * Mirrors the condition under which @better-auth/expo opens the auth browser
 * and later receives a deep link: a sign-in or link-social request with a
 * callbackURL and no inline idToken (Apple sign-in sends an idToken and never
 * leaves the app).
 */
export function isBrowserAuthRequest(
	pathname: string,
	body: unknown,
): body is CallbackURLBody {
	const isSignIn =
		pathname.endsWith("/sign-in") || pathname.includes("/sign-in/");
	const isLinkSocial = pathname.endsWith("/link-social");
	if (!isSignIn && !isLinkSocial) return false;
	if (typeof body !== "object" || body === null) return false;
	const fields = body as Record<string, unknown>;
	return typeof fields.callbackURL === "string" && fields.idToken === undefined;
}

/** Adds the state to an absolute callback URL, or undefined if unparseable. */
export function withAuthState(url: string, state: string): string | undefined {
	try {
		const callback = new URL(url);
		callback.searchParams.set(AUTH_STATE_PARAM, state);
		return callback.toString();
	} catch {
		return undefined;
	}
}

/**
 * Rewrites every callback URL in the request body to carry the state and
 * returns the pending record to persist. `resolve` turns an app-relative path
 * into the absolute deep link the server will redirect to. Throws rather than
 * letting an unbound flow start.
 */
export function bindAuthRequest(
	body: CallbackURLBody,
	state: string,
	now: number,
	resolve: (url: string) => string = (url) => url,
): PendingAuthCallback {
	const callbackURLs: string[] = [];
	for (const field of CALLBACK_URL_FIELDS) {
		const value = body[field];
		if (typeof value !== "string") continue;
		const bound = withAuthState(resolve(value), state);
		if (!bound) throw new Error(`Invalid ${field} for sign-in.`);
		body[field] = bound;
		callbackURLs.push(bound);
	}
	return { callbackURLs, expiresAt: now + AUTH_STATE_TTL_MS, state };
}

export function serializePendingAuthCallback(
	pending: PendingAuthCallback,
): string {
	return JSON.stringify(pending);
}

export function parsePendingAuthCallback(
	raw: string | null | undefined,
): PendingAuthCallback | undefined {
	if (!raw) return undefined;
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== "object" || value === null) return undefined;
		const { callbackURLs, expiresAt, state } = value as Record<string, unknown>;
		if (
			typeof state !== "string" ||
			state.length < 32 ||
			typeof expiresAt !== "number" ||
			!Number.isFinite(expiresAt) ||
			!Array.isArray(callbackURLs) ||
			callbackURLs.length === 0 ||
			!callbackURLs.every((url) => typeof url === "string")
		) {
			return undefined;
		}
		return { callbackURLs, expiresAt, state };
	} catch {
		return undefined;
	}
}

function parseURL(url: string): URL | undefined {
	try {
		return new URL(url);
	} catch {
		return undefined;
	}
}

function callbackTarget(url: URL): string {
	return `${url.protocol}//${url.host}${url.pathname || "/"}`;
}

function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let difference = 0;
	for (let index = 0; index < a.length; index++) {
		difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}
	return difference === 0;
}

/**
 * Decides what a deep link may do to the session. A cookie is only released
 * when a pending, unexpired state exists, the link targets one of the callback
 * URLs that request was sent with (scheme, host and path), and it carries that
 * exact state. A matching state is consumed whether or not a cookie came back
 * (error callbacks carry none); an expired one is dropped. Links that do not
 * carry the pending state leave it in place, so an unrelated or forged link
 * cannot cancel a sign-in that is still in the browser.
 */
export function decideAuthCallback(
	url: string,
	pending: PendingAuthCallback | undefined,
	now: number,
): AuthCallbackDecision {
	if (!pending) return { consume: false };
	if (now >= pending.expiresAt) return { consume: true };

	const callback = parseURL(url);
	if (!callback) return { consume: false };
	const target = callbackTarget(callback);
	const expected = pending.callbackURLs.some((sent) => {
		const parsed = parseURL(sent);
		return parsed !== undefined && callbackTarget(parsed) === target;
	});
	if (!expected) return { consume: false };

	const states = callback.searchParams.getAll(AUTH_STATE_PARAM);
	if (states.length !== 1 || !constantTimeEqual(states[0] ?? "", pending.state))
		return { consume: false };

	const cookies = callback.searchParams.getAll("cookie");
	return cookies.length === 1 && cookies[0]
		? { consume: true, cookie: cookies[0] }
		: { consume: true };
}
