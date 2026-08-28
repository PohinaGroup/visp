import { useCallback, useEffect, useState } from "react";
import { apiClient } from "./backend";

export function useBetterFeatureFlags(userId?: string) {
	const [betterAudioIsolationAvailable, setBetterAudioIsolationAvailable] =
		useState(false);
	const [betterSubtitlesAvailable, setBetterSubtitlesAvailable] =
		useState(false);
	const [betterTts, setBetterTts] = useState(false);

	const refreshAvailability = useCallback(async () => {
		if (!userId) {
			setBetterAudioIsolationAvailable(false);
			setBetterSubtitlesAvailable(false);
			setBetterTts(false);
			return;
		}
		try {
			const available = await apiClient.chat.speech.query();
			setBetterAudioIsolationAvailable(available.betterAudioIsolation);
			setBetterSubtitlesAvailable(available.betterSubtitles);
			setBetterTts(available.betterTts);
		} catch {
			setBetterAudioIsolationAvailable(false);
			setBetterSubtitlesAvailable(false);
			setBetterTts(false);
		}
	}, [userId]);

	useEffect(() => {
		void refreshAvailability();
	}, [refreshAvailability]);

	return {
		betterAudioIsolationAvailable,
		betterSubtitlesAvailable,
		betterTts,
		refreshAvailability,
	};
}
