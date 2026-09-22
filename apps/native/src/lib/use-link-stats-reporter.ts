import {
	deliveryHealth,
	formatBondedLinks,
	formatLiveLinkHud,
	LINK_STATS_FRESH_MS,
	LINK_STATS_MIN_INTERVAL_MS,
	nextTelemetryBackoffMs,
	nextVideoBitrateKbps,
	videoBitrateFloorKbps,
} from "@VISP/api/link-stats";
import { useCallback, useEffect, useRef, useState } from "react";
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
	const [linkStatsFresh, setLinkStatsFresh] = useState(false);
	const [qualityFallbackRecommended, setQualityFallbackRecommended] =
		useState(false);
	const lastStatsAtRef = useRef(0);
	const congestedAtFloorSinceRef = useRef<number | undefined>(undefined);
	const lastAbrAtRef = useRef(0);
	const lastSentAtRef = useRef(0);
	const inFlightRef = useRef(false);
	const backoffMsRef = useRef(0);
	const retryAtRef = useRef(0);

	const clearLinkStats = useCallback(() => {
		setLinkStats(undefined);
		setLinkStatsFresh(false);
		setQualityFallbackRecommended(false);
		lastStatsAtRef.current = 0;
		congestedAtFloorSinceRef.current = undefined;
	}, []);

	useEffect(() => {
		if (!live) {
			setLinkStatsFresh(false);
			return;
		}
		const updateFreshness = () => {
			const fresh = Date.now() - lastStatsAtRef.current < LINK_STATS_FRESH_MS;
			setLinkStatsFresh((current) => (current === fresh ? current : fresh));
		};
		updateFreshness();
		const interval = setInterval(updateFreshness, 1_000);
		return () => clearInterval(interval);
	}, [live]);

	const onStats = useCallback(
		({ nativeEvent }: { nativeEvent: StreamStatsEvent }) => {
			lastStatsAtRef.current = Date.now();
			setLinkStatsFresh(true);
			setLinkStats((current) =>
				current && linkHudLabel(current) === linkHudLabel(nativeEvent)
					? current
					: nativeEvent,
			);
			const now = Date.now();
			if (live && videoBitrateCeilingKbps) {
				const strugglingAtFloor =
					nativeEvent.targetBitrateKbps <=
						videoBitrateFloorKbps(videoBitrateCeilingKbps) &&
					deliveryHealth(nativeEvent) === "congested";
				if (strugglingAtFloor) {
					congestedAtFloorSinceRef.current ??= now;
					if (now - congestedAtFloorSinceRef.current >= 15_000) {
						setQualityFallbackRecommended(true);
					}
				} else {
					congestedAtFloorSinceRef.current = undefined;
					setQualityFallbackRecommended(false);
				}
			}
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
					srt: nativeEvent,
				});
				if (next !== nativeEvent.targetBitrateKbps) {
					void setVideoBitrate(next)?.catch(() => undefined);
				}
			}
			if (!userId || !live || pathId == null || inFlightRef.current) return;
			if (now - lastSentAtRef.current < LINK_STATS_MIN_INTERVAL_MS) return;
			if (now < retryAtRef.current) return;
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
					backoffMsRef.current = 0;
					retryAtRef.current = 0;
				})
				.catch(() => {
					backoffMsRef.current = nextTelemetryBackoffMs(backoffMsRef.current);
					retryAtRef.current = Date.now() + backoffMsRef.current;
				})
				.finally(() => {
					inFlightRef.current = false;
				});
		},
		[live, pathId, setVideoBitrate, userId, videoBitrateCeilingKbps],
	);

	return {
		clearLinkStats,
		linkStats,
		linkStatsFresh,
		onStats,
		qualityFallbackRecommended,
	};
}
