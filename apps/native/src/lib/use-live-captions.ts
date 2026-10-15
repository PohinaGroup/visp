import { useEffect, useRef } from "react";
import type { VispSrtViewRef } from "../../modules/visp-srt";
import { apiClient } from "./backend";
import { startLiveCaptions, stopLiveCaptions } from "./live-captions";
import type { SpokenCaptionLanguage } from "./speech-preferences";

export function useLiveCaptions(
	camera: VispSrtViewRef | null,
	{
		active,
		better,
		language,
		onError,
	}: {
		active: boolean;
		better: boolean;
		language?: SpokenCaptionLanguage;
		onError?: (message: string) => void;
	},
) {
	const generation = useRef(0);
	const onErrorRef = useRef(onError);
	onErrorRef.current = onError;

	useEffect(() => {
		if (!active || !language) {
			generation.current += 1;
			void stopLiveCaptions(camera);
			return;
		}
		const current = ++generation.current;
		const isCurrent = () => generation.current === current;
		let report: ReturnType<typeof setInterval> | undefined;
		void startLiveCaptions(camera, language, better, isCurrent).then(
			(result) => {
				// Better captions stream to ElevenLabs directly; the token paid for
				// the first minute and each further minute is reported for the
				// Plus quota.
				if (result === "started" && better && isCurrent()) {
					report = setInterval(() => {
						void apiClient.plan.reportSubtitles
							.mutate({ seconds: 60 })
							.catch(() => undefined);
					}, 60_000);
				}
				if (result === "failed") {
					onErrorRef.current?.(
						better
							? "Better subtitles could not start"
							: "Subtitles could not start. Allow speech recognition in Settings.",
					);
				}
			},
		);
		return () => {
			generation.current += 1;
			if (report) clearInterval(report);
			void stopLiveCaptions(camera);
		};
	}, [active, better, camera, language]);
}
