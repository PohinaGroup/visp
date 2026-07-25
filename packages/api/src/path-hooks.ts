import { db } from "@VISP/db";
import { pathState, relayPath } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, eq, isNull, sql } from "drizzle-orm";
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
		await db
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

export async function reconcilePathState(apiUrl = env.MEDIAMTX_API_URL) {
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
	const paths = await db
		.select({ id: relayPath.id, slug: relayPath.slug })
		.from(relayPath)
		.where(isNull(relayPath.revokedAt));
	const now = new Date();

	await db.transaction(async (tx) => {
		// ponytail: O(n) upserts are fine for trusted v1; bulk-upsert when path count becomes material.
		for (const path of paths) {
			const state = live.get(path.slug);
			const publishing = state?.ready ?? false;
			await tx
				.insert(pathState)
				.values({
					pathId: path.id,
					publishing,
					readerCount: state?.readers?.length ?? 0,
					sourceType: state?.source?.type ?? null,
					lastEventAt: now,
				})
				.onConflictDoUpdate({
					target: pathState.pathId,
					set: {
						publishing,
						readerCount: state?.readers?.length ?? 0,
						sourceType: state?.source?.type ?? null,
						lastEventAt: now,
						...(publishing ? {} : CLEARED_LINK_STATS),
					},
				});
		}
	});
}
