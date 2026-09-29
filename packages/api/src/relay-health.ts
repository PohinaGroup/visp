import { db } from "@VISP/db";
import { relay, relayHealth } from "@VISP/db/schema/index";
import { eq } from "drizzle-orm";

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
	await db
		.insert(relayHealth)
		.values({ relayId: target.id, reportedAt: new Date(), ...metrics })
		.onConflictDoUpdate({
			target: relayHealth.relayId,
			set: { reportedAt: new Date(), ...metrics },
		});
	return true;
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
