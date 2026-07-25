import { LINK_STATS_MIN_INTERVAL_MS } from "@VISP/api/link-stats";
import { useCallback, useRef, useState } from "react";
import type { StreamStatsEvent } from "../../modules/visp-srt";
import { apiClient } from "./backend";

export function useLinkStatsReporter(options: {
	live: boolean;
	pathId: number | undefined;
	userId: string | undefined;
}) {
	const { live, pathId, userId } = options;
	const [linkStats, setLinkStats] = useState<StreamStatsEvent>();
	const lastSentAtRef = useRef(0);
	const inFlightRef = useRef(false);

	const clearLinkStats = useCallback(() => {
		setLinkStats(undefined);
	}, []);

	const onStats = useCallback(
		({ nativeEvent }: { nativeEvent: StreamStatsEvent }) => {
			setLinkStats(nativeEvent);
			if (!userId || !live || pathId == null || inFlightRef.current) return;
			const now = Date.now();
			if (now - lastSentAtRef.current < LINK_STATS_MIN_INTERVAL_MS) return;
			inFlightRef.current = true;
			void apiClient.paths.reportLinkStats
				.mutate({
					pathId,
					bitrateKbps: nativeEvent.bitrateKbps,
					packetLossPct: nativeEvent.packetLossPct,
					rttMs: nativeEvent.rttMs,
					targetBitrateKbps: nativeEvent.targetBitrateKbps,
				})
				.then(() => {
					lastSentAtRef.current = Date.now();
				})
				.catch(() => undefined)
				.finally(() => {
					inFlightRef.current = false;
				});
		},
		[live, pathId, userId],
	);

	return { clearLinkStats, linkStats, onStats };
}
