import { db } from "@VISP/db";
import { relay, relayHealth, relayHealthSample } from "@VISP/db/schema/index";
import { eq, sql } from "drizzle-orm";
import { DIRECT_OCCUPIED_STATES_SQL } from "./direct-occupancy";

export type RelayHealthReport = {
	relay: string;
	cpuCount: number;
	load1: number;
	load5: number;
	load15: number;
	memTotalKb: number;
	memAvailableKb: number;
	diskTotalKb: number;
	diskAvailableKb: number;
	uptimeSeconds: number;
};

/**
 * Stores one host-metrics sample from a relay's health timer. Returns false
 * when the reported name is not a registered relay — a relay that was renamed
 * in admin should show as dark, not silently write nothing.
 */
export async function reportRelayHealth(report: RelayHealthReport) {
	const [target] = await db
		.select({ id: relay.id })
		.from(relay)
		.where(eq(relay.name, report.relay))
		.limit(1);
	if (!target) return false;
	const { relay: _name, ...metrics } = report;
	const reportedAt = new Date();
	await db
		.insert(relayHealth)
		.values({ relayId: target.id, reportedAt, ...metrics })
		.onConflictDoUpdate({
			target: relayHealth.relayId,
			set: { reportedAt, ...metrics },
		});
	// History row. A duplicate (same relay, same instant) is a retried push of
	// the same sample, so it is dropped rather than overwriting.
	await db
		.insert(relayHealthSample)
		.values({
			relayId: target.id,
			reportedAt,
			load1: report.load1,
			cpuCount: report.cpuCount,
			memUsedPct: usedPct(report.memTotalKb, report.memAvailableKb),
			diskUsedPct: usedPct(report.diskTotalKb, report.diskAvailableKb),
			livePaths: sql`(
				select count(*)::int from "path" sample_path
				join path_state sample_state on sample_state.path_id = sample_path.id
				where sample_path.relay_id = ${target.id}
					and sample_path.revoked_at is null
					and sample_state.publishing
			)`,
			activeForwarders: relayActiveForwarders(target.id),
		})
		.onConflictDoNothing();
	return true;
}

/** Share of a kb total in use, 0–100. A zero total (bad probe) reads as 0. */
export function usedPct(totalKb: number, availableKb: number) {
	if (!(totalKb > 0)) return 0;
	const pct = ((totalKb - availableKb) / totalKb) * 100;
	return Math.min(100, Math.max(0, pct));
}

/**
 * Forwarders running on a relay, counted exactly like the admin relay list's
 * "active forwarders" column (legacy provider forwarders plus portrait
 * destinations in an occupied state) so a chart and the live number agree.
 */
function relayActiveForwarders(relayId: number) {
	return sql<number>`(
		select (
			count(*) filter (where sample_state.direct_twitch_state in ${DIRECT_OCCUPIED_STATES_SQL}) +
			count(*) filter (where sample_state.direct_kick_state in ${DIRECT_OCCUPIED_STATES_SQL}) +
			count(*) filter (where sample_state.direct_youtube_state in ${DIRECT_OCCUPIED_STATES_SQL}) +
			(select count(*) from direct_destination sample_portrait
				join "path" sample_portrait_path on sample_portrait_path.id = sample_portrait.path_id
				where sample_portrait_path.relay_id = ${relayId}
					and sample_portrait_path.revoked_at is null
					and sample_portrait.state in ${DIRECT_OCCUPIED_STATES_SQL})
		)::int
		from "path" sample_path
		join path_state sample_state on sample_state.path_id = sample_path.id
		where sample_path.relay_id = ${relayId}
			and sample_path.revoked_at is null
	)`;
}

export type RelayApiProbe = {
	reachable: boolean;
	responseMs: number | null;
	livePaths: number | null;
};

/**
 * Asks a relay's MediaMTX control API whether it is answering, and how fast.
 * Unauthenticated by design: the API only listens on the Tailscale address.
 */
export async function probeRelayApi(
	apiUrl: string,
	timeoutMs = 2000,
): Promise<RelayApiProbe> {
	const startedAt = performance.now();
	try {
		const response = await fetch(`${apiUrl.replace(/\/$/, "")}/v3/paths/list`, {
			signal: AbortSignal.timeout(timeoutMs),
		});
		const responseMs = Math.round(performance.now() - startedAt);
		if (!response.ok) return { reachable: false, responseMs, livePaths: null };
		const payload = (await response.json()) as {
			items?: { ready?: boolean }[];
		};
		return {
			reachable: true,
			responseMs,
			livePaths: Array.isArray(payload.items)
				? payload.items.filter((item) => item.ready).length
				: null,
		};
	} catch {
		return { reachable: false, responseMs: null, livePaths: null };
	}
}
