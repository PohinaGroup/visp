import { type ChatProvider, chatAuthProvider } from "@VISP/api/chat/contract";
import { linkScopes } from "@VISP/api/scopes";
import { authClient, authRedirectURL } from "@/lib/auth-client";

/**
 * Start an OAuth link that keeps every scope already granted and adds the ones
 * this feature needs. Both providers drop scopes they are not told about, so
 * the union has to be rebuilt on every call — see packages/api/src/scopes.ts.
 */
export async function linkProvider(input: {
	provider: ChatProvider;
	granted: readonly string[];
	adding?: readonly string[];
	fi: boolean;
}) {
	const scopes = linkScopes(input.provider, input.granted, input.adding ?? []);
	const callbackURL = authRedirectURL(
		`/dashboard${input.fi ? "?lang=fi" : ""}`,
	);
	return input.provider !== "kick"
		? authClient.linkSocial({
				provider: chatAuthProvider(input.provider),
				callbackURL,
				scopes,
			})
		: authClient.oauth2.link({
				providerId: input.provider,
				callbackURL,
				errorCallbackURL: authRedirectURL(
					`/dashboard?error=kick_link_failed${input.fi ? "&lang=fi" : ""}`,
				),
				scopes,
			});
}
