export const LINK_STATS_FRESH_MS = 15_000;
export const LINK_STATS_MIN_INTERVAL_MS = 1_500;

/** Soft ABR step thresholds (web publisher). Hard congestion uses isLinkCongested. */
export const LINK_SOFT_LOSS_PCT = 0.5;
export const LINK_SOFT_RTT_MS = 250;
export const LINK_HEALTHY_LOSS_PCT = 0.2;
export const LINK_HEALTHY_RTT_MS = 150;

/**
 * Shared dashboard / display congestion thresholds.
 * Platform ABR adapters (Pedro, HaishinKit) may use their own signals;
 * web ABR and dashboard "Congested" use these predicates.
 */
export function isLinkCongested(packetLossPct: number, rttMs: number): boolean {
	return packetLossPct >= 2 || rttMs >= 400;
}

/** Core outbound link sample shared by native stats events and dashboard views. */
export type LinkMetrics = {
	bitrateKbps: number;
	packetLossPct: number;
	rttMs: number;
	targetBitrateKbps: number;
};

export type LinkStatsView = LinkMetrics & {
	congested: boolean;
	updatedAt: string;
};

export function linkStatsFromPath(path: {
	linkBitrateKbps: number | null;
	linkPacketLossPct: number | null;
	linkRttMs: number | null;
	linkStatsAt: Date | null;
	linkTargetBitrateKbps: number | null;
	publishing: boolean | null;
}): LinkStatsView | null {
	if (
		!path.publishing ||
		path.linkStatsAt == null ||
		path.linkBitrateKbps == null ||
		path.linkTargetBitrateKbps == null ||
		path.linkRttMs == null ||
		path.linkPacketLossPct == null
	) {
		return null;
	}
	if (Date.now() - path.linkStatsAt.getTime() > LINK_STATS_FRESH_MS) {
		return null;
	}
	return {
		bitrateKbps: path.linkBitrateKbps,
		congested: isLinkCongested(path.linkPacketLossPct, path.linkRttMs),
		packetLossPct: path.linkPacketLossPct,
		rttMs: path.linkRttMs,
		targetBitrateKbps: path.linkTargetBitrateKbps,
		updatedAt: path.linkStatsAt.toISOString(),
	};
}

export function formatLinkStats(
	stats: Pick<LinkMetrics, "bitrateKbps" | "packetLossPct" | "rttMs">,
): string {
	const mbps = (stats.bitrateKbps / 1000).toFixed(1);
	const loss =
		stats.packetLossPct < 10
			? stats.packetLossPct.toFixed(1)
			: String(Math.round(stats.packetLossPct));
	return `${mbps} Mb/s · ${Math.round(stats.rttMs)} ms · ${loss}%`;
}

/** Live HUD suffix when publishing with a fresh sample. */
export function formatLiveLinkHud(
	stats:
		| Pick<LinkMetrics, "bitrateKbps" | "packetLossPct" | "rttMs">
		| undefined,
	live: boolean,
): string {
	if (!live || !stats) return "";
	return ` · ${formatLinkStats(stats)}`;
}

/** Columns cleared when a path stops publishing. */
export const CLEARED_LINK_STATS = {
	linkBitrateKbps: null,
	linkTargetBitrateKbps: null,
	linkRttMs: null,
	linkPacketLossPct: null,
	linkStatsAt: null,
} as const;

/** Video bitrate ceiling (kbps) for a capture format. */
export function videoBitrateCeilingKbps(
	width: number,
	height: number,
	fps: number,
): number {
	const short = Math.min(width, height);
	const long = Math.max(width, height);
	if (long >= 1920 && short >= 1080) {
		return fps >= 50 ? 8000 : 6000;
	}
	return 3500;
}

/** Lowest ABR target (kbps) for a given ceiling. */
export function videoBitrateFloorKbps(ceilingKbps: number): number {
	return Math.max(500, Math.floor(ceilingKbps / 10));
}

/** Clamp a target bitrate into [floor, ceiling]. */
export function clampVideoBitrateKbps(
	targetKbps: number,
	ceilingKbps: number,
): number {
	const floor = videoBitrateFloorKbps(ceilingKbps);
	return Math.min(ceilingKbps, Math.max(floor, Math.round(targetKbps)));
}

/**
 * Step ABR target from measured link health (web publisher).
 * Native iOS/Android use SDK adapters with the same ceiling from configure().
 */
export function nextVideoBitrateKbps(input: {
	ceilingKbps: number;
	currentTargetKbps: number;
	packetLossPct: number;
	rttMs: number;
}): number {
	const { ceilingKbps, packetLossPct, rttMs } = input;
	let next = input.currentTargetKbps;
	const step = Math.max(250, Math.round(ceilingKbps / 10));

	if (isLinkCongested(packetLossPct, rttMs)) {
		next -= step;
	} else if (packetLossPct >= LINK_SOFT_LOSS_PCT || rttMs >= LINK_SOFT_RTT_MS) {
		next -= Math.round(step / 2);
	} else if (
		packetLossPct < LINK_HEALTHY_LOSS_PCT &&
		rttMs < LINK_HEALTHY_RTT_MS
	) {
		next += Math.round(step / 2);
	}

	return clampVideoBitrateKbps(next, ceilingKbps);
}
