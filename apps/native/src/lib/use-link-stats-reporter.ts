import {
	formatBondedLinks,
	formatLiveLinkHud,
	LINK_STATS_MIN_INTERVAL_MS,
	nextVideoBitrateKbps,
} from "@VISP/api/link-stats";
import { useCallback, useRef, useState } from "react";
import type { StreamStatsEvent } from "../../modules/visp-srt";
import { apiClient } from "./backend";

function linkHudLabel(stats: StreamStatsEvent) {
	return (
		formatLiveLinkHud(stats, true) +
		(stats.links?.length ? ` · ${formatBondedLinks(stats.links)}` : "")
	);
}

export function useLinkStatsReporter(options: {
	live: boolean;
	pathId: number | undefined;
	setVideoBitrate?: (bitrateKbps: number) => Promise<void> | undefined;
	userId: string | undefined;
	videoBitrateCeilingKbps: number | undefined;
}) {
	const { live, pathId, setVideoBitrate, userId, videoBitrateCeilingKbps } =
		options;
	const [linkStats, setLinkStats] = useState<StreamStatsEvent>();
	const lastAbrAtRef = useRef(0);
	const lastSentAtRef = useRef(0);
	const inFlightRef = useRef(false);

	const clearLinkStats = useCallback(() => {
		setLinkStats(undefined);
	}, []);

	const onStats = useCallback(
		({ nativeEvent }: { nativeEvent: StreamStatsEvent }) => {
			setLinkStats((current) =>
				current && linkHudLabel(current) === linkHudLabel(nativeEvent)
					? current
					: nativeEvent,
			);
			const now = Date.now();
			if (
				live &&
				setVideoBitrate &&
				videoBitrateCeilingKbps &&
				now - lastAbrAtRef.current >= LINK_STATS_MIN_INTERVAL_MS
			) {
				lastAbrAtRef.current = now;
				const next = nextVideoBitrateKbps({
					ceilingKbps: videoBitrateCeilingKbps,
					currentTargetKbps: nativeEvent.targetBitrateKbps,
					packetLossPct: nativeEvent.packetLossPct,
					rttMs: nativeEvent.rttMs,
				});
				if (next !== nativeEvent.targetBitrateKbps) {
					void setVideoBitrate(next)?.catch(() => undefined);
				}
			}
			if (!userId || !live || pathId == null || inFlightRef.current) return;
			if (now - lastSentAtRef.current < LINK_STATS_MIN_INTERVAL_MS) return;
			inFlightRef.current = true;
			void apiClient.paths.reportLinkStats
				.mutate({
					pathId,
					bitrateKbps: nativeEvent.bitrateKbps,
					packetLossPct: nativeEvent.packetLossPct,
					rttMs: nativeEvent.rttMs,
					targetBitrateKbps: nativeEvent.targetBitrateKbps,
					linkCount: nativeEvent.links?.length ?? 1,
					linkDegraded:
						nativeEvent.links != null &&
						nativeEvent.links.filter(({ state }) => state === "connected")
							.length < 2,
				})
				.then(() => {
					lastSentAtRef.current = Date.now();
				})
				.catch(() => undefined)
				.finally(() => {
					inFlightRef.current = false;
				});
		},
		[live, pathId, setVideoBitrate, userId, videoBitrateCeilingKbps],
	);

	return { clearLinkStats, linkStats, onStats };
}
