import { auth } from "@VISP/auth";
import { env } from "@VISP/env/server";

const TTL_MS = 60 * 60_000;
const MAX_CACHE_ENTRIES = 256;
const cache = new Map<
	string,
	{ expiresAt: number; badges: Map<string, string> }
>();

type TwitchBadgeDependencies = {
	fetch: typeof fetch;
	getAccessToken: (userId: string) => Promise<{ accessToken: string }>;
	now?: () => number;
};

type TwitchBadgeResponse = {
	data?: Array<{
		set_id?: string;
		versions?: Array<{ id?: string; image_url_2x?: string }>;
	}>;
};

export async function loadTwitchBadges(
	userId: string,
	broadcasterId: string,
	dependencies: TwitchBadgeDependencies = {
		fetch: globalThis.fetch,
		getAccessToken: (id) =>
			auth.api.getAccessToken({ body: { providerId: "twitch", userId: id } }),
	},
) {
	const now = dependencies.now?.() ?? Date.now();
	for (const [key, value] of cache) {
		if (value.expiresAt <= now) cache.delete(key);
	}
	const cached = cache.get(broadcasterId);
	if (cached && cached.expiresAt > now) return cached.badges;
	try {
		const { accessToken } = await dependencies.getAccessToken(userId);
		const headers = {
			Authorization: `Bearer ${accessToken}`,
			"Client-Id": env.TWITCH_CLIENT_ID,
		};
		const responses = await Promise.all([
			dependencies.fetch("https://api.twitch.tv/helix/chat/badges/global", {
				headers,
			}),
			dependencies.fetch(
				`https://api.twitch.tv/helix/chat/badges?${new URLSearchParams({ broadcaster_id: broadcasterId })}`,
				{ headers },
			),
		]);
		if (responses.some((response) => !response.ok)) return new Map();
		const payloads = (await Promise.all(
			responses.map((response) => response.json()),
		)) as TwitchBadgeResponse[];
		const badges = new Map<string, string>();
		for (const set of payloads.flatMap((payload) => payload.data ?? [])) {
			if (!set.set_id) continue;
			for (const version of set.versions ?? []) {
				if (version.id && version.image_url_2x) {
					badges.set(`${set.set_id}/${version.id}`, version.image_url_2x);
				}
			}
		}
		if (cache.size >= MAX_CACHE_ENTRIES) {
			// ponytail: FIFO is enough at this scale; use LRU if broadcaster churn becomes hot.
			const oldest = cache.keys().next().value;
			if (oldest) cache.delete(oldest);
		}
		cache.set(broadcasterId, { expiresAt: now + TTL_MS, badges });
		return badges;
	} catch {
		return new Map();
	}
}
