/**
 * One home for provider scope knowledge.
 *
 * Both providers drop scopes they are not told about on every link call, but
 * for different reasons, so `linkScopes` has to know the provider:
 *
 * - Twitch (social provider) appends per-call scopes to the provider defaults
 *   (`user:read:email`, `openid`). Those survive; everything VISP ever asked
 *   for through the per-call array is lost unless that array names it again.
 * - Kick (genericOAuth) is worse: `/oauth2/link` does
 *   `scopes: c.body.scopes || scopes || []`, so per-call scopes *replace* the
 *   server config's `["user:read", "channel:write"]` instead of extending
 *   them. They must be named every time. (The sign-in route concatenates, so
 *   this only bites on link.)
 *
 * The union is always built from `account.scope` — what was actually granted —
 * never from the caller's intent, so a link initiated for one feature cannot
 * silently revoke another's consent.
 */

export const PROVIDER_SCOPES = {
	twitch: {
		/** Appended to by better-auth; nothing to re-request. */
		base: [],
		chat: ["user:read:chat", "channel:manage:broadcast"],
		alerts: [
			"moderator:read:followers",
			"channel:read:subscriptions",
			"bits:read",
		],
		/** What a Twitch sender account needs to post. */
		chatWrite: ["user:write:chat"],
		/** What a broadcaster grants so VISP's shared bot may post in its chat. */
		botChannel: ["channel:bot"],
		channelWrite: "channel:manage:broadcast",
		/** The scope whose presence proves stream-key consent. */
		streamKey: "channel:read:stream_key",
		/** What a link call must request to obtain it. */
		streamKeyRequest: ["channel:read:stream_key"],
	},
	kick: {
		/** Mirrors the genericOAuth config in packages/auth; see the note above. */
		base: ["user:read", "channel:write"],
		chat: [],
		alerts: [],
		chatWrite: ["chat:write"],
		channelWrite: "channel:write",
		streamKey: "streamkey:read",
		// The key lives on GET /public/v1/channels, which is documented as
		// channel:read, so Direct needs both scopes to read it.
		streamKeyRequest: ["streamkey:read", "channel:read"],
	},
	youtube: {
		/** Google supplies identity scopes; Direct adds only YouTube access. */
		base: [],
		chat: ["https://www.googleapis.com/auth/youtube.readonly"],
		alerts: [],
		// liveChatMessages.insert rides on the same scope title edits use, so a
		// YouTube streamer who authorized Direct already granted this.
		chatWrite: ["https://www.googleapis.com/auth/youtube.force-ssl"],
		channelWrite: "https://www.googleapis.com/auth/youtube.force-ssl",
		streamKey: "https://www.googleapis.com/auth/youtube.force-ssl",
		streamKeyRequest: ["https://www.googleapis.com/auth/youtube.force-ssl"],
	},
} as const;

export type ScopeProvider = keyof typeof PROVIDER_SCOPES;

export function parseScopes(scope: string | null | undefined) {
	return scope?.split(/[ ,]+/).filter(Boolean) ?? [];
}

export function hasScope(scope: string | null | undefined, name: string) {
	return parseScopes(scope).includes(name);
}

/** Every scope in streamKeyRequest must be granted before Direct can fetch a key. */
export function hasStreamKeyScope(
	provider: ScopeProvider,
	scope: string | null | undefined,
) {
	return PROVIDER_SCOPES[provider].streamKeyRequest.every((name) =>
		hasScope(scope, name),
	);
}

/** Every scope the chat bot needs before it may post as this account. */
export function hasChatWriteScope(
	provider: ScopeProvider,
	scope: string | null | undefined,
) {
	return PROVIDER_SCOPES[provider].chatWrite.every((name) =>
		hasScope(scope, name),
	);
}

export function hasTwitchBotChannelScope(
	scope: string | null | undefined,
) {
	return PROVIDER_SCOPES.twitch.botChannel.every((name) =>
		hasScope(scope, name),
	);
}

export function hasChatScope(
	provider: ScopeProvider,
	scope: string | null | undefined,
) {
	if (provider === "kick") return true;
	if (provider === "twitch") return hasScope(scope, "user:read:chat");
	return (
		hasScope(scope, PROVIDER_SCOPES.youtube.chat[0]) ||
		hasScope(scope, PROVIDER_SCOPES.youtube.streamKey)
	);
}

export function hasAlertScope(
	provider: ScopeProvider,
	scope: string | null | undefined,
) {
	return PROVIDER_SCOPES[provider].alerts.every((name) =>
		hasScope(scope, name),
	);
}

/**
 * Scopes a link call must request: the provider's non-negotiable base, plus
 * everything already granted, plus whatever this call is for.
 */
export function linkScopes(
	provider: ScopeProvider,
	granted: readonly string[],
	adding: readonly string[] = [],
) {
	return [
		...new Set([...PROVIDER_SCOPES[provider].base, ...granted, ...adding]),
	];
}
