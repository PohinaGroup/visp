import { db } from "@VISP/db";
import {
	pathState,
	relay,
	relayPath,
	relayStreamSession,
} from "@VISP/db/schema/index";
import type { ObjectStore } from "@VISP/object-store";
import {
	and,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	notInArray,
	or,
	sql,
} from "drizzle-orm";
import { handleSourceGone } from "./brb";
import { cleanupDeletedBrbHighlightsForPath } from "./brb-highlights";
import { announceStreamEvent } from "./chat/alerts";
import { formatDuration } from "./chat/commands";
import { CLEARED_LINK_STATS } from "./link-stats";

export async function applyPathHook(
	event: "ready" | "not-ready" | "read" | "unread",
	input: { path: string; sourceType?: string },
	media?: Pick<ObjectStore, "delete">,
) {
	// The state before this hook is what says whether anything changed, which is
	// the difference between "went live" and "is still live".
	const [path] = await db
		.select({
			id: relayPath.id,
			userId: relayPath.userId,
			publishing: pathState.publishing,
			brbSince: pathState.brbSince,
			directSourcePathId: pathState.directSourcePathId,
		})
		.from(relayPath)
		.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
		.where(and(eq(relayPath.slug, input.path), isNull(relayPath.revokedAt)))
		.limit(1);
	if (!path) {
		return false;
	}

	const now = new Date();
	if (event === "ready" || event === "not-ready") {
		const publishing = event === "ready";
		let promotedOwnerId: number | null = null;
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
						// The publisher is back, so the card comes down and the next
						// drop starts its own BRB window rather than inheriting this one.
						...(publishing
							? {
									brbHighlightsResultAt: sql`case when ${pathState.brbSince} is not null then ${now} else ${pathState.brbHighlightsResultAt} end`,
									brbSince: null,
								}
							: CLEARED_LINK_STATS),
					},
				});
			if (publishing) {
				const [promoted] = await tx
					.update(pathState)
					.set({
						directSourcePathId: path.id,
						directHandoverTargetPathId: null,
						directHandoverUntil: null,
						brbHighlightsResultAt: sql`case when ${pathState.brbSince} is not null then ${now} else ${pathState.brbHighlightsResultAt} end`,
						brbSince: null,
					})
					.where(
						and(
							eq(pathState.directHandoverTargetPathId, path.id),
							gt(pathState.directHandoverUntil, now),
						),
					)
					.returning({ pathId: pathState.pathId });
				promotedOwnerId = promoted?.pathId ?? null;
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
		if (publishing) {
			await cleanupDeletedBrbHighlightsForPath(path.id, media).catch(
				() => undefined,
			);
			if (promotedOwnerId) {
				await cleanupDeletedBrbHighlightsForPath(promotedOwnerId, media).catch(
					() => undefined,
				);
			}
		}
		// The source is gone. Forwarders either hold the broadcast open on the
		// BRB card or get torn down so their slots stop counting.
		if (!publishing) {
			const [replacementOwner] = await db
				.select({ id: relayPath.id, publishing: pathState.publishing })
				.from(pathState)
				.innerJoin(relayPath, eq(relayPath.id, pathState.pathId))
				.where(
					and(
						eq(pathState.directSourcePathId, path.id),
						eq(relayPath.userId, path.userId),
						isNull(relayPath.revokedAt),
					),
				)
				.limit(1);
			if (replacementOwner?.publishing) {
				await db
					.update(pathState)
					.set({ directSourcePathId: null })
					.where(
						and(
							eq(pathState.pathId, replacementOwner.id),
							eq(pathState.directSourcePathId, path.id),
						),
					);
			} else if (replacementOwner) {
				await handleSourceGone(
					[replacementOwner.id],
					path.publishing ? [replacementOwner.id] : [],
				);
			} else if (path.directSourcePathId) {
				const [source] = await db
					.select({ publishing: pathState.publishing })
					.from(pathState)
					.where(eq(pathState.pathId, path.directSourcePathId))
					.limit(1);
				if (!source?.publishing) {
					await handleSourceGone([path.id], path.publishing ? [path.id] : []);
				}
			} else {
				await handleSourceGone([path.id], path.publishing ? [path.id] : []);
			}
		} else if (promotedOwnerId) {
			// The owner already announced this broadcast. Handover is only an input change.
		} else if (path.brbSince) {
			// The card comes down inside the transaction above, so the outage
			// length has to travel with the call rather than be read back.
			void announceStreamEvent(path.id, "back", {
				downtime: formatDuration(now.getTime() - path.brbSince.getTime()),
			});
		} else if (!path.publishing) {
			void announceStreamEvent(path.id, "live");
		}
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

async function directGonePathIds(pathIds: number[]) {
	if (pathIds.length === 0) return [];
	const rows = await db.execute<{
		path_id: number;
		publishing: boolean;
		direct_source_path_id: number | null;
		source_publishing: boolean | null;
	}>(sql`
		select owner.path_id, owner.publishing, owner.direct_source_path_id,
			(select source.publishing from path_state source
				where source.path_id = owner.direct_source_path_id) as source_publishing
		from path_state owner
		where ${inArray(sql`owner.path_id`, pathIds)}
			or ${inArray(sql`owner.direct_source_path_id`, pathIds)}
	`);
	const gone = new Set(pathIds);
	for (const row of rows.rows) {
		if (
			row.direct_source_path_id &&
			pathIds.includes(row.direct_source_path_id)
		) {
			gone.delete(row.direct_source_path_id);
		}
	}
	for (const row of rows.rows) {
		const ownerId = Number(row.path_id);
		const sourceId = row.direct_source_path_id
			? Number(row.direct_source_path_id)
			: null;
		if (sourceId && pathIds.includes(sourceId)) {
			if (row.publishing) {
				await db
					.update(pathState)
					.set({ directSourcePathId: null })
					.where(
						and(
							eq(pathState.pathId, ownerId),
							eq(pathState.directSourcePathId, sourceId),
						),
					);
			} else {
				gone.add(ownerId);
			}
		} else if (pathIds.includes(ownerId) && sourceId && row.source_publishing) {
			gone.delete(ownerId);
		}
	}
	return [...gone];
}

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
			brbSince: pathState.brbSince,
			slug: relayPath.slug,
		})
		.from(relayPath)
		.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
		.where(
			and(
				eq(relayPath.relayId, relayId),
				isNull(relayPath.revokedAt),
				or(
					eq(pathState.publishing, true),
					isNotNull(pathState.directSourcePathId),
					sql`exists (
						select 1 from ${pathState} direct_owner
						where direct_owner.direct_source_path_id = ${relayPath.id}
					)`,
					liveSlugs.length > 0 ? inArray(relayPath.slug, liveSlugs) : undefined,
				),
			),
		);
	const now = new Date();
	const present = paths.filter((path) => live.has(path.slug));
	const publishing = present.filter((path) => live.get(path.slug)?.ready);
	const publishingIds = publishing.map((path) => path.id);
	const stoppedIds = paths
		.filter((path) => !live.get(path.slug)?.ready)
		.map((path) => path.id);

	// Paths whose publishing flag actually flips on this poll. Without it, a
	// device that has been off for an hour re-announces on every tick.
	const becameLive = publishing.filter((path) => !path.publishing);
	let justStopped: number[] = [];
	let promotedSourceIds: number[] = [];

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
						brbSince: sql`case when excluded.publishing then null else ${pathState.brbSince} end`,
					},
				});
		}

		if (stoppedIds.length > 0) {
			justStopped = (
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
					)
					.returning({ pathId: pathState.pathId })
			).map((row) => row.pathId);
		}

		if (publishingIds.length > 0) {
			promotedSourceIds = (
				await tx
					.update(pathState)
					.set({
						directSourcePathId: sql`${pathState.directHandoverTargetPathId}`,
						directHandoverTargetPathId: null,
						directHandoverUntil: null,
						brbHighlightsResultAt: sql`case when ${pathState.brbSince} is not null then ${now} else ${pathState.brbHighlightsResultAt} end`,
						brbSince: null,
					})
					.where(
						and(
							inArray(pathState.directHandoverTargetPathId, publishingIds),
							gt(pathState.directHandoverUntil, now),
						),
					)
					.returning({ sourcePathId: pathState.directSourcePathId })
			).flatMap(({ sourcePathId }) => (sourcePathId ? [sourcePathId] : []));
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

	// A missed not-ready hook must free Direct capacity too — through the same
	// helper, or this poll would tear down a BRB card the hook just raised.
	const goneIds = await directGonePathIds(stoppedIds);
	await handleSourceGone(
		goneIds,
		justStopped.flatMap((id) => (goneIds.includes(id) ? [id] : [])),
	);
	for (const path of becameLive) {
		if (promotedSourceIds.includes(path.id)) continue;
		if (path.brbSince) {
			void announceStreamEvent(path.id, "back", {
				downtime: formatDuration(now.getTime() - path.brbSince.getTime()),
			});
		} else {
			void announceStreamEvent(path.id, "live");
		}
	}
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
