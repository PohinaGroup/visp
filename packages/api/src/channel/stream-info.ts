import { auth } from "@VISP/auth";
import { db } from "@VISP/db";
import { account } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, eq, inArray } from "drizzle-orm";
import { hasScope, PROVIDER_SCOPES } from "../scopes";

const KICK_API = "https://api.kick.com/public/v1";
const WRITE_SCOPES = {
	twitch: PROVIDER_SCOPES.twitch.channelWrite,
	kick: PROVIDER_SCOPES.kick.channelWrite,
} as const;

type Provider = keyof typeof WRITE_SCOPES;

export type ViewerCounts = Record<Provider, number | null>;

type LinkedAccount = {
	provider: string;
	accountId: string;
	scope: string | null;
};

type StreamInfoDependencies = {
	fetch: typeof fetch;
	getAccessToken: (
		providerId: Provider,
		userId: string,
	) => Promise<{ accessToken: string }>;
	loadAccounts: (userId: string) => Promise<LinkedAccount[]>;
};

const defaultDependencies: StreamInfoDependencies = {
	fetch: globalThis.fetch,
	getAccessToken: (providerId, userId) =>
		auth.api.getAccessToken({ body: { providerId, userId } }),
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
					inArray(account.providerId, Object.keys(WRITE_SCOPES)),
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
	return Number.isSafeInteger(value) && Number(value) >= 0
		? Number(value)
		: null;
}

export async function getViewerCounts(
	userId: string,
	providers: readonly Provider[],
	dependencies: StreamInfoDependencies = defaultDependencies,
): Promise<ViewerCounts> {
	const accounts = await dependencies.loadAccounts(userId);
	const count = async (provider: Provider): Promise<number | null> => {
		const linked = accounts.find((entry) => entry.provider === provider);
		if (!linked) return null;
		try {
			const { accessToken } = await dependencies.getAccessToken(
				provider,
				userId,
			);
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
	return { twitch: null, kick: null, ...Object.fromEntries(entries) };
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

export async function updateStreamInfo(
	userId: string,
	input: StreamInfoUpdate,
	dependencies: StreamInfoDependencies = defaultDependencies,
) {
	const accounts = await dependencies.loadAccounts(userId);
	const update = async (
		provider: Provider,
		body: Record<string, unknown>,
		request: (token: string, accountId: string) => Promise<Response>,
	): Promise<{ provider: Provider; ok: boolean; error?: string } | null> => {
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
	]);
	return results.filter((result) => result !== null);
}
