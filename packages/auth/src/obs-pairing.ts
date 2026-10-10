import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";

/**
 * OBS pairing uses Better Auth's device authorization flow, whose token
 * endpoint hands the device an ordinary session. The OBS plugin only needs it
 * once, to call `POST /api/obs/connect` for its own machine token, so the
 * session it gets is marked by this token prefix, lives for minutes, and is
 * refused everywhere else.
 *
 * The prefix is the marker on purpose: it is the session's lookup key, so it is
 * identical in the database row, the secondary-storage copy and every request
 * that presents it, and can be checked before any session lookup.
 */
export const OBS_PAIRING_TOKEN_PREFIX = "obspair_";
export const OBS_PAIRING_SESSION_SECONDS = 10 * 60;

function tryDecode(value: string) {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

export function isObsPairingToken(token: string | null | undefined) {
	return Boolean(
		token && tryDecode(token).startsWith(OBS_PAIRING_TOKEN_PREFIX),
	);
}

/** Every value a request could authenticate with: the bearer token and each cookie. */
function presentedCredentials(headers: Headers | null | undefined) {
	if (!headers) return [];
	const values: string[] = [];
	const authorization = headers.get("authorization");
	if (authorization?.slice(0, 7).toLowerCase() === "bearer ") {
		values.push(authorization.slice(7).trim());
	}
	for (const pair of headers.get("cookie")?.split(";") ?? []) {
		const separator = pair.indexOf("=");
		if (separator === -1) continue;
		let value = pair.slice(separator + 1).trim();
		if (value.startsWith('"')) value = value.slice(1, -1);
		values.push(value);
	}
	return values;
}

export function presentsObsPairingToken(
	...sources: (Headers | null | undefined)[]
) {
	return sources.some((headers) =>
		presentedCredentials(headers).some(isObsPairingToken),
	);
}

/**
 * Narrows device-flow sessions to OBS pairing.
 *
 * - `/device/token` swaps the full session Better Auth issues for a short-lived
 *   one whose token carries {@link OBS_PAIRING_TOKEN_PREFIX}.
 * - Every auth endpoint refuses a request presenting such a token, except a
 *   server-side `auth.api.getSession` call (no HTTP request), which is how
 *   `POST /api/obs/connect` reads it. That read never extends its lifetime.
 *   Other server code must use `getUserSession`, which drops these sessions.
 */
export function obsPairingScope() {
	return {
		id: "visp-obs-pairing-scope",
		hooks: {
			before: [
				{
					matcher: () => true,
					handler: createAuthMiddleware(async (ctx) => {
						if (!presentsObsPairingToken(ctx.request?.headers, ctx.headers)) {
							return;
						}
						if (ctx.path === "/get-session" && !ctx.request) {
							return { context: { query: { disableRefresh: true } } };
						}
						throw new APIError("UNAUTHORIZED", {
							code: "OBS_PAIRING_SESSION",
							message: "This sign-in can only be used to connect OBS.",
						});
					}),
				},
			],
			after: [
				{
					matcher: (ctx) => ctx.path === "/device/token",
					handler: createAuthMiddleware(async (ctx) => {
						const issued = ctx.context.newSession;
						const returned = ctx.context.returned as
							| { access_token?: unknown }
							| null
							| undefined;
						if (
							!issued ||
							!returned ||
							typeof returned !== "object" ||
							returned.access_token !== issued.session.token
						) {
							return;
						}
						const { internalAdapter } = ctx.context;
						await internalAdapter.deleteSession(issued.session.token);
						const scoped = await internalAdapter.createSession(
							issued.user.id,
							false,
							{
								token: `${OBS_PAIRING_TOKEN_PREFIX}${generateRandomString(32, "a-z", "A-Z", "0-9")}`,
								expiresAt: new Date(
									Date.now() + OBS_PAIRING_SESSION_SECONDS * 1000,
								),
							},
							// overrideAll: the token and expiry above replace the defaults.
							true,
						);
						if (!scoped) {
							throw new APIError("INTERNAL_SERVER_ERROR", {
								error: "server_error",
								error_description: "Failed to create session",
							});
						}
						ctx.context.setNewSession({ session: scoped, user: issued.user });
						return ctx.json({
							...returned,
							access_token: scoped.token,
							expires_in: OBS_PAIRING_SESSION_SECONDS,
						});
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}
