import { db } from "@VISP/db";
import { pathState, relay, relayPath } from "@VISP/db/schema/index";
import { randomBytes } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { DirectError } from "./direct-model";
import { CLEARED_LINK_STATS } from "./link-stats";
import {
	decryptPublishSecret,
	invalidateAuthCacheForUser,
	revealPublishPath,
} from "./relay";
import { activeDirectRelays, lockRelayAssignments } from "./relays";

export async function movePublishDevice(
	userId: string,
	pathId: number,
	relayId: number,
) {
	await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
		await lockRelayAssignments(tx);
		const [path] = await tx
			.select({
				id: relayPath.id,
				slug: relayPath.slug,
				relayId: relayPath.relayId,
				apiUrl: relay.apiUrl,
				secret: relayPath.publishSecretEncrypted,
			})
			.from(relayPath)
			.innerJoin(relay, eq(relay.id, relayPath.relayId))
			.where(
				and(
					eq(relayPath.id, pathId),
					eq(relayPath.userId, userId),
					isNull(relayPath.revokedAt),
				),
			);
		if (!path) throw new DirectError("not-found", "Device not found");
		if (!path.secret)
			throw new DirectError(
				"invalid",
				"Create a device URL before changing region",
			);
		if (path.relayId === relayId) return;
		decryptPublishSecret(path.secret, userId, pathId);
		const busy = await tx.execute(sql`
			select 1 from path p left join path_state s on s.path_id = p.id
			where p.user_id = ${userId} and p.revoked_at is null and (
				s.publishing = true or s.reader_count > 0
				or p.publish_last_connected_at > now() - interval '60 seconds'
				or p.relay_id in (${activeDirectRelays(userId)})
			) limit 1`);
		if (busy.rows.length)
			throw new DirectError(
				"path-live",
				"Stop all publishers, OBS readers and Direct/BRB outputs, then wait one minute before changing region",
			);
		const target = await tx.execute<{ host: string }>(sql`
			select r.host from relay r where r.id = ${relayId}
			and r.enabled = true and r.drained_at is null
			and (select count(*) from path p where p.relay_id = r.id and p.revoked_at is null) < r.capacity_paths`);
		if (!target.rows.length)
			throw new DirectError(
				"capacity",
				"Selected relay is unavailable or full",
			);
		// Check exact paths; the list endpoint is paginated and can omit a live source.
		for (const name of [path.slug, `studio/${path.slug}`]) {
			let response: Response;
			try {
				response = await fetch(
					`${path.apiUrl.replace(/\/$/, "")}/v3/paths/get/${name.split("/").map(encodeURIComponent).join("/")}`,
					{
						signal: AbortSignal.timeout(3000),
					},
				);
			} catch {
				throw new DirectError(
					"path-live",
					"Could not verify the current relay is offline",
				);
			}
			if (response.status === 404) continue;
			if (!response.ok)
				throw new DirectError(
					"path-live",
					"Could not verify the current relay is offline",
				);
			const body = (await response.json()) as {
				ready?: boolean;
				source?: unknown;
				readers?: unknown[];
			};
			if (typeof body.ready !== "boolean" || !Array.isArray(body.readers)) {
				throw new DirectError(
					"path-live",
					"Could not verify the current relay is offline",
				);
			}
			if (body.ready || body.source || body.readers.length) {
				throw new DirectError(
					"path-live",
					"Stop this device and its readers before changing region",
				);
			}
		}
		// Retire the old address so cached publisher/reader URLs cannot reconnect
		// on the old relay. Keep the device ID, installation and output settings.
		await tx
			.update(relayPath)
			.set({
				relayId,
				slug: `device-${pathId}-${randomBytes(8).toString("hex")}`,
			})
			.where(eq(relayPath.id, pathId));
		await tx
			.update(pathState)
			.set({
				directSourcePathId: null,
				directHandoverTargetPathId: null,
				directHandoverUntil: null,
			})
			.where(
				or(
					eq(pathState.directSourcePathId, pathId),
					eq(pathState.directHandoverTargetPathId, pathId),
				),
			);
		await tx
			.update(pathState)
			.set({
				...CLEARED_LINK_STATS,
				publishing: false,
				readerCount: 0,
				sourceType: null,
				lastEventAt: new Date(),
				directSourcePathId: null,
				directHandoverTargetPathId: null,
				directHandoverUntil: null,
			})
			.where(eq(pathState.pathId, pathId));
	});
	await invalidateAuthCacheForUser(userId);
	return revealPublishPath(userId, pathId);
}
