import { auth } from "@VISP/auth";
import { db } from "@VISP/db";
import { account, appUser } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, eq, inArray } from "drizzle-orm";
import { hasScope, PROVIDER_SCOPES } from "../scopes";

const KICK_API = "https://api.kick.com/public/v1";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
/** YouTube rejects longer broadcast titles; Twitch and Kick allow 140. */
const YOUTUBE_TITLE_MAX = 100;
const WRITE_SCOPES = {
	twitch: PROVIDER_SCOPES.twitch.channelWrite,
	kick: PROVIDER_SCOPES.kick.channelWrite,
	youtube: PROVIDER_SCOPES.youtube.channelWrite,
} as const;

type Provider = keyof typeof WRITE_SCOPES;
export type ViewerProvider = Provider;

export type ViewerCounts = Record<ViewerProvider, number | null>;

/** YouTube rides on the Google account row. */
function authProviderId(provider: Provider) {
	return provider === "youtube" ? "google" : provider;
}

type LinkedAccount = {
	provider: string;
	accountId: string;
	scope: string | null;
};

type StreamInfoDependencies = {
	fetch: typeof fetch;
	getAccessToken: (
		providerId: ViewerProvider,
		userId: string,
	) => Promise<{ accessToken: string }>;
	loadAccounts: (userId: string) => Promise<LinkedAccount[]>;
};

type UpdateDependencies = StreamInfoDependencies & {
	saveYoutubeTitle: (userId: string, title: string) => Promise<void>;
};

const defaultDependencies: UpdateDependencies = {
	fetch: globalThis.fetch,
	getAccessToken: (providerId, userId) =>
		auth.api.getAccessToken({
			body: { providerId: authProviderId(providerId), userId },
		}),
	saveYoutubeTitle: async (userId, title) => {
		await db
			.update(appUser)
			.set({ directYoutubeTitle: title })
			.where(eq(appUser.id, userId));
	},
	loadAccounts: (userId) =>
		db
			.select({
				provider: account.providerId,
				accountId: account.accountId,
				scope: account.scope,
			})
			.from(account)
			.where(
				and(
					eq(account.userId, userId),
					inArray(account.providerId, ["twitch", "kick", "google"]),
				),
			),
};

export function hasChannelWriteScope(
	provider: Provider,
	scope: string | null | undefined,
) {
	return hasScope(scope, WRITE_SCOPES[provider]);
}

function viewerCount(value: unknown) {
	const parsed =
		typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
	return Number.isSafeInteger(parsed) && Number(parsed) >= 0
		? Number(parsed)
		: null;
}

export async function getViewerCounts(
	userId: string,
	providers: readonly ViewerProvider[],
	dependencies: StreamInfoDependencies = defaultDependencies,
): Promise<ViewerCounts> {
	const accounts = await dependencies.loadAccounts(userId);
	const count = async (provider: ViewerProvider): Promise<number | null> => {
		const linked = accounts.find(
			(entry) => entry.provider === authProviderId(provider),
		);
		if (!linked) return null;
		try {
			const { accessToken } = await dependencies.getAccessToken(
				provider,
				userId,
			);
			if (provider === "youtube") {
				const broadcasts = await dependencies.fetch(
					"https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id&mine=true&broadcastStatus=active&broadcastType=all&maxResults=1",
					{ headers: { Authorization: `Bearer ${accessToken}` } },
				);
				if (!broadcasts.ok) return null;
				const active = (await broadcasts.json()) as {
					items?: Array<{ id?: unknown }>;
				};
				const broadcastId = active.items?.[0]?.id;
				if (typeof broadcastId !== "string") return 0;
				const videos = await dependencies.fetch(
					`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(broadcastId)}`,
					{ headers: { Authorization: `Bearer ${accessToken}` } },
				);
				if (!videos.ok) return null;
				const payload = (await videos.json()) as {
					items?: Array<{
						liveStreamingDetails?: { concurrentViewers?: unknown };
					}>;
				};
				return viewerCount(
					payload.items?.[0]?.liveStreamingDetails?.concurrentViewers,
				);
			}
			const response = await dependencies.fetch(
				provider === "twitch"
					? `https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(linked.accountId)}`
					: `${KICK_API}/channels`,
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
						...(provider === "twitch" && {
							"Client-Id": env.TWITCH_CLIENT_ID,
						}),
					},
				},
			);
			if (!response.ok) return null;
			const payload = (await response.json()) as {
				data?: Array<{
					viewer_count?: unknown;
					stream?: { is_live?: unknown; viewer_count?: unknown } | null;
				}>;
			};
			if (!Array.isArray(payload.data)) return null;
			if (provider === "twitch") {
				return payload.data.length === 0
					? 0
					: viewerCount(payload.data[0]?.viewer_count);
			}
			const stream = payload.data[0]?.stream;
			if (stream === null || stream?.is_live === false) return 0;
			if (!stream) return null;
			return stream.is_live === true ? viewerCount(stream.viewer_count) : null;
		} catch {
			return null;
		}
	};

	const entries = await Promise.all(
		[...new Set(providers)].map(
			async (provider) => [provider, await count(provider)] as const,
		),
	);
	return {
		twitch: null,
		kick: null,
		youtube: null,
		...Object.fromEntries(entries),
	};
}

export async function searchStreamCategories(
	userId: string,
	query: string,
	dependencies: StreamInfoDependencies = defaultDependencies,
) {
	const accounts = await dependencies.loadAccounts(userId);
	const search = async <T>(
		provider: Provider,
		request: (token: string) => Promise<T[]>,
	) => {
		if (!accounts.some((entry) => entry.provider === provider)) return null;
		try {
			const token = await dependencies.getAccessToken(provider, userId);
			return await request(token.accessToken);
		} catch {
			return [];
		}
	};
	const [twitch, kick] = await Promise.all([
		search("twitch", async (accessToken) => {
			const response = await dependencies.fetch(
				`https://api.twitch.tv/helix/search/categories?query=${encodeURIComponent(query)}&first=8`,
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
						"Client-Id": env.TWITCH_CLIENT_ID,
					},
				},
			);
			if (!response.ok) return [];
			const payload = (await response.json()) as {
				data?: Array<{ id: string; name: string }>;
			};
			return (payload.data ?? []).map(({ id, name }) => ({ id, name }));
		}),
		search("kick", async (accessToken) => {
			const response = await dependencies.fetch(
				`${KICK_API}/categories?q=${encodeURIComponent(query)}`,
				{ headers: { Authorization: `Bearer ${accessToken}` } },
			);
			if (!response.ok) return [];
			const payload = (await response.json()) as {
				data?: Array<{ id: number; name: string }>;
			};
			return (payload.data ?? []).map(({ id, name }) => ({ id, name }));
		}),
	]);
	return { twitch, kick };
}

export type StreamInfoUpdate = {
	title?: string;
	twitchCategoryId?: string;
	kickCategoryId?: number;
};

type UpdateResult = { provider: Provider; ok: boolean; error?: string };

type YoutubeSnippet = { description?: string; scheduledStartTime?: string };

/**
 * YouTube keeps the title on the broadcast, not the channel, so retitle the one
 * that is live — or the next scheduled one, which Direct creates ahead of going
 * live. The saved default is written either way so the next broadcast inherits
 * the change.
 */
async function updateYoutubeTitle(
	userId: string,
	title: string,
	scope: string | null,
	dependencies: UpdateDependencies,
): Promise<UpdateResult> {
	if (!hasChannelWriteScope("youtube", scope))
		return { provider: "youtube", ok: false, error: "consent-required" };
	const short = title.slice(0, YOUTUBE_TITLE_MAX);
	try {
		await dependencies.saveYoutubeTitle(userId, short);
		const { accessToken } = await dependencies.getAccessToken(
			"youtube",
			userId,
		);
		const headers = { Authorization: `Bearer ${accessToken}` };
		const find = async (status: "active" | "upcoming") => {
			const response = await dependencies.fetch(
				`${YOUTUBE_API}/liveBroadcasts?part=snippet&mine=true&broadcastStatus=${status}&broadcastType=all&maxResults=1`,
				{ headers },
			);
			if (!response.ok)
				throw new Error(`YouTube update failed (${response.status})`);
			const payload = (await response.json()) as {
				items?: Array<{ id?: string; snippet?: YoutubeSnippet }>;
			};
			return payload.items?.[0];
		};
		const broadcast = (await find("active")) ?? (await find("upcoming"));
		if (!broadcast?.id)
			return {
				provider: "youtube",
				ok: false,
				error: "No YouTube broadcast to update",
			};
		// part=snippet replaces the whole snippet, so carry over what stays.
		const response = await dependencies.fetch(
			`${YOUTUBE_API}/liveBroadcasts?part=snippet`,
			{
				method: "PUT",
				headers: { ...headers, "Content-Type": "application/json" },
				body: JSON.stringify({
					id: broadcast.id,
					snippet: {
						title: short,
						description: broadcast.snippet?.description,
						scheduledStartTime: broadcast.snippet?.scheduledStartTime,
					},
				}),
			},
		);
		if (!response.ok)
			return {
				provider: "youtube",
				ok: false,
				error: `YouTube update failed (${response.status})`,
			};
		return { provider: "youtube", ok: true };
	} catch (error) {
		return {
			provider: "youtube",
			ok: false,
			error: error instanceof Error ? error.message : "Update failed",
		};
	}
}

export async function updateStreamInfo(
	userId: string,
	input: StreamInfoUpdate,
	dependencies: UpdateDependencies = defaultDependencies,
) {
	const accounts = await dependencies.loadAccounts(userId);
	const update = async (
		provider: Provider,
		body: Record<string, unknown>,
		request: (token: string, accountId: string) => Promise<Response>,
	): Promise<UpdateResult | null> => {
		const linked = accounts.find((entry) => entry.provider === provider);
		if (!linked || Object.keys(body).length === 0) return null;
		if (!hasChannelWriteScope(provider, linked.scope))
			return { provider, ok: false, error: "consent-required" };
		try {
			const token = await dependencies.getAccessToken(provider, userId);
			const response = await request(token.accessToken, linked.accountId);
			if (!response.ok)
				return {
					provider,
					ok: false,
					error: `${provider === "twitch" ? "Twitch" : "Kick"} update failed (${response.status})`,
				};
			return { provider, ok: true };
		} catch (error) {
			return {
				provider,
				ok: false,
				error: error instanceof Error ? error.message : "Update failed",
			};
		}
	};
	const twitchBody = {
		...(input.title !== undefined && { title: input.title }),
		...(input.twitchCategoryId !== undefined && {
			game_id: input.twitchCategoryId,
		}),
	};
	const kickBody = {
		...(input.title !== undefined && { stream_title: input.title }),
		...(input.kickCategoryId !== undefined && {
			category_id: input.kickCategoryId,
		}),
	};
	const youtube = accounts.find(
		(entry) => entry.provider === authProviderId("youtube"),
	);
	const results = await Promise.all([
		update("twitch", twitchBody, (accessToken, accountId) =>
			dependencies.fetch(
				`https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(accountId)}`,
				{
					method: "PATCH",
					headers: {
						Authorization: `Bearer ${accessToken}`,
						"Client-Id": env.TWITCH_CLIENT_ID,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(twitchBody),
				},
			),
		),
		update("kick", kickBody, (accessToken) =>
			dependencies.fetch(`${KICK_API}/channels`, {
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(kickBody),
			}),
		),
		input.title !== undefined && youtube
			? updateYoutubeTitle(userId, input.title, youtube.scope, dependencies)
			: null,
	]);
	return results.filter((result) => result !== null);
}
