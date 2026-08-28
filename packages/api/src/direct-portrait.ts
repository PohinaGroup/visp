import { db } from "@VISP/db";
import {
	appUser,
	type DirectCrop,
	directDestination,
	pathState,
	relay,
	relayPath,
} from "@VISP/db/schema/index";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { buildPortraitFilter, directCropError } from "./direct-crop";
import {
	DIRECT_RESERVATION_MS,
	DIRECT_RUNNING_STATES,
	DirectError,
	type DirectProvider,
	type DirectRole,
	type DirectState,
} from "./direct-model";
import { DIRECT_OCCUPIED_STATES_SQL } from "./direct-occupancy";

export const DEFAULT_PORTRAIT_CROP: DirectCrop = {
	x: 0.3418,
	y: 0,
	w: 0.3164,
	h: 1,
	aspect: "9:16",
};

function validCrop(crop: DirectCrop) {
	const error = directCropError(crop);
	if (error) throw new DirectError("invalid", error);
	return crop;
}

export function portraitFilterValue(crop: DirectCrop) {
	return buildPortraitFilter(validCrop(crop));
}

export function listPortraitDestinations(userId: string) {
	return db
		.select({
			id: directDestination.id,
			pathId: directDestination.pathId,
			provider: directDestination.provider,
			role: directDestination.role,
			crop: directDestination.crop,
			state: directDestination.state,
			error: directDestination.error,
			reservedUntil: directDestination.reservedUntil,
		})
		.from(directDestination)
		.innerJoin(relayPath, eq(relayPath.id, directDestination.pathId))
		.where(
			and(
				eq(directDestination.userId, userId),
				eq(directDestination.role, "portrait"),
				isNull(relayPath.revokedAt),
			),
		);
}

export function listRelayPortraitDestinations(pathId: number) {
	return db
		.select({
			provider: directDestination.provider,
			crop: directDestination.crop,
			reservedUntil: directDestination.reservedUntil,
		})
		.from(directDestination)
		.innerJoin(appUser, eq(appUser.id, directDestination.userId))
		.where(
			and(
				eq(directDestination.pathId, pathId),
				eq(directDestination.role, "portrait"),
				eq(appUser.directDualOutput, true),
				or(
					isNull(directDestination.state),
					ne(directDestination.state, "stopping"),
				),
			),
		);
}

async function portraitPath(userId: string, pathId: number) {
	const [path] = await db
		.select({
			id: relayPath.id,
			relayId: relayPath.relayId,
			publishing: pathState.publishing,
			enabled: appUser.directDualOutput,
			maxForwarders: relay.maxForwarders,
		})
		.from(relayPath)
		.innerJoin(appUser, eq(appUser.id, relayPath.userId))
		.innerJoin(relay, eq(relay.id, relayPath.relayId))
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
	if (!path.enabled)
		throw new DirectError("not-found", "Portrait output is unavailable");
	return path;
}

export async function setDirectRole(
	userId: string,
	pathId: number,
	provider: DirectProvider,
	role: DirectRole,
) {
	const path = await portraitPath(userId, pathId);
	if (role === "landscape") {
		const target = and(
			eq(directDestination.userId, userId),
			eq(directDestination.pathId, pathId),
			eq(directDestination.provider, provider),
			eq(directDestination.role, "portrait"),
		);
		if (!path.publishing) {
			await db.delete(directDestination).where(target);
			return {
				pathId,
				provider,
				role,
				overCapacity: false,
				removalPending: false,
			};
		}
		const transitioned = await db
			.update(directDestination)
			.set({ state: "stopping", error: null })
			.where(
				and(target, inArray(directDestination.state, DIRECT_RUNNING_STATES)),
			)
			.returning({ id: directDestination.id });
		if (transitioned.length > 0) {
			return {
				pathId,
				provider,
				role,
				overCapacity: false,
				removalPending: true,
			};
		}
		await db
			.delete(directDestination)
			.where(
				and(
					target,
					or(
						isNull(directDestination.state),
						inArray(directDestination.state, ["failed", "stopped"]),
					),
				),
			);
		const [pending] = await db
			.select({ id: directDestination.id })
			.from(directDestination)
			.where(and(target, eq(directDestination.state, "stopping")))
			.limit(1);
		return {
			pathId,
			provider,
			role,
			overCapacity: false,
			removalPending: Boolean(pending),
		};
	}

	const existingLandscape = await db
		.select({ id: relayPath.id })
		.from(relayPath)
		.where(
			and(
				eq(relayPath.userId, userId),
				isNull(relayPath.revokedAt),
				provider === "twitch"
					? eq(relayPath.directTwitch, true)
					: provider === "kick"
						? eq(relayPath.directKick, true)
						: eq(relayPath.directYoutube, true),
			),
		)
		.limit(1);
	if (existingLandscape.length > 0) {
		throw new DirectError(
			"provider-taken",
			`${provider} is already a landscape destination`,
		);
	}
	const reservedUntil = new Date(Date.now() + DIRECT_RESERVATION_MS);
	await db
		.insert(directDestination)
		.values({
			userId,
			pathId,
			provider,
			role: "portrait",
			crop: DEFAULT_PORTRAIT_CROP,
			reservedUntil,
		})
		.onConflictDoUpdate({
			target: [
				directDestination.userId,
				directDestination.provider,
				directDestination.role,
			],
			set: { pathId, reservedUntil, state: null, error: null },
		});

	const capacity = await db.execute(sql<{ count: number }>`
		select (
			count(*) filter (where s.direct_twitch_state in ${DIRECT_OCCUPIED_STATES_SQL} or s.direct_twitch_reserved_until > now()) +
			count(*) filter (where s.direct_kick_state in ${DIRECT_OCCUPIED_STATES_SQL} or s.direct_kick_reserved_until > now()) +
			count(*) filter (where s.direct_youtube_state in ${DIRECT_OCCUPIED_STATES_SQL} or s.direct_youtube_reserved_until > now()) +
			(select count(*) from direct_destination d join path dp on dp.id = d.path_id where dp.relay_id = ${path.relayId} and dp.revoked_at is null and (d.state in ${DIRECT_OCCUPIED_STATES_SQL} or d.reserved_until > now()))
		)::int as count
		from path p join path_state s on s.path_id = p.id
		where p.relay_id = ${path.relayId} and p.revoked_at is null
	`);
	return {
		pathId,
		provider,
		role,
		overCapacity: Number(capacity.rows[0]?.count ?? 0) >= path.maxForwarders,
		removalPending: false,
	};
}

export async function saveDirectCrop(
	userId: string,
	pathId: number,
	provider: DirectProvider,
	crop: DirectCrop,
) {
	await portraitPath(userId, pathId);
	const [saved] = await db
		.update(directDestination)
		.set({
			crop: validCrop(crop),
			reservedUntil: new Date(Date.now() + DIRECT_RESERVATION_MS),
		})
		.where(
			and(
				eq(directDestination.userId, userId),
				eq(directDestination.pathId, pathId),
				eq(directDestination.provider, provider),
				eq(directDestination.role, "portrait"),
			),
		)
		.returning({ id: directDestination.id, crop: directDestination.crop });
	if (!saved)
		throw new DirectError("not-found", "Portrait destination not found");
	return saved;
}

export async function portraitDestinationActive(input: {
	pathId: number;
	provider: DirectProvider;
	filter?: string | null;
}) {
	const [portrait] = await db
		.select({ crop: directDestination.crop, state: directDestination.state })
		.from(directDestination)
		.where(
			and(
				eq(directDestination.pathId, input.pathId),
				eq(directDestination.provider, input.provider),
				eq(directDestination.role, "portrait"),
			),
		)
		.limit(1);
	return Boolean(
		portrait?.state !== "stopping" &&
			portrait?.crop &&
			portraitFilterValue(portrait.crop) === input.filter,
	);
}

export async function applyPortraitState(
	pathId: number,
	input: {
		provider: DirectProvider;
		state: DirectState;
		error?: string | null;
	},
	sanitizeError: (value: string | null | undefined) => string | null,
) {
	const target = and(
		eq(directDestination.pathId, pathId),
		eq(directDestination.provider, input.provider),
		eq(directDestination.role, "portrait"),
	);
	if (input.state === "stopped") {
		const removed = await db
			.delete(directDestination)
			.where(and(target, eq(directDestination.state, "stopping")))
			.returning({ id: directDestination.id });
		if (removed.length > 0) return true;
	}
	const result = await db
		.update(directDestination)
		.set({
			state: input.state,
			error: sanitizeError(input.error),
			...(input.state === "failed" || input.state === "stopped"
				? { reservedUntil: null }
				: {}),
		})
		.where(
			input.state === "stopping"
				? and(target, eq(directDestination.state, "stopping"))
				: and(
						target,
						or(
							isNull(directDestination.state),
							ne(directDestination.state, "stopping"),
						),
					),
		)
		.returning({ id: directDestination.id });
	if (input.state === "stopped" && result.length === 0) {
		const removed = await db
			.delete(directDestination)
			.where(and(target, eq(directDestination.state, "stopping")))
			.returning({ id: directDestination.id });
		return removed.length > 0;
	}
	return result.length > 0;
}
