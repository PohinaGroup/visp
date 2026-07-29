import { auth } from "@VISP/auth";
import { db } from "@VISP/db";
import {
	account,
	appUser,
	pathState,
	relay,
	relayPath,
} from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { uniqueViolation } from "./pg-errors";
import { hasStreamKeyScope, parseScopes } from "./scopes";

export const DIRECT_PROVIDERS = ["twitch", "kick"] as const;
export type DirectProvider = (typeof DIRECT_PROVIDERS)[number];

/** Reported by the relay; `stopped` is also what a not-ready path settles to. */
export const DIRECT_STATES = [
	"starting",
	"live",
	"retrying",
	"failed",
	"stopped",
] as const;
export type DirectState = (typeof DIRECT_STATES)[number];

/** States that occupy a slot against DIRECT_MAX_FORWARDERS. */
const ACTIVE_STATES = sql`('starting', 'live', 'retrying')`;

const KICK_API = "https://api.kick.com/public/v1";

// ponytail: Twitch's _id 0 ingest auto-routes to the nearest region, so there
// is nothing to select. Fetch https://ingest.twitch.tv/ingests and pick by
// availability only if a stream ever needs pinning to one region.
const TWITCH_INGEST = "rtmps://ingest.global-contribute.live-video.net/app";

export class DirectError extends Error {
	constructor(
		readonly code:
			| "not-allowed"
			| "not-found"
			| "path-live"
			| "provider-taken"
			| "consent-required",
		message: string,
	) {
		super(message);
	}
}

/**
 * The only admission control Direct has. When Direct starts charging this
 * checks a subscription instead, and its three call sites do not move:
 * configuration mutations, stream-key retrieval, and destination resolution.
 */
export async function canUseDirect(userId: string) {
	const [owner] = await db
		.select({ directBeta: appUser.directBeta })
		.from(appUser)
		.where(eq(appUser.id, userId))
		.limit(1);
	return owner?.directBeta === true;
}

/**
 * Destination URLs and stream keys must never reach a log line or an error
 * message. Anything that looks like a URL is dropped rather than masked.
 */
export function sanitizeDirectError(value: string | null | undefined) {
	if (!value) return null;
	const cleaned = value
		.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, "[url]")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned.slice(0, 200) || null;
}

type DirectDependencies = {
	fetch: typeof fetch;
	getAccessToken: (
		providerId: DirectProvider,
		userId: string,
	) => Promise<{ accessToken: string }>;
	maxForwarders?: number;
};

const defaultDependencies: DirectDependencies = {
	fetch: globalThis.fetch,
	getAccessToken: (providerId, userId) =>
		auth.api.getAccessToken({ body: { providerId, userId } }),
};

/**
 * Builds the full RTMPS destination in memory. The key is never returned to a
 * client app and never stored as a separate database value.
 */
export async function streamKeyDestination(
	provider: DirectProvider,
	userId: string,
	accountId: string,
	dependencies: DirectDependencies,
) {
	const { accessToken } = await dependencies.getAccessToken(provider, userId);
	if (provider === "twitch") {
		const response = await dependencies.fetch(
			`https://api.twitch.tv/helix/streams/key?broadcaster_id=${encodeURIComponent(accountId)}`,
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Client-Id": env.TWITCH_CLIENT_ID,
				},
			},
		);
		if (!response.ok) {
			throw new DirectError(
				"consent-required",
				"Twitch stream key permission is required",
			);
		}
		const payload = (await response.json()) as {
			data?: Array<{ stream_key?: string }>;
		};
		const key = payload.data?.[0]?.stream_key;
		if (!key) {
			throw new DirectError(
				"consent-required",
				"Twitch did not return a stream key",
			);
		}
		return `${TWITCH_INGEST}/${key}`;
	}

	// Kick returns the authenticated user's channel when no query is given.
	// `stream.url` is the ingest server and `stream.key` the key; both are only
	// populated once streamkey:read has been granted.
	const response = await dependencies.fetch(`${KICK_API}/channels`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!response.ok) {
		throw new DirectError(
			"consent-required",
			"Kick stream key permission is required",
		);
	}
	const payload = (await response.json()) as {
		data?: Array<{ stream?: { key?: string; url?: string } }>;
	};
	const stream = payload.data?.[0]?.stream;
	if (!stream?.key || !stream.url) {
		throw new DirectError(
			"consent-required",
			"Kick did not return a stream key",
		);
	}
	return `${stream.url.replace(/\/+$/, "")}/${stream.key}`;
}

export async function listDirectOutputs(userId: string) {
	const [betaEnabled, accounts, paths] = await Promise.all([
		canUseDirect(userId),
		db
			.select({ provider: account.providerId, scope: account.scope })
			.from(account)
			.where(
				and(
					eq(account.userId, userId),
					inArray(account.providerId, [...DIRECT_PROVIDERS]),
				),
			),
		db
			.select({
				id: relayPath.id,
				label: relayPath.label,
				twitch: relayPath.directTwitch,
				kick: relayPath.directKick,
				publishing: pathState.publishing,
				twitchState: pathState.directTwitchState,
				twitchError: pathState.directTwitchError,
				kickState: pathState.directKickState,
				kickError: pathState.directKickError,
			})
			.from(relayPath)
			.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
			.where(and(eq(relayPath.userId, userId), isNull(relayPath.revokedAt)))
			.orderBy(relayPath.seq),
	]);

	return {
		betaEnabled,
		providers: DIRECT_PROVIDERS.map((provider) => {
			const linked = accounts.find((entry) => entry.provider === provider);
			return {
				provider,
				linked: Boolean(linked),
				// Same shape as hasChannelWriteScope: a floor for building the link
				// request, never proof the provider still honours it.
				canReadStreamKey:
					Boolean(linked) && hasStreamKeyScope(provider, linked?.scope),
				grantedScopes: parseScopes(linked?.scope),
			};
		}),
		paths: paths.map((path) => ({
			id: path.id,
			label: path.label,
			publishing: path.publishing ?? false,
			twitch: path.twitch,
			kick: path.kick,
			state: {
				twitch: (path.twitchState as DirectState | null) ?? null,
				kick: (path.kickState as DirectState | null) ?? null,
			},
			error: { twitch: path.twitchError, kick: path.kickError },
		})),
	};
}

/**
 * Saved per device and changeable only while that device is offline. One path
 * may own a given provider at a time; Twitch on one device and Kick on another
 * is permitted.
 */
export async function setDirectOutputs(
	userId: string,
	pathId: number,
	outputs: { twitch: boolean; kick: boolean },
) {
	if (!(await canUseDirect(userId))) {
		throw new DirectError("not-allowed", "VISP Direct is in limited beta");
	}

	const [path] = await db
		.select({ id: relayPath.id, publishing: pathState.publishing })
		.from(relayPath)
		.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
		.where(
			and(
				eq(relayPath.id, pathId),
				eq(relayPath.userId, userId),
				isNull(relayPath.revokedAt),
			),
		)
		.limit(1);
	if (!path) throw new DirectError("not-found", "Publishing device not found");
	if (path.publishing) {
		throw new DirectError(
			"path-live",
			"Stop this device before changing its Direct outputs",
		);
	}

	try {
		await db
			.update(relayPath)
			.set({ directTwitch: outputs.twitch, directKick: outputs.kick })
			.where(and(eq(relayPath.id, pathId), eq(relayPath.userId, userId)));
	} catch (error) {
		// The partial unique indexes are the real guard; this only names which
		// provider is already spoken for.
		const taken = uniqueViolation(error);
		if (taken !== null) {
			throw new DirectError(
				"provider-taken",
				`Another device already streams to ${taken.includes("kick") ? "Kick" : "Twitch"}`,
			);
		}
		throw error;
	}
	return { pathId, ...outputs };
}

/** A revoked path owns no provider, which frees the owner's slot. */
export async function clearDirectOutputs(pathId: number) {
	await db
		.update(relayPath)
		.set({ directTwitch: false, directKick: false })
		.where(eq(relayPath.id, pathId));
}

export async function applyDirectState(input: {
	slug: string;
	provider: DirectProvider;
	state: DirectState;
	error?: string | null;
}) {
	const [path] = await db
		.select({ id: relayPath.id })
		.from(relayPath)
		.where(eq(relayPath.slug, input.slug))
		.limit(1);
	if (!path) return false;

	const columns =
		input.provider === "twitch"
			? {
					directTwitchState: input.state,
					directTwitchError: sanitizeDirectError(input.error),
				}
			: {
					directKickState: input.state,
					directKickError: sanitizeDirectError(input.error),
				};
	await db
		.insert(pathState)
		.values({ pathId: path.id, lastEventAt: new Date(), ...columns })
		.onConflictDoUpdate({ target: pathState.pathId, set: columns });
	return true;
}

/** Every forwarder is a full distribution encode, so this is what saturates the node. */
async function activeForwarderCount(relayId: number, excludePathId: number) {
	const [row] = await db
		.select({
			count: sql<number>`
				count(*) filter (where ${pathState.directTwitchState} in ${ACTIVE_STATES})
				+ count(*) filter (where ${pathState.directKickState} in ${ACTIVE_STATES})
			`.mapWith(Number),
		})
		.from(pathState)
		.innerJoin(relayPath, eq(relayPath.id, pathState.pathId))
		.where(
			and(eq(relayPath.relayId, relayId), ne(pathState.pathId, excludePathId)),
		);
	return row?.count ?? 0;
}

export type DirectDestination = { provider: DirectProvider; url: string };

/**
 * Called by the relay when a path becomes ready. Returns the destinations the
 * relay should distribution-encode to — there is no per-destination copy
 * decision, and Twitch+Kick consumes two cap slots.
 */
export async function resolveDirectDestinations(
	slug: string,
	dependencies: DirectDependencies = defaultDependencies,
): Promise<{ destinations: DirectDestination[] }> {
	const [path] = await db
		.select({
			id: relayPath.id,
			userId: relayPath.userId,
			twitch: relayPath.directTwitch,
			kick: relayPath.directKick,
			relayId: relayPath.relayId,
			maxForwarders: relay.maxForwarders,
		})
		.from(relayPath)
		.innerJoin(relay, eq(relay.id, relayPath.relayId))
		.where(and(eq(relayPath.slug, slug), isNull(relayPath.revokedAt)))
		.limit(1);
	const enabled = path
		? DIRECT_PROVIDERS.filter((provider) => path[provider])
		: [];
	if (!path || enabled.length === 0) return { destinations: [] };

	if (!(await canUseDirect(path.userId))) {
		for (const provider of enabled) {
			await applyDirectState({
				slug,
				provider,
				state: "failed",
				error: "VISP Direct is in limited beta",
			});
		}
		return { destinations: [] };
	}

	const accounts = await db
		.select({ provider: account.providerId, accountId: account.accountId })
		.from(account)
		.where(
			and(
				eq(account.userId, path.userId),
				inArray(account.providerId, [...enabled]),
			),
		);

	let free =
		(dependencies.maxForwarders ?? path.maxForwarders) -
		(await activeForwarderCount(path.relayId, path.id));
	const destinations: DirectDestination[] = [];
	for (const provider of enabled) {
		if (free <= 0) {
			await applyDirectState({
				slug,
				provider,
				state: "failed",
				error: "Direct is at capacity, try again shortly",
			});
			console.warn("direct capacity refusal", { provider, slug });
			continue;
		}
		const linked = accounts.find((entry) => entry.provider === provider);
		if (!linked) {
			await applyDirectState({
				slug,
				provider,
				state: "failed",
				error: `Link ${provider === "twitch" ? "Twitch" : "Kick"} first`,
			});
			continue;
		}
		try {
			destinations.push({
				provider,
				url: await streamKeyDestination(
					provider,
					path.userId,
					linked.accountId,
					dependencies,
				),
			});
			free -= 1;
			await applyDirectState({
				slug,
				provider,
				state: "starting",
				error: null,
			});
		} catch (error) {
			// Never surface the provider's response body; it can carry the key.
			await applyDirectState({
				slug,
				provider,
				state: "failed",
				error:
					error instanceof DirectError
						? error.message
						: "Could not start this destination",
			});
		}
	}
	return { destinations };
}

/** Called when paths go not-ready, so no slot stays counted after teardown. */
export async function stopDirectForPaths(pathIds: number[]) {
	if (pathIds.length === 0) return;
	await db
		.update(pathState)
		.set({
			directTwitchState: sql`case when ${pathState.directTwitchState} in ${ACTIVE_STATES} then 'stopped' else ${pathState.directTwitchState} end`,
			directKickState: sql`case when ${pathState.directKickState} in ${ACTIVE_STATES} then 'stopped' else ${pathState.directKickState} end`,
		})
		.where(inArray(pathState.pathId, pathIds));
}
