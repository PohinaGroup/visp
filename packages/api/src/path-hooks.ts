import { db } from "@VISP/db";
import {
	pathState,
	relay,
	relayPath,
	relayStreamSession,
} from "@VISP/db/schema/index";
import { and, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { stopDirectForPaths } from "./direct";
import { CLEARED_LINK_STATS } from "./link-stats";

export async function applyPathHook(
	event: "ready" | "not-ready" | "read" | "unread",
	input: { path: string; sourceType?: string },
) {
	const [path] = await db
		.select({ id: relayPath.id })
		.from(relayPath)
		.where(and(eq(relayPath.slug, input.path), isNull(relayPath.revokedAt)))
		.limit(1);
	if (!path) {
		return false;
	}

	const now = new Date();
	if (event === "ready" || event === "not-ready") {
		const publishing = event === "ready";
		await db.transaction(async (tx) => {
			await tx
				.insert(pathState)
				.values({
					pathId: path.id,
					publishing,
					readerCount: 0,
					sourceType: publishing ? input.sourceType : null,
					lastEventAt: now,
				})
				.onConflictDoUpdate({
					target: pathState.pathId,
					set: {
						publishing,
						sourceType: publishing ? input.sourceType : null,
						lastEventAt: now,
						...(publishing ? {} : CLEARED_LINK_STATS),
					},
				});
			if (publishing) {
				await tx
					.insert(relayStreamSession)
					.values({
						pathId: path.id,
						sourceType: input.sourceType,
						startedAt: now,
					})
					.onConflictDoNothing();
			} else {
				await tx
					.update(relayStreamSession)
					.set({ endedAt: now })
					.where(
						and(
							eq(relayStreamSession.pathId, path.id),
							isNull(relayStreamSession.endedAt),
						),
					);
			}
		});
		// The source is gone, so no forwarder can still be running against it.
		// Leaving them counted would hold slots against the concurrency cap.
		if (!publishing) await stopDirectForPaths([path.id]);
		return true;
	}

	const readerCount = event === "read" ? 1 : 0;
	await db
		.insert(pathState)
		.values({ pathId: path.id, readerCount, lastEventAt: now })
		.onConflictDoUpdate({
			target: pathState.pathId,
			set: {
				readerCount:
					event === "read"
						? sql`${pathState.readerCount} + 1`
						: sql`greatest(${pathState.readerCount} - 1, 0)`,
				lastEventAt: now,
			},
		});
	return true;
}

type MediaMtxPath = {
	name?: string;
	readers?: unknown[];
	ready?: boolean;
	source?: { type?: string } | null;
};

async function reconcileRelay(relayId: number, apiUrl: string) {
	const response = await fetch(`${apiUrl.replace(/\/$/, "")}/v3/paths/list`, {
		signal: AbortSignal.timeout(2000),
	});
	if (!response.ok) {
		throw new Error(`MediaMTX reconciliation failed with ${response.status}`);
	}
	const payload = (await response.json()) as { items?: MediaMtxPath[] };
	if (!Array.isArray(payload.items)) {
		throw new Error("MediaMTX reconciliation returned an invalid payload");
	}

	const live = new Map(
		payload.items.flatMap((item) => (item.name ? [[item.name, item]] : [])),
	);
	const liveSlugs = [...live.keys()];
	const paths = await db
		.select({
			id: relayPath.id,
			publishing: pathState.publishing,
			slug: relayPath.slug,
		})
		.from(relayPath)
		.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
		.where(
			and(
				eq(relayPath.relayId, relayId),
				isNull(relayPath.revokedAt),
				liveSlugs.length > 0
					? or(
							inArray(relayPath.slug, liveSlugs),
							eq(pathState.publishing, true),
						)
					: eq(pathState.publishing, true),
			),
		);
	const now = new Date();
	const present = paths.filter((path) => live.has(path.slug));
	const publishing = present.filter((path) => live.get(path.slug)?.ready);
	const publishingIds = publishing.map((path) => path.id);
	const stoppedIds = paths
		.filter((path) => !live.get(path.slug)?.ready)
		.map((path) => path.id);

	await db.transaction(async (tx) => {
		if (present.length > 0) {
			await tx
				.insert(pathState)
				.values(
					present.map((path) => {
						const state = live.get(path.slug);
						return {
							pathId: path.id,
							publishing: state?.ready ?? false,
							readerCount: state?.readers?.length ?? 0,
							sourceType: state?.source?.type ?? null,
							lastEventAt: now,
						};
					}),
				)
				.onConflictDoUpdate({
					target: pathState.pathId,
					set: {
						publishing: sql`excluded.publishing`,
						readerCount: sql`excluded.reader_count`,
						sourceType: sql`excluded.source_type`,
						lastEventAt: sql`excluded.last_event_at`,
						linkBitrateKbps: sql`case when excluded.publishing then ${pathState.linkBitrateKbps} else null end`,
						linkTargetBitrateKbps: sql`case when excluded.publishing then ${pathState.linkTargetBitrateKbps} else null end`,
						linkRttMs: sql`case when excluded.publishing then ${pathState.linkRttMs} else null end`,
						linkPacketLossPct: sql`case when excluded.publishing then ${pathState.linkPacketLossPct} else null end`,
						linkStatsAt: sql`case when excluded.publishing then ${pathState.linkStatsAt} else null end`,
					},
				});
		}

		if (stoppedIds.length > 0) {
			await tx
				.update(pathState)
				.set({
					publishing: false,
					readerCount: 0,
					sourceType: null,
					...CLEARED_LINK_STATS,
				})
				.where(
					and(
						eq(pathState.publishing, true),
						inArray(pathState.pathId, stoppedIds),
					),
				);
		}

		if (publishingIds.length > 0) {
			await tx.execute(sql`
				insert into ${relayStreamSession} (path_id, source_type, started_at)
				select ${pathState.pathId}, ${pathState.sourceType}, ${now}
				from ${pathState}
				where ${inArray(pathState.pathId, publishingIds)}
				on conflict do nothing
			`);
		}

		await tx
			.update(relayStreamSession)
			.set({ endedAt: now })
			.where(
				and(
					isNull(relayStreamSession.endedAt),
					sql`exists (
						select 1 from ${relayPath}
						where ${relayPath.id} = ${relayStreamSession.pathId}
							and ${relayPath.relayId} = ${relayId}
					)`,
					publishingIds.length > 0
						? notInArray(relayStreamSession.pathId, publishingIds)
						: sql`true`,
				),
			);
	});

	// A missed not-ready hook must free Direct capacity too.
	await stopDirectForPaths(stoppedIds);
}

export async function reconcilePathState(apiUrl?: string) {
	const relays = apiUrl
		? await db
				.select({ apiUrl: relay.apiUrl, id: relay.id, name: relay.name })
				.from(relay)
				.where(eq(relay.name, "default"))
				.limit(1)
		: await db
				.select({ apiUrl: relay.apiUrl, id: relay.id, name: relay.name })
				.from(relay)
				.where(eq(relay.enabled, true));
	const targets = apiUrl
		? relays.map((relay) => ({ ...relay, apiUrl }))
		: relays;
	const results = await Promise.allSettled(
		targets.map((relay) => reconcileRelay(relay.id, relay.apiUrl)),
	);
	for (const [index, result] of results.entries()) {
		if (result.status === "rejected") {
			console.error("MediaMTX relay reconciliation failed", {
				relay: targets[index]?.name,
				error: result.reason,
			});
		}
	}
}
