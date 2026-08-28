export const FIRST_LIVE_POLL_MS = 3_000;
type DirectProvider = "twitch" | "kick" | "youtube";
const DIRECT_PROVIDERS = ["twitch", "kick", "youtube"] as const;

type DirectPathFlags = {
	twitch: boolean;
	kick: boolean;
	youtube: boolean;
	state: Record<DirectProvider, string | null>;
};

/** Providers that just reached live and have not been reported yet. */
export function firstLiveProvidersToTrack(
	path: DirectPathFlags | undefined,
	tracked: ReadonlySet<DirectProvider>,
): DirectProvider[] {
	if (!path) return [];
	return DIRECT_PROVIDERS.filter((provider) => {
		if (!path[provider] || path.state[provider] !== "live") return false;
		return !tracked.has(provider);
	});
}
