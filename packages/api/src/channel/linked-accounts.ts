import { auth } from "@VISP/auth";
import { db } from "@VISP/db";
import { account } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, eq, inArray } from "drizzle-orm";
import { hasChatScope, hasStreamKeyScope } from "../scopes";
import { hasChannelWriteScope } from "./stream-info";

const PROVIDERS = ["twitch", "kick", "youtube"] as const;

type Provider = (typeof PROVIDERS)[number];

/** YouTube rides on the Google account row. */
function authProviderId(provider: Provider) {
	return provider === "youtube" ? "google" : provider;
}

type StoredAccount = {
	provider: string;
	accountId: string;
	scope: string | null;
	createdAt: Date;
};

export type LinkedAccount = {
	provider: Provider;
	linked: boolean;
	linkedAt?: string;
	accountId?: string;
	/** Display name on the provider — channel name, Google profile name. */
	name?: string;
	email?: string;
	canChat: boolean;
	canManageChannel: boolean;
	canReadStreamKey: boolean;
	/** `reauthorize` means the stored token no longer works. */
	status: "not-linked" | "linked" | "reauthorize" | "unreachable";
};

type Identity = { name?: string; email?: string };

type Dependencies = {
	fetch: typeof fetch;
	getAccessToken: (
		provider: Provider,
		userId: string,
	) => Promise<{ accessToken: string }>;
	loadAccounts: (userId: string) => Promise<StoredAccount[]>;
};

const defaultDependencies: Dependencies = {
	fetch: globalThis.fetch,
	getAccessToken: (provider, userId) =>
		auth.api.getAccessToken({
			body: { providerId: authProviderId(provider), userId },
		}),
	loadAccounts: (userId) =>
		db
			.select({
				provider: account.providerId,
				accountId: account.accountId,
				scope: account.scope,
				createdAt: account.createdAt,
			})
			.from(account)
			.where(
				and(
					eq(account.userId, userId),
					inArray(account.providerId, ["twitch", "kick", "google"]),
				),
			),
};

function text(value: unknown) {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

const IDENTITY_REQUEST: Record<
	Provider,
	{ url: string; headers: (token: string) => Record<string, string> }
> = {
	twitch: {
		url: "https://api.twitch.tv/helix/users",
		headers: (token) => ({
			Authorization: `Bearer ${token}`,
			"Client-Id": env.TWITCH_CLIENT_ID,
		}),
	},
	kick: {
		url: "https://api.kick.com/public/v1/users",
		headers: (token) => ({ Authorization: `Bearer ${token}` }),
	},
	youtube: {
		url: "https://www.googleapis.com/oauth2/v3/userinfo",
		headers: (token) => ({ Authorization: `Bearer ${token}` }),
	},
};

function readIdentity(provider: Provider, payload: unknown): Identity {
	if (provider === "youtube") {
		const profile = payload as { name?: unknown; email?: unknown };
		return { name: text(profile.name), email: text(profile.email) };
	}
	const entry = (payload as { data?: Array<Record<string, unknown>> })
		?.data?.[0];
	if (!entry) return {};
	return {
		name: text(
			provider === "twitch" ? (entry.display_name ?? entry.login) : entry.name,
		),
		email: text(entry.email),
	};
}

/**
 * Provider profiles are not stored — better-auth's account row keeps only the
 * provider's user id — so identity is read live with the linked token. That
 * doubles as the token health check the Account screen shows.
 */
async function fetchIdentity(
	provider: Provider,
	userId: string,
	dependencies: Dependencies,
): Promise<{ identity: Identity; status: LinkedAccount["status"] }> {
	try {
		const { accessToken } = await dependencies.getAccessToken(provider, userId);
		const request = IDENTITY_REQUEST[provider];
		const response = await dependencies.fetch(request.url, {
			headers: request.headers(accessToken),
		});
		if (response.status === 401 || response.status === 403)
			return { identity: {}, status: "reauthorize" };
		if (!response.ok) return { identity: {}, status: "unreachable" };
		return {
			identity: readIdentity(provider, await response.json()),
			status: "linked",
		};
	} catch {
		// A refresh failure is the usual cause, and re-linking is the fix.
		return { identity: {}, status: "reauthorize" };
	}
}

export async function listLinkedAccounts(
	userId: string,
	dependencies: Dependencies = defaultDependencies,
): Promise<LinkedAccount[]> {
	const accounts = await dependencies.loadAccounts(userId);
	return Promise.all(
		PROVIDERS.map(async (provider) => {
			const linked = accounts.find(
				(entry) => entry.provider === authProviderId(provider),
			);
			if (!linked)
				return {
					provider,
					linked: false,
					canChat: false,
					canManageChannel: false,
					canReadStreamKey: false,
					status: "not-linked" as const,
				};
			const { identity, status } = await fetchIdentity(
				provider,
				userId,
				dependencies,
			);
			return {
				provider,
				linked: true,
				linkedAt: linked.createdAt.toISOString(),
				accountId: linked.accountId,
				...identity,
				canChat: hasChatScope(provider, linked.scope),
				canManageChannel: hasChannelWriteScope(provider, linked.scope),
				canReadStreamKey: hasStreamKeyScope(provider, linked.scope),
				status,
			};
		}),
	);
}
