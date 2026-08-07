import * as AppleAuthentication from "expo-apple-authentication";
import { randomUUID } from "expo-crypto";

/**
 * iOS reports a dismissed ASAuthorization sheet as a thrown error rather than an
 * empty result, so a plain cancel is indistinguishable from a failure without
 * this check. Callers must stay silent for it.
 */
export function isAppleCancellation(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ERR_REQUEST_CANCELED"
	);
}

/**
 * Runs the native Apple sheet and shapes the `idToken` body for Better Auth.
 * Unlike the Twitch, Kick, and Google buttons this never opens a browser: the
 * token is verified against Apple's public keys inline, so the sign-in call it
 * feeds returns a session directly.
 */
export async function appleIdToken() {
	const nonce = randomUUID();
	const credential = await AppleAuthentication.signInAsync({
		nonce,
		requestedScopes: [
			AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
			AppleAuthentication.AppleAuthenticationScope.EMAIL,
		],
	});
	if (!credential.identityToken) {
		throw new Error("Apple did not return an identity token.");
	}
	const givenName = credential.fullName?.givenName;
	return {
		// Apple echoes the nonce into the token unmodified, and Better Auth
		// accepts either that or its SHA-256 hex, so the raw string matches
		// whichever form comes back.
		nonce,
		token: credential.identityToken,
		// Apple sends the name only on the very first authorization. Better Auth
		// persists it at sign-up; every later token carries no name, and sending
		// an empty one would blank the stored value.
		user: givenName
			? {
					name: {
						firstName: givenName,
						lastName: credential.fullName?.familyName ?? "",
					},
				}
			: undefined,
	};
}
