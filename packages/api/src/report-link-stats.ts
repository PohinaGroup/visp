import { db } from "@VISP/db";
import { pathState, relayPath } from "@VISP/db/schema/index";
import { and, eq, isNull } from "drizzle-orm";
import { LINK_STATS_MIN_INTERVAL_MS } from "./link-stats";

export type LinkStatsInput = {
	bitrateKbps: number;
	packetLossPct: number;
	pathId: number;
	rttMs: number;
	targetBitrateKbps: number;
	userId: string;
};

/**
 * Updates link telemetry on an existing path_state row.
 * Does not create path_state or set publishing — that stays with MediaMTX hooks.
 * Congestion is derived at read time from loss/RTT.
 */
export async function reportLinkStats(input: LinkStatsInput) {
	const [row] = await db
		.select({
			linkStatsAt: pathState.linkStatsAt,
			pathId: pathState.pathId,
		})
		.from(pathState)
		.innerJoin(
			relayPath,
			and(
				eq(relayPath.id, pathState.pathId),
				eq(relayPath.userId, input.userId),
				isNull(relayPath.revokedAt),
			),
		)
		.where(eq(pathState.pathId, input.pathId))
		.limit(1);
	if (!row) return null;

	if (
		row.linkStatsAt &&
		Date.now() - row.linkStatsAt.getTime() < LINK_STATS_MIN_INTERVAL_MS
	) {
		return { ok: true as const, throttled: true as const };
	}

	const now = new Date();
	await db
		.update(pathState)
		.set({
			linkBitrateKbps: input.bitrateKbps,
			linkTargetBitrateKbps: input.targetBitrateKbps,
			linkRttMs: input.rttMs,
			linkPacketLossPct: input.packetLossPct,
			linkStatsAt: now,
		})
		.where(eq(pathState.pathId, input.pathId));
	return { ok: true as const, throttled: false as const };
}
