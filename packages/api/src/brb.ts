import { db } from "@VISP/db";
import { appUser, pathState, relayPath } from "@VISP/db/schema/index";
import type { ObjectStore } from "@VISP/object-store";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { announceStreamEvent } from "./chat/alerts";
import {
	type DirectProvider,
	RESERVATION_MS,
	stopDirectForPaths,
} from "./direct";
import { snapshotKey, snapshotReads, snapshotUploads } from "./snapshots";

export const BRB_SOURCES = ["snapshot", "image", "color"] as const;
export type BrbSource = (typeof BRB_SOURCES)[number];

export const DEFAULT_BRB_MESSAGE = "Be right back";
export const MAX_BRB_MESSAGE_LENGTH = 120;

/**
 * A held forwarder still burns an encoder slot, so BRB cannot run forever
 * unattended. This is a stuck-process ceiling, not a product timeout: the
 * dashboard's stop button is the intended way out.
 */
const BRB_CEILING_MS = 6 * 60 * 60 * 1000;

/** Direct states that mean a forwarder is up and therefore has something to hold. */
const HOLDABLE_STATES = new Set(["starting", "live", "retrying", "brb"]);

/** Presigned for the relay, which fetches the card background over plain HTTP. */
const BACKGROUND_URL_TTL_S = 300;
const IMAGE_UPLOAD_TTL_S = 60;
const MAX_BRB_IMAGE_BYTES = 5 * 1024 * 1024;

export const BRB_IMAGE_TYPES = {
	"image/png": "png",
	"image/jpeg": "jpg",
} as const;
export type BrbImageType = keyof typeof BRB_IMAGE_TYPES;

export function brbImageKey(userId: string, type: BrbImageType) {
	return `brb/${userId}.${BRB_IMAGE_TYPES[type]}`;
}

export type BrbCandidate = {
	pathId: number;
	brbEnabled: boolean;
	revoked: boolean;
	providers: { enabled: boolean; state: string | null }[];
};

/**
 * Which paths keep their forwarders on a BRB card and which get torn down.
 * A path only holds if the user asked for it *and* a forwarder is actually
 * running — otherwise a device with no Direct output, or one whose providers
 * all failed consent, would be left with a BRB marker nothing ever clears.
 */
export function splitBrbEligible(candidates: BrbCandidate[]) {
	const brbIds: number[] = [];
	const stopIds: number[] = [];
	for (const candidate of candidates) {
		const holds =
			candidate.brbEnabled &&
			!candidate.revoked &&
			candidate.providers.some(
				(provider) =>
					provider.enabled &&
					provider.state !== null &&
					HOLDABLE_STATES.has(provider.state),
			);
		(holds ? brbIds : stopIds).push(candidate.pathId);
	}
	return { brbIds, stopIds };
}

/** The object backing the card, or null for a solid colour. */
export function brbBackgroundKey(input: {
	source: string;
	pathId: number;
	imageKey: string | null;
}) {
	if (input.source === "snapshot") return snapshotKey(input.pathId);
	if (input.source === "image") return input.imageKey;
	return null;
}

/** True while the relay should keep holding the outgoing stream up. */
export function brbHolds(input: {
	now: number;
	enabled: boolean;
	providerEnabled: boolean;
	revoked: boolean;
	brbSince: Date | null;
}) {
	if (!input.enabled || !input.providerEnabled || input.revoked) return false;
	// Cleared means the user pressed stop, or the publisher came back and the
	// ready hook reset it — either way this forwarder is done.
	if (!input.brbSince) return false;
	return input.now - input.brbSince.getTime() < BRB_CEILING_MS;
}

const PROVIDER_ENABLED = {
	twitch: relayPath.directTwitch,
	kick: relayPath.directKick,
	youtube: relayPath.directYoutube,
} as const;

/**
 * Called wherever MediaMTX tells us a source is gone. Replaces the two
 * unconditional `stopDirectForPaths` calls so the not-ready hook and the 10s
 * reconciler cannot race each other into completing a YouTube broadcast that
 * BRB is still holding open.
 *
 * `justStopped` is the subset that actually transitioned out of publishing on
 * this call. Both callers run repeatedly against paths that are already down,
 * so it is the only thing that separates "the stream just ended" from "the
 * stream is still ended".
 */
export async function handleSourceGone(
	pathIds: number[],
	justStopped: readonly number[] = [],
) {
	if (pathIds.length === 0) return;
	const rows = await db
		.select({
			pathId: relayPath.id,
			brbEnabled: appUser.brbEnabled,
			revoked: relayPath.revokedAt,
			twitch: relayPath.directTwitch,
			kick: relayPath.directKick,
			youtube: relayPath.directYoutube,
			twitchState: pathState.directTwitchState,
			kickState: pathState.directKickState,
			youtubeState: pathState.directYoutubeState,
		})
		.from(relayPath)
		.innerJoin(appUser, eq(appUser.id, relayPath.userId))
		.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
		.where(inArray(relayPath.id, pathIds));

	const { brbIds } = splitBrbEligible(
		rows.map((row) => ({
			pathId: row.pathId,
			brbEnabled: row.brbEnabled,
			revoked: Boolean(row.revoked),
			providers: [
				{ enabled: row.twitch, state: row.twitchState },
				{ enabled: row.kick, state: row.kickState },
				{ enabled: row.youtube, state: row.youtubeState },
			],
		})),
	);
	const holding = new Set(brbIds);
	if (brbIds.length > 0) {
		// Only rows entering BRB now. Skipping the ones that already have a time
		// keeps the original drop time across the reconciler's re-runs, exactly
		// as the old coalesce did, and makes the returned ids the real drops.
		const entered = await db
			.update(pathState)
			.set({ brbSince: sql`now()` })
			.where(and(inArray(pathState.pathId, brbIds), isNull(pathState.brbSince)))
			.returning({ pathId: pathState.pathId });
		for (const row of entered) void announceStreamEvent(row.pathId, "brb");
	}
	// Ids with no row at all (deleted path) belong to the hard-stop side too.
	await stopDirectForPaths(pathIds.filter((id) => !holding.has(id)));
	for (const pathId of justStopped) {
		if (!holding.has(pathId)) void announceStreamEvent(pathId, "offline");
	}
}

export type BrbTick =
	| { stop: true }
	| {
			stop: false;
			message: string;
			backgroundUrl: string | null;
			source: BrbSource;
	  };

/**
 * Backs `POST /api/hooks/brb`. Returning `stop` is what ends a held forwarder,
 * so every way out of BRB — the stop button, disabling Direct, revoking the
 * device, the ceiling — is expressed here rather than on the relay.
 */
export async function brbTick(
	slug: string,
	provider: DirectProvider,
	client: Pick<ObjectStore, "presign"> = snapshotReads,
	now = Date.now(),
): Promise<BrbTick> {
	const [row] = await db
		.select({
			pathId: relayPath.id,
			revoked: relayPath.revokedAt,
			enabled: appUser.brbEnabled,
			message: appUser.brbMessage,
			source: appUser.brbSource,
			imageKey: appUser.brbImageKey,
			providerEnabled: PROVIDER_ENABLED[provider],
			brbSince: pathState.brbSince,
		})
		.from(relayPath)
		.innerJoin(appUser, eq(appUser.id, relayPath.userId))
		.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
		.where(eq(relayPath.slug, slug))
		.limit(1);

	if (
		!row ||
		!brbHolds({
			now,
			enabled: row.enabled,
			providerEnabled: row.providerEnabled,
			revoked: Boolean(row.revoked),
			brbSince: row.brbSince,
		})
	) {
		return { stop: true };
	}

	// The slot must stay counted while BRB burns an encoder, and the relay is
	// the only thing that knows this forwarder is still alive.
	const reservedUntil = new Date(now + RESERVATION_MS);
	await db
		.update(pathState)
		.set(
			provider === "twitch"
				? { directTwitchState: "brb", directTwitchReservedUntil: reservedUntil }
				: provider === "kick"
					? { directKickState: "brb", directKickReservedUntil: reservedUntil }
					: {
							directYoutubeState: "brb",
							directYoutubeReservedUntil: reservedUntil,
						},
		)
		.where(eq(pathState.pathId, row.pathId));

	const key = brbBackgroundKey({
		source: row.source,
		pathId: row.pathId,
		imageKey: row.imageKey,
	});
	// Presigned blind: a missing object just makes the relay fall back to a
	// solid card, which is cheaper than a stat round trip on every tick.
	const backgroundUrl = key
		? await client
				.presign(key, { expiresIn: BACKGROUND_URL_TTL_S, method: "GET" })
				.catch(() => null)
		: null;

	return {
		stop: false,
		message: row.message?.trim() || DEFAULT_BRB_MESSAGE,
		backgroundUrl,
		// The relay needs the source, not just the URL: "snapshot" is what makes
		// it prefer its own local grab over the round trip, and what blurs the card.
		source: row.source as BrbSource,
	};
}

export async function getBrbSettings(
	userId: string,
	client: Pick<ObjectStore, "presign"> = snapshotReads,
) {
	const [row] = await db
		.select({
			enabled: appUser.brbEnabled,
			message: appUser.brbMessage,
			source: appUser.brbSource,
			imageKey: appUser.brbImageKey,
		})
		.from(appUser)
		.where(eq(appUser.id, userId))
		.limit(1);
	const imageUrl =
		row?.imageKey && row.source === "image"
			? await client
					.presign(row.imageKey, {
						expiresIn: BACKGROUND_URL_TTL_S,
						method: "GET",
					})
					.catch(() => null)
			: null;
	return {
		enabled: row?.enabled ?? false,
		message: row?.message ?? "",
		source: (row?.source ?? "snapshot") as BrbSource,
		hasImage: Boolean(row?.imageKey),
		imageUrl,
		defaultMessage: DEFAULT_BRB_MESSAGE,
		maxImageBytes: MAX_BRB_IMAGE_BYTES,
	};
}

export async function setBrbSettings(
	userId: string,
	input: { enabled: boolean; message: string; source: BrbSource },
) {
	const message = input.message.trim().slice(0, MAX_BRB_MESSAGE_LENGTH);
	await db
		.update(appUser)
		.set({
			brbEnabled: input.enabled,
			brbMessage: message || null,
			brbSource: input.source,
		})
		.where(eq(appUser.id, userId));
	return { enabled: input.enabled, message, source: input.source };
}

/**
 * The key is recorded when the URL is issued rather than after the PUT: a
 * failed upload then points at a missing object, which the relay already
 * handles by falling back. One round trip instead of two.
 */
export async function getBrbImageUploadUrl(
	userId: string,
	contentType: BrbImageType,
	client: Pick<ObjectStore, "presign"> = snapshotUploads,
) {
	const key = brbImageKey(userId, contentType);
	const url = await client.presign(key, {
		expiresIn: IMAGE_UPLOAD_TTL_S,
		method: "PUT",
	});
	await db
		.update(appUser)
		.set({ brbImageKey: key, brbSource: "image" })
		.where(eq(appUser.id, userId));
	return { url, contentType, maxBytes: MAX_BRB_IMAGE_BYTES };
}

export async function clearBrbImage(
	userId: string,
	client: Pick<ObjectStore, "delete"> = snapshotUploads,
) {
	await db
		.update(appUser)
		.set({ brbImageKey: null, brbSource: "snapshot" })
		.where(eq(appUser.id, userId));
	// Both extensions: the stored key only ever names one, but re-uploading a
	// PNG over a JPG leaves the other object paying for storage forever.
	await Promise.all(
		Object.values(BRB_IMAGE_TYPES).map((extension) =>
			client.delete(`brb/${userId}.${extension}`).catch(() => undefined),
		),
	);
	return { hasImage: false };
}

/**
 * "End the broadcast now", from the dashboard or from the phone's stop button.
 *
 * Clearing `brbSince` alone is not enough: the phone stops before MediaMTX has
 * noticed, so the not-ready hook lands afterwards and `handleSourceGone` would
 * re-arm the hold behind us. A full teardown also moves the provider states out
 * of HOLDABLE_STATES, which is what makes this safe in either order.
 */
export async function stopBrb(userId: string, pathId: number) {
	const [row] = await db
		.select({ id: relayPath.id })
		.from(relayPath)
		.where(
			and(
				eq(relayPath.id, pathId),
				eq(relayPath.userId, userId),
				isNull(relayPath.revokedAt),
			),
		)
		.limit(1);
	if (!row) return false;
	await stopDirectForPaths([pathId]);
	return true;
}
