import { auth } from "@VISP/auth";
import { db } from "@VISP/db";
import {
	account,
	appUser,
	customDirectDestination,
	customDirectOutput,
	directDestination,
	pathState,
	relay,
	relayPath,
} from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { cleanupDeletedBrbHighlightsForPath } from "./brb-highlights";
import { type DirectCrop, directCropError } from "./direct-crop";
import {
	applyCustomDirectState,
	customDestinationAad,
	listCustomDirectOutputs,
} from "./direct-custom";
import {
	type HostResolver,
	resolveHost,
	validateCustomDestinationForStorage,
} from "./direct-custom-destination";
import { validateDirectDestination } from "./direct-destination";
import {
	DIRECT_PROVIDERS,
	DIRECT_RESERVATION_MS,
	DirectError,
	type DirectHookV3Destination,
	type DirectProvider,
	type DirectRole,
	type DirectState,
} from "./direct-model";
import { DIRECT_OCCUPIED_STATES_SQL } from "./direct-occupancy";
import {
	applyPortraitState,
	listPortraitDestinations,
	listRelayPortraitDestinations,
	portraitDestinationActive,
	portraitFilterValue,
} from "./direct-portrait";
import { decryptSecret } from "./encrypted-secret";
import { trackRybbitEvent } from "./rybbit";
import { hasStreamKeyScope, parseScopes } from "./scopes";

export type { DirectCrop } from "./direct-crop";
export {
	DIRECT_PROVIDERS,
	DIRECT_STATES,
	DirectError,
	type DirectProvider,
	type DirectRole,
	type DirectState,
} from "./direct-model";
export { saveDirectCrop, setDirectRole } from "./direct-portrait";

type AuthProvider = "twitch" | "kick" | "google";

/**
 * States that occupy a slot against DIRECT_MAX_FORWARDERS. A BRB forwarder
 * still runs a full x264 encode, so it counts exactly like a live one.
 */
const KICK_API = "https://api.kick.com/public/v1";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const YOUTUBE_AUTH_PROVIDER = "google" as const;

// ponytail: Twitch's _id 0 ingest auto-routes to the nearest region, so there
// is nothing to select. Fetch https://ingest.twitch.tv/ingests and pick by
// availability only if a stream ever needs pinning to one region.
const TWITCH_INGEST = "rtmps://ingest.global-contribute.live-video.net/app";

export function validateDirectCrop(crop: DirectCrop): DirectCrop {
	const error = directCropError(crop);
	if (error) throw new DirectError("invalid", error);
	return crop;
}

export function portraitFilter(crop: DirectCrop) {
	return portraitFilterValue(crop);
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
	fetch: (
		input: string | URL | Request,
		init?: RequestInit,
	) => Promise<Response>;
	getAccessToken: (
		providerId: AuthProvider,
		userId: string,
	) => Promise<{ accessToken: string }>;
	maxForwarders?: number;
	resolveHost?: HostResolver;
};

function authProvider(provider: DirectProvider): AuthProvider {
	return provider === "youtube" ? YOUTUBE_AUTH_PROVIDER : provider;
}

const defaultDependencies: DirectDependencies = {
	fetch: (...args) => globalThis.fetch(...args),
	getAccessToken: (providerId, userId) =>
		auth.api.getAccessToken({ body: { providerId, userId } }),
	resolveHost,
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
	const { accessToken } = await dependencies.getAccessToken(
		authProvider(provider),
		userId,
	);
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

	if (provider === "youtube") {
		throw new DirectError(
			"consent-required",
			"YouTube destination needs a managed broadcast",
		);
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
	return kickIngestDestination(stream.url, stream.key);
}

type YoutubeStream = {
	id: string;
	cdn?: {
		ingestionInfo?: {
			rtmpsIngestionAddress?: string;
			streamName?: string;
		};
	};
};

type YoutubeBroadcast = {
	id: string;
	contentDetails?: { boundStreamId?: string };
	status?: { lifeCycleStatus?: string };
};

async function youtubeRequest(
	dependencies: DirectDependencies,
	accessToken: string,
	path: string,
	init?: RequestInit,
) {
	const response = await dependencies.fetch(`${YOUTUBE_API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${accessToken}`,
			...(init?.body ? { "Content-Type": "application/json" } : {}),
			...init?.headers,
		},
	});
	if (!response.ok) {
		throw new DirectError(
			"consent-required",
			`YouTube streaming permission or live access is required (${response.status})`,
		);
	}
	return response;
}

function youtubeIngest(stream: YoutubeStream) {
	const info = stream.cdn?.ingestionInfo;
	if (!info?.rtmpsIngestionAddress || !info.streamName) {
		throw new DirectError(
			"consent-required",
			"YouTube did not return an RTMPS destination",
		);
	}
	return `${info.rtmpsIngestionAddress.replace(/\/+$/, "")}/${info.streamName}`;
}

export async function createYoutubeDestination(
	input: {
		accessToken: string;
		broadcastId?: string | null;
		streamId?: string | null;
		title: string;
	},
	dependencies: DirectDependencies,
	now = () => Date.now(),
) {
	let stream: YoutubeStream | undefined;
	if (input.streamId) {
		const response = await dependencies.fetch(
			`${YOUTUBE_API}/liveStreams?part=cdn&id=${encodeURIComponent(input.streamId)}`,
			{ headers: { Authorization: `Bearer ${input.accessToken}` } },
		);
		if (response.ok) {
			const payload = (await response.json()) as { items?: YoutubeStream[] };
			stream = payload.items?.[0];
		} else if (response.status !== 404) {
			throw new DirectError(
				"consent-required",
				`YouTube streaming permission or live access is required (${response.status})`,
			);
		}
	}

	if (!stream) {
		const response = await youtubeRequest(
			dependencies,
			input.accessToken,
			"/liveStreams?part=snippet,cdn,contentDetails",
			{
				method: "POST",
				body: JSON.stringify({
					snippet: { title: "VISP Direct" },
					cdn: {
						ingestionType: "rtmp",
						resolution: "variable",
						frameRate: "variable",
					},
					contentDetails: { isReusable: true },
				}),
			},
		);
		stream = (await response.json()) as YoutubeStream;
	}
	const url = youtubeIngest(stream);
	if (input.broadcastId) {
		const response = await dependencies.fetch(
			`${YOUTUBE_API}/liveBroadcasts?part=status,contentDetails&id=${encodeURIComponent(input.broadcastId)}`,
			{ headers: { Authorization: `Bearer ${input.accessToken}` } },
		);
		if (!response.ok && response.status !== 404) {
			throw new DirectError(
				"consent-required",
				`YouTube streaming permission or live access is required (${response.status})`,
			);
		}
		const current = response.ok
			? ((await response.json()) as { items?: YoutubeBroadcast[] }).items?.[0]
			: undefined;
		if (
			current &&
			!["complete", "revoked"].includes(current.status?.lifeCycleStatus ?? "")
		) {
			if (current.contentDetails?.boundStreamId !== stream.id) {
				await youtubeRequest(
					dependencies,
					input.accessToken,
					`/liveBroadcasts/bind?part=id&streamId=${encodeURIComponent(stream.id)}&id=${encodeURIComponent(current.id)}`,
					{ method: "POST" },
				);
			}
			return {
				url,
				streamId: stream.id,
				broadcastId: current.id,
				createdBroadcast: false,
			};
		}
	}

	let broadcastId: string | undefined;
	try {
		const response = await youtubeRequest(
			dependencies,
			input.accessToken,
			"/liveBroadcasts?part=snippet,status,contentDetails",
			{
				method: "POST",
				body: JSON.stringify({
					snippet: {
						title: input.title,
						scheduledStartTime: new Date(now() + 10_000).toISOString(),
					},
					status: { privacyStatus: "public" },
					contentDetails: {
						enableAutoStart: true,
						enableAutoStop: true,
						monitorStream: { enableMonitorStream: false },
					},
				}),
			},
		);
		const broadcast = (await response.json()) as { id?: string };
		if (!broadcast.id) {
			throw new DirectError(
				"consent-required",
				"YouTube did not create a broadcast",
			);
		}
		broadcastId = broadcast.id;
		await youtubeRequest(
			dependencies,
			input.accessToken,
			`/liveBroadcasts/bind?part=id&streamId=${encodeURIComponent(stream.id)}&id=${encodeURIComponent(broadcastId)}`,
			{ method: "POST" },
		);
		return { url, streamId: stream.id, broadcastId, createdBroadcast: true };
	} catch (error) {
		if (broadcastId) {
			await dependencies
				.fetch(
					`${YOUTUBE_API}/liveBroadcasts?id=${encodeURIComponent(broadcastId)}`,
					{
						method: "DELETE",
						headers: { Authorization: `Bearer ${input.accessToken}` },
					},
				)
				.catch(() => undefined);
		}
		throw error;
	}
}

/**
 * Kick's dashboard URL ends in `:443/app`, but the API sometimes returns only
 * the ingest host. FFmpeg treats a bare host as the app name and fails with
 * "Input/output error" when opening the output.
 */
export function kickIngestDestination(streamUrl: string, streamKey: string) {
	const trimmed = streamUrl.trim().replace(/\/+$/, "");
	if (trimmed.endsWith("/app")) {
		return `${trimmed}/${streamKey}`;
	}

	try {
		const url = new URL(trimmed);
		if (url.pathname && url.pathname !== "/") {
			return `${trimmed}/${streamKey}`;
		}
		if (!url.port) {
			url.port = url.protocol === "rtmps:" ? "443" : "1935";
		}
		url.pathname = "/app";
		return `${url.protocol}//${url.host}${url.pathname}/${streamKey}`;
	} catch {
		return `${trimmed}/${streamKey}`;
	}
}

export async function listDirectOutputs(userId: string) {
	const [owners, accounts, paths, portraits, customOutputs] = await Promise.all(
		[
			db
				.select({
					twitch: appUser.directTwitch,
					kick: appUser.directKick,
					youtube: appUser.directYoutube,
					youtubeTitle: appUser.directYoutubeTitle,
					directDualOutput: appUser.directDualOutput,
				})
				.from(appUser)
				.where(eq(appUser.id, userId))
				.limit(1),
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
				.select({
					id: relayPath.id,
					label: relayPath.label,
					twitch: relayPath.directTwitch,
					kick: relayPath.directKick,
					youtube: relayPath.directYoutube,
					publishing: pathState.publishing,
					twitchState: pathState.directTwitchState,
					twitchError: pathState.directTwitchError,
					kickState: pathState.directKickState,
					kickError: pathState.directKickError,
					youtubeState: pathState.directYoutubeState,
					youtubeError: pathState.directYoutubeError,
				})
				.from(relayPath)
				.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
				.where(and(eq(relayPath.userId, userId), isNull(relayPath.revokedAt)))
				.orderBy(relayPath.seq),
			listPortraitDestinations(userId),
			listCustomDirectOutputs(userId),
		],
	);

	const desired = {
		twitch: owners[0]?.twitch ?? false,
		kick: owners[0]?.kick ?? false,
		youtube: owners[0]?.youtube ?? false,
	};
	return {
		directDualOutput: owners[0]?.directDualOutput ?? false,
		mode:
			owners[0]?.twitch === null &&
			owners[0]?.kick === null &&
			owners[0]?.youtube === null
				? ("unconfigured" as const)
				: desired.twitch ||
						desired.kick ||
						desired.youtube ||
						customOutputs.length > 0
					? ("direct" as const)
					: ("obs" as const),
		desired,
		youtubeTitle: owners[0]?.youtubeTitle ?? "Live from VISP",
		ownerPathId: {
			twitch: paths.find((path) => path.twitch)?.id ?? null,
			kick: paths.find((path) => path.kick)?.id ?? null,
			youtube: paths.find((path) => path.youtube)?.id ?? null,
		},
		providers: DIRECT_PROVIDERS.map((provider) => {
			const linked = accounts.find(
				(entry) => entry.provider === authProvider(provider),
			);
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
		destinations: [
			...paths.flatMap((path) =>
				DIRECT_PROVIDERS.flatMap((provider) =>
					path[provider]
						? [
								{
									id: `legacy-${path.id}-${provider}`,
									pathId: path.id,
									provider,
									role: "landscape" as const,
									crop: null,
									state:
										((provider === "twitch"
											? path.twitchState
											: provider === "kick"
												? path.kickState
												: path.youtubeState) as DirectState | null) ?? null,
									error:
										provider === "twitch"
											? path.twitchError
											: provider === "kick"
												? path.kickError
												: path.youtubeError,
								},
							]
						: [],
				),
			),
			...portraits.map((destination) => ({
				...destination,
				provider: destination.provider as DirectProvider,
				state: (destination.state as DirectState | null) ?? null,
			})),
		],
		customOutputs: customOutputs.map((output) => ({
			...output,
			protocol: output.protocol as "rtmp" | "rtmps" | "srt",
			role: output.role as DirectRole,
			state: (output.state as DirectState | null) ?? null,
		})),
		paths: paths.map((path) => ({
			id: path.id,
			label: path.label,
			publishing: path.publishing ?? false,
			twitch: path.twitch,
			kick: path.kick,
			youtube: path.youtube,
			state: {
				twitch: (path.twitchState as DirectState | null) ?? null,
				kick: (path.kickState as DirectState | null) ?? null,
				youtube: (path.youtubeState as DirectState | null) ?? null,
			},
			error: {
				twitch: path.twitchError,
				kick: path.kickError,
				youtube: path.youtubeError,
			},
		})),
	};
}

/** Relay-side desired-state check used to remove or reframe one forwarder. */
export async function directDestinationActive(input: {
	slug: string;
	provider: DirectProvider;
	role: DirectRole;
	filter?: string | null;
}) {
	const [path] = await db
		.select({
			id: relayPath.id,
			twitch: relayPath.directTwitch,
			kick: relayPath.directKick,
			youtube: relayPath.directYoutube,
			dualOutput: appUser.directDualOutput,
		})
		.from(relayPath)
		.innerJoin(appUser, eq(appUser.id, relayPath.userId))
		.where(and(eq(relayPath.slug, input.slug), isNull(relayPath.revokedAt)))
		.limit(1);
	if (!path) return false;
	if (input.role === "landscape") return path[input.provider];
	if (!path.dualOutput) return false;
	return portraitDestinationActive({
		pathId: path.id,
		provider: input.provider,
		filter: input.filter,
	});
}

export async function setYoutubeSettings(userId: string, title: string) {
	const normalized = title.trim();
	if (!normalized || normalized.length > 100) {
		throw new DirectError("invalid", "YouTube title must be 1–100 characters");
	}
	await db
		.update(appUser)
		.set({ directYoutubeTitle: normalized })
		.where(eq(appUser.id, userId));
	return { title: normalized };
}

/**
 * Saved per device and changeable only while that device is offline. One path
 * may own a given provider at a time; Twitch on one device and Kick on another
 * is permitted.
 *
 * Clearing every provider *is* Route to Home Studio, just expressed on a device
 * toggle. The dashboard disables the last switch so it never asks for this, but
 * the phone has no mode control, so refusing here strands shipped app builds
 * with Direct output they cannot turn off.
 */
export async function setDirectOutputs(
	userId: string,
	pathId: number,
	outputs: { twitch: boolean; kick: boolean; youtube: boolean },
) {
	const clearing = !outputs.twitch && !outputs.kick && !outputs.youtube;
	const resetPathIds = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
		const [path] = await tx
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
		if (!path) {
			throw new DirectError("not-found", "Publishing device not found");
		}
		if (path.publishing) {
			throw new DirectError(
				"path-live",
				"Stop this device before changing its Direct outputs",
			);
		}

		const currentOwners = await tx
			.select({
				id: relayPath.id,
				label: relayPath.label,
				twitch: relayPath.directTwitch,
				kick: relayPath.directKick,
				youtube: relayPath.directYoutube,
				publishing: pathState.publishing,
			})
			.from(relayPath)
			.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
			.where(and(eq(relayPath.userId, userId), isNull(relayPath.revokedAt)));
		const liveOwner = currentOwners.find(
			(entry) =>
				entry.id !== pathId &&
				entry.publishing &&
				(entry.twitch || entry.kick || entry.youtube),
		);
		if (liveOwner) {
			throw new DirectError(
				"provider-taken",
				`Stop ${liveOwner.label} before moving Direct output`,
			);
		}

		await tx
			.update(relayPath)
			.set({ directTwitch: false, directKick: false, directYoutube: false })
			.where(and(eq(relayPath.userId, userId), isNull(relayPath.revokedAt)));
		// Home Studio clears this device too, so it resets itself along with the
		// ones losing ownership.
		const resetPathIds = currentOwners
			.filter((entry) => clearing || entry.id !== pathId)
			.map((entry) => entry.id);
		if (resetPathIds.length > 0) {
			await tx
				.update(pathState)
				.set({
					directTwitchReservedUntil: null,
					directKickReservedUntil: null,
					directYoutubeReservedUntil: null,
					directYoutubeBroadcastId: null,
					// Clearing Direct output ends any held BRB card, matching the
					// mode switch in saveDirectPreferences.
					...(clearing
						? {
								brbHighlightsResultAt: sql`case when ${pathState.brbSince} is not null then now() else ${pathState.brbHighlightsResultAt} end`,
								brbSince: null,
							}
						: {}),
				})
				.where(inArray(pathState.pathId, resetPathIds));
		}
		await tx
			.update(relayPath)
			.set({
				directTwitch: outputs.twitch,
				directKick: outputs.kick,
				directYoutube: outputs.youtube,
			})
			.where(eq(relayPath.id, pathId));
		await tx
			.update(appUser)
			.set({
				directTwitch: outputs.twitch,
				directKick: outputs.kick,
				directYoutube: outputs.youtube,
			})
			.where(eq(appUser.id, userId));
		return resetPathIds;
	});
	await Promise.all(
		resetPathIds.map((resetPathId) =>
			cleanupDeletedBrbHighlightsForPath(resetPathId).catch(() => undefined),
		),
	);
	return { pathId, ...outputs };
}

/** Saves onboarding-level intent without assigning it to a device yet. */
export async function saveDirectPreferences(
	userId: string,
	outputs: { twitch: boolean; kick: boolean; youtube: boolean },
) {
	const resetPathIds = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
		const [current] = await tx
			.select({
				twitch: appUser.directTwitch,
				kick: appUser.directKick,
				youtube: appUser.directYoutube,
			})
			.from(appUser)
			.where(eq(appUser.id, userId))
			.limit(1);
		if (!current) throw new DirectError("not-found", "Relay user not found");
		const changed =
			current.twitch !== outputs.twitch ||
			current.kick !== outputs.kick ||
			current.youtube !== outputs.youtube;
		let resetPathIds: number[] = [];
		if (changed) {
			const paths = await tx
				.select({
					id: relayPath.id,
					label: relayPath.label,
					twitch: relayPath.directTwitch,
					kick: relayPath.directKick,
					youtube: relayPath.directYoutube,
					publishing: pathState.publishing,
				})
				.from(relayPath)
				.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
				.where(and(eq(relayPath.userId, userId), isNull(relayPath.revokedAt)));
			const liveOwner = paths.find(
				(path) => path.publishing && (path.twitch || path.kick || path.youtube),
			);
			if (liveOwner) {
				throw new DirectError(
					"path-live",
					`Stop ${liveOwner.label} before changing Direct output`,
				);
			}
			await tx
				.update(relayPath)
				.set({ directTwitch: false, directKick: false, directYoutube: false })
				.where(and(eq(relayPath.userId, userId), isNull(relayPath.revokedAt)));
			resetPathIds = paths.map((path) => path.id);
			if (resetPathIds.length > 0) {
				await tx
					.update(pathState)
					.set({
						directTwitchReservedUntil: null,
						directKickReservedUntil: null,
						directYoutubeReservedUntil: null,
						directYoutubeBroadcastId: null,
						// Moving or clearing Direct output ends any held BRB card.
						brbHighlightsResultAt: sql`case when ${pathState.brbSince} is not null then now() else ${pathState.brbHighlightsResultAt} end`,
						brbSince: null,
					})
					.where(inArray(pathState.pathId, resetPathIds));
			}
		}
		await tx
			.update(appUser)
			.set({
				directTwitch: outputs.twitch,
				directKick: outputs.kick,
				directYoutube: outputs.youtube,
			})
			.where(eq(appUser.id, userId));
		return resetPathIds;
	});
	await Promise.all(
		resetPathIds.map((pathId) =>
			cleanupDeletedBrbHighlightsForPath(pathId).catch(() => undefined),
		),
	);
}

export const RESERVATION_MS = DIRECT_RESERVATION_MS;

/** Atomically transfers Direct ownership and reserves this relay's encoders. */
export async function prepareDirect(userId: string, pathId: number) {
	return db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
		const [path] = await tx
			.select({
				id: relayPath.id,
				relayId: relayPath.relayId,
				maxForwarders: relay.maxForwarders,
				dualOutput: appUser.directDualOutput,
				twitch: appUser.directTwitch,
				kick: appUser.directKick,
				youtube: appUser.directYoutube,
			})
			.from(relayPath)
			.innerJoin(appUser, eq(appUser.id, relayPath.userId))
			.innerJoin(relay, eq(relay.id, relayPath.relayId))
			.where(
				and(
					eq(relayPath.id, pathId),
					eq(relayPath.userId, userId),
					isNull(relayPath.revokedAt),
				),
			)
			.limit(1);
		if (!path) {
			throw new DirectError("not-found", "Publishing device not found");
		}

		const outputs = DIRECT_PROVIDERS.filter(
			(provider) => path[provider] === true,
		);
		const portraits = path.dualOutput
			? await tx
					.select({
						id: directDestination.id,
						provider: directDestination.provider,
						crop: directDestination.crop,
					})
					.from(directDestination)
					.where(
						and(
							eq(directDestination.userId, userId),
							eq(directDestination.pathId, pathId),
							eq(directDestination.role, "portrait"),
							or(
								isNull(directDestination.state),
								ne(directDestination.state, "stopping"),
							),
						),
					)
			: [];
		const customOutputs = await tx
			.select({ id: customDirectOutput.id })
			.from(customDirectOutput)
			.innerJoin(
				customDirectDestination,
				eq(customDirectDestination.id, customDirectOutput.destinationId),
			)
			.where(
				and(
					eq(customDirectOutput.userId, userId),
					eq(customDirectOutput.pathId, pathId),
					eq(customDirectOutput.role, "landscape"),
					or(
						isNull(customDirectOutput.state),
						ne(customDirectOutput.state, "stopping"),
					),
				),
			);
		if (
			outputs.length === 0 &&
			portraits.length === 0 &&
			customOutputs.length === 0
		) {
			return {
				pathId,
				outputs,
				contributionMode: "full" as const,
				reservationExpiresAt: null,
			};
		}

		const accounts = await tx
			.select({ provider: account.providerId, scope: account.scope })
			.from(account)
			.where(
				and(
					eq(account.userId, userId),
					inArray(
						account.providerId,
						[
							...new Set([
								...outputs,
								...portraits.map((entry) => entry.provider as DirectProvider),
							]),
						].map((provider) => authProvider(provider)),
					),
				),
			);
		for (const provider of outputs) {
			const linked = accounts.find(
				(entry) => entry.provider === authProvider(provider),
			);
			if (!linked || !hasStreamKeyScope(provider, linked.scope)) {
				throw new DirectError(
					"consent-required",
					`Authorize ${provider === "twitch" ? "Twitch" : provider === "kick" ? "Kick" : "YouTube"} streaming first`,
				);
			}
		}

		const owners = await tx
			.select({
				id: relayPath.id,
				label: relayPath.label,
				twitch: relayPath.directTwitch,
				kick: relayPath.directKick,
				youtube: relayPath.directYoutube,
				publishing: pathState.publishing,
			})
			.from(relayPath)
			.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
			.where(and(eq(relayPath.userId, userId), isNull(relayPath.revokedAt)));
		const liveOwner = owners.find(
			(entry) =>
				entry.id !== pathId &&
				entry.publishing &&
				(entry.twitch || entry.kick || entry.youtube),
		);
		if (liveOwner) {
			throw new DirectError(
				"provider-taken",
				`Stop ${liveOwner.label} before going live from this device`,
			);
		}

		await tx.execute(sql`select pg_advisory_xact_lock(${path.relayId})`);
		const active = await tx.execute(sql<{ count: number }>`
			select (
				count(*) filter (where p.direct_twitch and (
					s.direct_twitch_state in ${DIRECT_OCCUPIED_STATES_SQL} or
					s.direct_twitch_reserved_until > now()
				)) +
				count(*) filter (where p.direct_kick and (
					s.direct_kick_state in ${DIRECT_OCCUPIED_STATES_SQL} or
					s.direct_kick_reserved_until > now()
				)) +
				count(*) filter (where p.direct_youtube and (
					s.direct_youtube_state in ${DIRECT_OCCUPIED_STATES_SQL} or
					s.direct_youtube_reserved_until > now()
				))
			)::int as count
			from path p
			join path_state s on s.path_id = p.id
			where p.relay_id = ${path.relayId}
				and p.revoked_at is null
				and p.id <> ${pathId}
				and p.user_id <> ${userId}
		`);
		const used = Number(active.rows[0]?.count ?? 0);
		const portraitActive = await tx.execute(sql<{ count: number }>`
			select count(*)::int as count
			from direct_destination d
			join path p on p.id = d.path_id
			where p.relay_id = ${path.relayId}
				and p.revoked_at is null
				and p.id <> ${pathId}
				and (d.state in ${DIRECT_OCCUPIED_STATES_SQL} or d.reserved_until > now())
		`);
		const customActive = await tx.execute(sql<{ count: number }>`
			select count(*)::int as count
			from custom_direct_output o
			join path p on p.id = o.path_id
			where p.relay_id = ${path.relayId}
				and p.revoked_at is null
				and p.id <> ${pathId}
				and (o.state in ${DIRECT_OCCUPIED_STATES_SQL} or o.reserved_until > now())
		`);
		const totalUsed =
			used +
			Number(portraitActive.rows[0]?.count ?? 0) +
			Number(customActive.rows[0]?.count ?? 0);
		if (
			totalUsed + outputs.length + customOutputs.length >
			path.maxForwarders
		) {
			console.warn("direct capacity refusal", {
				pathId,
				relayId: path.relayId,
			});
			throw new DirectError(
				"capacity",
				"Direct is at capacity, try again shortly",
			);
		}

		await tx
			.update(relayPath)
			.set({ directTwitch: false, directKick: false, directYoutube: false })
			.where(and(eq(relayPath.userId, userId), isNull(relayPath.revokedAt)));
		const previousPathIds = owners
			.filter((entry) => entry.id !== pathId)
			.map((entry) => entry.id);
		if (previousPathIds.length > 0) {
			await tx
				.update(pathState)
				.set({
					directTwitchReservedUntil: null,
					directKickReservedUntil: null,
					directYoutubeReservedUntil: null,
					directYoutubeBroadcastId: null,
				})
				.where(inArray(pathState.pathId, previousPathIds));
		}
		await tx
			.update(relayPath)
			.set({
				directTwitch: outputs.includes("twitch"),
				directKick: outputs.includes("kick"),
				directYoutube: outputs.includes("youtube"),
			})
			.where(eq(relayPath.id, pathId));

		const expiresAt = new Date(Date.now() + RESERVATION_MS);
		if (customOutputs.length > 0) {
			await tx
				.update(customDirectOutput)
				.set({
					state: null,
					error: null,
					reservedRelayId: path.relayId,
					reservedUntil: expiresAt,
				})
				.where(
					inArray(
						customDirectOutput.id,
						customOutputs.map(({ id }) => id),
					),
				);
		}
		let portraitSlots = Math.max(
			0,
			path.maxForwarders - totalUsed - outputs.length - customOutputs.length,
		);
		const portraitOutputs: DirectProvider[] = [];
		for (const portrait of portraits) {
			const provider = portrait.provider as DirectProvider;
			const linked = accounts.find(
				(entry) => entry.provider === authProvider(provider),
			);
			let error: string | null = null;
			try {
				if (!portrait.crop)
					throw new DirectError("invalid", "Portrait framing is required");
				validateDirectCrop(portrait.crop);
				if (!linked || !hasStreamKeyScope(provider, linked.scope)) {
					throw new DirectError(
						"consent-required",
						`Authorize ${provider} streaming first`,
					);
				}
				if (portraitSlots === 0) {
					throw new DirectError(
						"capacity",
						"No free Direct slot for portrait. Landscape can still go live.",
					);
				}
				portraitSlots -= 1;
				portraitOutputs.push(provider);
			} catch (reason) {
				error =
					reason instanceof DirectError
						? reason.message
						: "Could not start portrait";
			}
			await tx
				.update(directDestination)
				.set({
					reservedUntil: error ? null : expiresAt,
					state: error ? "failed" : null,
					error,
				})
				.where(eq(directDestination.id, portrait.id));
		}
		await tx
			.insert(pathState)
			.values({
				pathId,
				directTwitchReservedUntil: outputs.includes("twitch")
					? expiresAt
					: null,
				directKickReservedUntil: outputs.includes("kick") ? expiresAt : null,
				directYoutubeReservedUntil: outputs.includes("youtube")
					? expiresAt
					: null,
				directYoutubeBroadcastId: null,
			})
			.onConflictDoUpdate({
				target: pathState.pathId,
				set: {
					directTwitchReservedUntil: outputs.includes("twitch")
						? expiresAt
						: null,
					directKickReservedUntil: outputs.includes("kick") ? expiresAt : null,
					directYoutubeReservedUntil: outputs.includes("youtube")
						? expiresAt
						: null,
					directYoutubeBroadcastId: null,
				},
			});
		return {
			pathId,
			outputs,
			customOutputIds: customOutputs.map(({ id }) => id),
			portraitOutputs,
			contributionMode: "direct" as const,
			reservationExpiresAt: expiresAt.toISOString(),
		};
	});
}

/** A revoked path owns no provider, which frees the owner's slot. */
export async function clearDirectOutputs(pathId: number) {
	await Promise.all([
		db
			.update(relayPath)
			.set({ directTwitch: false, directKick: false, directYoutube: false })
			.where(eq(relayPath.id, pathId)),
		db.delete(directDestination).where(eq(directDestination.pathId, pathId)),
		db.delete(customDirectOutput).where(eq(customDirectOutput.pathId, pathId)),
	]);
}

export async function applyDirectState(input: {
	slug: string;
	provider: DirectProvider;
	role?: DirectRole;
	state: DirectState;
	error?: string | null;
}) {
	const [path] = await db
		.select({ id: relayPath.id })
		.from(relayPath)
		.where(eq(relayPath.slug, input.slug))
		.limit(1);
	if (!path) return false;
	if (input.role === "portrait") {
		return applyPortraitState(path.id, input, sanitizeDirectError);
	}

	const [existing] = await db
		.select({
			twitch: pathState.directTwitchState,
			kick: pathState.directKickState,
			youtube: pathState.directYoutubeState,
		})
		.from(pathState)
		.where(eq(pathState.pathId, path.id))
		.limit(1);
	const previousState =
		input.provider === "twitch"
			? existing?.twitch
			: input.provider === "kick"
				? existing?.kick
				: existing?.youtube;
	if (
		input.state === "live" &&
		previousState !== "live" &&
		previousState !== "brb"
	) {
		trackRybbitEvent("first_live", { provider: input.provider });
	}

	const columns =
		input.provider === "twitch"
			? {
					directTwitchState: input.state,
					directTwitchError: sanitizeDirectError(input.error),
					...(input.state === "failed" || input.state === "stopped"
						? { directTwitchReservedUntil: null }
						: {}),
				}
			: input.provider === "kick"
				? {
						directKickState: input.state,
						directKickError: sanitizeDirectError(input.error),
						...(input.state === "failed" || input.state === "stopped"
							? { directKickReservedUntil: null }
							: {}),
					}
				: {
						directYoutubeState: input.state,
						directYoutubeError: sanitizeDirectError(input.error),
						...(input.state === "failed" || input.state === "stopped"
							? { directYoutubeReservedUntil: null }
							: {}),
					};
	await db
		.insert(pathState)
		.values({ pathId: path.id, lastEventAt: new Date(), ...columns })
		.onConflictDoUpdate({ target: pathState.pathId, set: columns });
	return true;
}

/** Native Go Live reports platform live via tRPC; emits on portal site 2. */
export async function reportFirstLiveActivation(
	userId: string,
	pathId: number,
	provider: DirectProvider,
) {
	const outputs = await listDirectOutputs(userId);
	const path = outputs.paths.find((entry) => entry.id === pathId);
	if (!path?.[provider] || path.state[provider] !== "live") {
		return { tracked: false as const };
	}
	trackRybbitEvent("first_live", { provider });
	return { tracked: true as const };
}

export type DirectDestination = {
	provider: DirectProvider;
	role: DirectRole;
	filter: string | null;
	url: string;
};

async function youtubeDirectDestination(
	pathId: number,
	userId: string,
	dependencies: DirectDependencies,
) {
	const { accessToken } = await dependencies.getAccessToken(
		YOUTUBE_AUTH_PROVIDER,
		userId,
	);
	let orphanBroadcastId: string | undefined;
	try {
		return await db.transaction(async (tx) => {
			await tx.execute(sql`select pg_advisory_xact_lock(${pathId})`);
			const [settings] = await tx
				.select({
					broadcastId: pathState.directYoutubeBroadcastId,
					streamId: appUser.directYoutubeStreamId,
					title: appUser.directYoutubeTitle,
				})
				.from(relayPath)
				.innerJoin(appUser, eq(appUser.id, relayPath.userId))
				.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
				.where(
					and(
						eq(relayPath.id, pathId),
						eq(relayPath.userId, userId),
						isNull(relayPath.revokedAt),
					),
				)
				.limit(1);
			if (!settings) {
				throw new DirectError("not-found", "Publishing device not found");
			}
			const destination = await createYoutubeDestination(
				{
					accessToken,
					broadcastId: settings.broadcastId,
					streamId: settings.streamId,
					title: settings.title,
				},
				dependencies,
			);
			if (destination.createdBroadcast) {
				orphanBroadcastId = destination.broadcastId;
			}
			if (destination.streamId !== settings.streamId) {
				await tx
					.update(appUser)
					.set({ directYoutubeStreamId: destination.streamId })
					.where(eq(appUser.id, userId));
			}
			await tx
				.insert(pathState)
				.values({
					pathId,
					directYoutubeBroadcastId: destination.broadcastId,
				})
				.onConflictDoUpdate({
					target: pathState.pathId,
					set: { directYoutubeBroadcastId: destination.broadcastId },
				});
			return destination.url;
		});
	} catch (error) {
		if (orphanBroadcastId) {
			await dependencies
				.fetch(
					`${YOUTUBE_API}/liveBroadcasts?id=${encodeURIComponent(orphanBroadcastId)}`,
					{
						method: "DELETE",
						headers: { Authorization: `Bearer ${accessToken}` },
					},
				)
				.catch(() => undefined);
		}
		throw error;
	}
}

/**
 * Called by the relay when a path becomes ready. Returns the destinations the
 * relay should distribution-encode to — there is no per-destination copy
 * decision, and each selected provider consumes one cap slot.
 */
export async function resolveDirectDestinations(
	slug: string,
	dependencies: DirectDependencies = defaultDependencies,
	// Providers the relay still has a forwarder for, held over a drop on BRB.
	// Resolving them again would mint a second YouTube broadcast while the
	// first one is still live, and hand out a destination nobody consumes.
	skip: readonly DirectProvider[] = [],
	roles: readonly DirectRole[] = ["landscape", "portrait"],
): Promise<{ destinations: DirectDestination[] }> {
	const [path] = await db
		.select({
			id: relayPath.id,
			userId: relayPath.userId,
			twitch: relayPath.directTwitch,
			kick: relayPath.directKick,
			youtube: relayPath.directYoutube,
			twitchReservedUntil: pathState.directTwitchReservedUntil,
			kickReservedUntil: pathState.directKickReservedUntil,
			youtubeReservedUntil: pathState.directYoutubeReservedUntil,
		})
		.from(relayPath)
		.innerJoin(relay, eq(relay.id, relayPath.relayId))
		.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
		.where(and(eq(relayPath.slug, slug), isNull(relayPath.revokedAt)))
		.limit(1);
	const enabled = path
		? DIRECT_PROVIDERS.filter(
				(provider) => path[provider] && !skip.includes(provider),
			)
		: [];
	if (!path) return { destinations: [] };
	const portraits = await listRelayPortraitDestinations(path.id);
	const requested = [
		...enabled.map((provider) => ({
			provider,
			role: "landscape" as const,
			crop: null,
			reservedUntil:
				provider === "twitch"
					? path.twitchReservedUntil
					: provider === "kick"
						? path.kickReservedUntil
						: path.youtubeReservedUntil,
		})),
		...portraits.flatMap((entry) =>
			skip.includes(entry.provider as DirectProvider)
				? []
				: [
						{
							provider: entry.provider as DirectProvider,
							role: "portrait" as const,
							crop: entry.crop,
							reservedUntil: entry.reservedUntil,
						},
					],
		),
	].filter((entry) => roles.includes(entry.role));
	if (requested.length === 0) return { destinations: [] };

	const accounts = await db
		.select({ provider: account.providerId, accountId: account.accountId })
		.from(account)
		.where(
			and(
				eq(account.userId, path.userId),
				inArray(
					account.providerId,
					requested.map((entry) => authProvider(entry.provider)),
				),
			),
		);

	const destinations: DirectDestination[] = [];
	for (const entry of requested) {
		const { provider, reservedUntil } = entry;
		if (!reservedUntil || reservedUntil.getTime() <= Date.now()) {
			await applyDirectState({
				slug,
				provider,
				role: entry.role,
				state: "failed",
				error: "Direct reservation expired, reconnect the publisher",
			});
			continue;
		}
		const linked = accounts.find(
			(entry) => entry.provider === authProvider(provider),
		);
		if (!linked) {
			await applyDirectState({
				slug,
				provider,
				role: entry.role,
				state: "failed",
				error: `Link ${provider === "twitch" ? "Twitch" : provider === "kick" ? "Kick" : "YouTube"} first`,
			});
			continue;
		}
		try {
			const destination =
				provider === "youtube"
					? await youtubeDirectDestination(path.id, path.userId, dependencies)
					: await streamKeyDestination(
							provider,
							path.userId,
							linked.accountId,
							dependencies,
						);
			const url = validateDirectDestination(provider, destination);
			destinations.push({
				provider,
				role: entry.role,
				filter:
					entry.role === "portrait" && entry.crop
						? portraitFilter(entry.crop)
						: null,
				url,
			});
			await applyDirectState({
				slug,
				provider,
				role: entry.role,
				state: "starting",
				error: null,
			});
		} catch (error) {
			// Never surface the provider's response body; it can carry the key.
			await applyDirectState({
				slug,
				provider,
				role: entry.role,
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

export async function resolveDirectDestinationsV3(
	slug: string,
	dependencies: DirectDependencies = defaultDependencies,
	skip: readonly string[] = [],
): Promise<{ destinations: DirectHookV3Destination[] }> {
	const managedSkip = skip.flatMap((outputId) => {
		const match = /^managed-(twitch|kick|youtube)-(?:landscape|portrait)$/.exec(
			outputId,
		);
		return match?.[1] ? [match[1] as DirectProvider] : [];
	});
	const managed = await resolveDirectDestinations(
		slug,
		dependencies,
		managedSkip,
	);
	const destinations: DirectHookV3Destination[] = managed.destinations.map(
		(destination) => ({
			outputId: `managed-${destination.provider}-${destination.role}`,
			kind: "managed",
			label: destination.provider,
			role: destination.role,
			protocol: "rtmps",
			muxer: "flv",
			filter: destination.filter,
			url: destination.url,
		}),
	);
	const [path] = await db
		.select({
			id: relayPath.id,
			relayId: relayPath.relayId,
			userId: relayPath.userId,
		})
		.from(relayPath)
		.where(and(eq(relayPath.slug, slug), isNull(relayPath.revokedAt)))
		.limit(1);
	if (!path) return { destinations };
	const custom = await db
		.select({
			id: customDirectOutput.id,
			destinationId: customDirectOutput.destinationId,
			name: customDirectDestination.name,
			protocol: customDirectDestination.protocol,
			encryptedUrl: customDirectDestination.encryptedUrl,
			reservedRelayId: customDirectOutput.reservedRelayId,
			reservedUntil: customDirectOutput.reservedUntil,
		})
		.from(customDirectOutput)
		.innerJoin(
			customDirectDestination,
			eq(customDirectDestination.id, customDirectOutput.destinationId),
		)
		.where(
			and(
				eq(customDirectOutput.pathId, path.id),
				eq(customDirectOutput.role, "landscape"),
				or(
					isNull(customDirectOutput.state),
					ne(customDirectOutput.state, "stopping"),
				),
			),
		);
	for (const output of custom) {
		if (skip.includes(output.id)) continue;
		if (
			output.reservedRelayId !== path.relayId ||
			!output.reservedUntil ||
			output.reservedUntil.getTime() <= Date.now()
		) {
			await applyCustomDirectState({
				slug,
				outputId: output.id,
				state: "failed",
				error: "Direct reservation expired, reconnect the publisher",
			});
			continue;
		}
		try {
			const url = decryptSecret(
				output.encryptedUrl,
				customDestinationAad(path.userId, output.destinationId),
			);
			const validated = await validateCustomDestinationForStorage(
				url,
				dependencies.resolveHost ?? resolveHost,
			);
			if (validated.protocol !== output.protocol)
				throw new Error("Protocol changed");
			destinations.push({
				outputId: output.id,
				kind: "custom",
				label: output.name,
				role: "landscape",
				protocol: validated.protocol,
				muxer: validated.protocol === "srt" ? "mpegts" : "flv",
				filter: null,
				url,
			});
			await applyCustomDirectState({
				slug,
				outputId: output.id,
				state: "starting",
			});
		} catch {
			await applyCustomDirectState({
				slug,
				outputId: output.id,
				state: "failed",
				error: "Could not start this destination",
			});
		}
	}
	return { destinations };
}

/** Called when paths go not-ready, so no slot stays counted after teardown. */
export async function stopDirectForPaths(pathIds: number[]) {
	if (pathIds.length === 0) return;
	const broadcasts = await db
		.select({
			broadcastId: pathState.directYoutubeBroadcastId,
			userId: relayPath.userId,
		})
		.from(pathState)
		.innerJoin(relayPath, eq(relayPath.id, pathState.pathId))
		.where(inArray(pathState.pathId, pathIds));
	await db
		.update(pathState)
		.set({
			directTwitchState: sql`case when ${pathState.directTwitchState} in ${DIRECT_OCCUPIED_STATES_SQL} then 'stopped' else ${pathState.directTwitchState} end`,
			directKickState: sql`case when ${pathState.directKickState} in ${DIRECT_OCCUPIED_STATES_SQL} then 'stopped' else ${pathState.directKickState} end`,
			directYoutubeState: sql`case when ${pathState.directYoutubeState} in ${DIRECT_OCCUPIED_STATES_SQL} then 'stopped' else ${pathState.directYoutubeState} end`,
			directTwitchReservedUntil: null,
			directKickReservedUntil: null,
			directYoutubeReservedUntil: null,
			directYoutubeBroadcastId: null,
			// A hard stop is the end of BRB too, whatever got us here.
			brbHighlightsResultAt: sql`case when ${pathState.brbSince} is not null then now() else ${pathState.brbHighlightsResultAt} end`,
			brbSince: null,
		})
		.where(inArray(pathState.pathId, pathIds));
	await db
		.update(directDestination)
		.set({ state: "stopped", reservedUntil: null })
		.where(inArray(directDestination.pathId, pathIds));
	await db
		.update(customDirectOutput)
		.set({ state: "stopped", reservedRelayId: null, reservedUntil: null })
		.where(inArray(customDirectOutput.pathId, pathIds));
	await Promise.all(
		pathIds.map((pathId) =>
			cleanupDeletedBrbHighlightsForPath(pathId).catch(() => undefined),
		),
	);
	await Promise.allSettled(
		broadcasts.flatMap((entry) => {
			const broadcastId = entry.broadcastId;
			return broadcastId
				? [
						(async () => {
							const { accessToken } = await defaultDependencies.getAccessToken(
								YOUTUBE_AUTH_PROVIDER,
								entry.userId,
							);
							await defaultDependencies.fetch(
								`${YOUTUBE_API}/liveBroadcasts/transition?part=id&broadcastStatus=complete&id=${encodeURIComponent(broadcastId)}`,
								{
									method: "POST",
									headers: { Authorization: `Bearer ${accessToken}` },
								},
							);
						})(),
					]
				: [];
		}),
	);
}
