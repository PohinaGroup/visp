import { db } from "@VISP/db";
import { account, chatConnection } from "@VISP/db/schema/index";
import { and, eq, inArray } from "drizzle-orm";
import { hasChannelWriteScope } from "../channel/stream-info";
import {
	hasAlertScope,
	hasChatScope,
	hasStreamKeyScope,
	parseScopes,
} from "../scopes";
import { type ChatProvider, chatAuthProvider } from "./contract";
import { chatHub } from "./hub";
import {
	createKickSubscription,
	deleteKickSubscription,
	deleteKickSubscriptionsForBroadcaster,
} from "./kick";

const PROVIDERS = ["twitch", "kick", "youtube"] as const;

export { chatAuthProvider };

export class ChatConnectionError extends Error {
	constructor(
		readonly code: "not-linked" | "consent-required",
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
					inArray(account.providerId, ["twitch", "kick", "google"]),
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
		const linked = accounts.find(
			(entry) => entry.provider === chatAuthProvider(provider),
		);
		return {
			provider,
			linked: Boolean(linked),
			enabled: enabledProviders.has(provider),
			// What the provider actually granted. Link calls build their scope
			// request from this, never from the caller's intent.
			grantedScopes: parseScopes(linked?.scope),
			needsConsent: Boolean(linked) && !hasChatScope(provider, linked?.scope),
			needsAlertConsent:
				Boolean(linked) && !hasAlertScope(provider, linked?.scope),
			canManageChannel:
				Boolean(linked) && hasChannelWriteScope(provider, linked?.scope),
			canReadStreamKey:
				Boolean(linked) && hasStreamKeyScope(provider, linked?.scope),
		};
	});
}

export async function enableChatConnection(
	userId: string,
	provider: ChatProvider,
) {
	const linked = await db.query.account.findFirst({
		where: and(
			eq(account.userId, userId),
			eq(account.providerId, chatAuthProvider(provider)),
		),
	});
	if (!linked)
		throw new ChatConnectionError("not-linked", `Link ${provider} first`);
	if (!hasChatScope(provider, linked.scope)) {
		throw new ChatConnectionError(
			"consent-required",
			`${provider === "twitch" ? "Twitch" : "YouTube"} chat permission is required`,
		);
	}
	const existing = await db.query.chatConnection.findFirst({
		where: and(
			eq(chatConnection.userId, userId),
			eq(chatConnection.provider, provider),
		),
	});
	if (existing) {
		if (provider !== "kick") chatHub.requestConnectorRefresh(userId);
		else chatHub.status(userId, "kick", "connected");
		return existing;
	}
	if (provider !== "kick") {
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
		chatHub.requestConnectorRefresh(userId);
		return connection;
	}
	const subscriptions = await createKickSubscription(linked.accountId);
	const subscriptionId = subscriptions.get("chat.message.sent");
	if (!subscriptionId)
		throw new Error("Kick chat subscription response was invalid");
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
		await Promise.all(
			[...subscriptions.values()].map((id) =>
				deleteKickSubscription(id).catch(() => undefined),
			),
		);
		const connection = await db.query.chatConnection.findFirst({
			where: and(
				eq(chatConnection.userId, userId),
				eq(chatConnection.provider, provider),
			),
		});
		if (connection) chatHub.status(userId, "kick", "connected");
		return connection;
	} catch (error) {
		await Promise.all(
			[...subscriptions.values()].map((id) =>
				deleteKickSubscription(id).catch(() => undefined),
			),
		);
		throw error;
	}
}

export async function disableChatConnection(
	userId: string,
	provider: ChatProvider,
) {
	const linked =
		provider === "kick"
			? await db.query.account.findFirst({
					where: and(
						eq(account.userId, userId),
						eq(account.providerId, "kick"),
					),
				})
			: undefined;
	const [removed] = await db
		.delete(chatConnection)
		.where(
			and(
				eq(chatConnection.userId, userId),
				eq(chatConnection.provider, provider),
			),
		)
		.returning();
	if (removed && linked) {
		await deleteKickSubscriptionsForBroadcaster(linked.accountId).catch(
			() => undefined,
		);
	}
	if (provider !== "kick") chatHub.requestConnectorRefresh(userId);
	else chatHub.status(userId, "kick", "disconnected");
	return { disabled: Boolean(removed) };
}
