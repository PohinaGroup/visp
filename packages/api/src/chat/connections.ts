import { db } from "@VISP/db";
import { account, chatConnection } from "@VISP/db/schema/index";
import { and, eq, inArray } from "drizzle-orm";
import { hasChannelWriteScope } from "../channel/stream-info";
import { hasScope, PROVIDER_SCOPES, parseScopes } from "../scopes";
import type { ChatProvider } from "./contract";
import { chatHub } from "./hub";
import { createKickSubscription, deleteKickSubscription } from "./kick";
import { twitchConnectors } from "./twitch";

const PROVIDERS = ["twitch", "kick"] as const;

export class ChatConnectionError extends Error {
	constructor(
		readonly code: "not-linked" | "twitch-consent-required",
		message: string,
	) {
		super(message);
	}
}

export async function listChatConnections(userId: string) {
	const [accounts, enabled] = await Promise.all([
		db
			.select({ provider: account.providerId, scope: account.scope })
			.from(account)
			.where(
				and(
					eq(account.userId, userId),
					inArray(account.providerId, [...PROVIDERS]),
				),
			),
		db
			.select({ provider: chatConnection.provider })
			.from(chatConnection)
			.where(eq(chatConnection.userId, userId)),
	]);
	const enabledProviders = new Set(
		enabled.map((connection) => connection.provider),
	);
	return PROVIDERS.map((provider) => {
		const linked = accounts.find((entry) => entry.provider === provider);
		return {
			provider,
			linked: Boolean(linked),
			enabled: enabledProviders.has(provider),
			// What the provider actually granted. Link calls build their scope
			// request from this, never from the caller's intent.
			grantedScopes: parseScopes(linked?.scope),
			needsConsent:
				provider === "twitch" &&
				Boolean(linked) &&
				!hasScope(linked?.scope, "user:read:chat"),
			canManageChannel:
				Boolean(linked) && hasChannelWriteScope(provider, linked?.scope),
			canReadStreamKey:
				Boolean(linked) &&
				hasScope(linked?.scope, PROVIDER_SCOPES[provider].streamKey),
		};
	});
}

export async function enableChatConnection(
	userId: string,
	provider: ChatProvider,
) {
	const linked = await db.query.account.findFirst({
		where: and(eq(account.userId, userId), eq(account.providerId, provider)),
	});
	if (!linked)
		throw new ChatConnectionError("not-linked", `Link ${provider} first`);
	if (provider === "twitch" && !hasScope(linked.scope, "user:read:chat")) {
		throw new ChatConnectionError(
			"twitch-consent-required",
			"Twitch chat permission is required",
		);
	}
	const existing = await db.query.chatConnection.findFirst({
		where: and(
			eq(chatConnection.userId, userId),
			eq(chatConnection.provider, provider),
		),
	});
	if (existing) {
		if (provider === "twitch") await twitchConnectors.refresh(userId);
		else chatHub.status(userId, "kick", "connected");
		return existing;
	}
	if (provider === "twitch") {
		const [created] = await db
			.insert(chatConnection)
			.values({ userId, provider })
			.onConflictDoNothing()
			.returning();
		const connection =
			created ??
			(await db.query.chatConnection.findFirst({
				where: and(
					eq(chatConnection.userId, userId),
					eq(chatConnection.provider, provider),
				),
			}));
		await twitchConnectors.refresh(userId);
		return connection;
	}
	const subscriptionId = await createKickSubscription(linked.accountId);
	try {
		const [created] = await db
			.insert(chatConnection)
			.values({ userId, provider, kickSubscriptionId: subscriptionId })
			.onConflictDoNothing()
			.returning();
		if (created) {
			chatHub.status(userId, "kick", "connected");
			return created;
		}
		await deleteKickSubscription(subscriptionId).catch(() => undefined);
		const connection = await db.query.chatConnection.findFirst({
			where: and(
				eq(chatConnection.userId, userId),
				eq(chatConnection.provider, provider),
			),
		});
		if (connection) chatHub.status(userId, "kick", "connected");
		return connection;
	} catch (error) {
		await deleteKickSubscription(subscriptionId).catch(() => undefined);
		throw error;
	}
}

export async function disableChatConnection(
	userId: string,
	provider: ChatProvider,
) {
	const [removed] = await db
		.delete(chatConnection)
		.where(
			and(
				eq(chatConnection.userId, userId),
				eq(chatConnection.provider, provider),
			),
		)
		.returning();
	if (removed?.kickSubscriptionId) {
		await deleteKickSubscription(removed.kickSubscriptionId).catch(
			() => undefined,
		);
	}
	if (provider === "twitch") await twitchConnectors.refresh(userId);
	else chatHub.status(userId, "kick", "disconnected");
	return { disabled: Boolean(removed) };
}
