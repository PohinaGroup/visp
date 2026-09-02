import { useEffect, useRef } from "react";
import type {
	VideoConfiguration,
	VispSrtViewRef,
} from "../../modules/visp-srt";
import { serverOrigin, sessionCookie } from "./backend";
import { resolveAudioIsolationMode } from "./speech-preferences";

export function useAudioIsolation(
	camera: VispSrtViewRef | null,
	{
		betterAvailable,
		betterEnabled,
		configuration,
		enabled,
		onError,
	}: {
		betterAvailable: boolean;
		betterEnabled: boolean;
		configuration?: VideoConfiguration;
		enabled: boolean;
		onError?: (message: string) => void;
	},
) {
	const onErrorRef = useRef(onError);
	onErrorRef.current = onError;

	useEffect(() => {
		if (!camera || !configuration) return;
		const mode = resolveAudioIsolationMode({
			enabled,
			better: betterEnabled,
			betterAvailable,
		});
		void camera
			.setAudioIsolation(mode, serverOrigin(), sessionCookie())
			.catch(() => {
				if (mode === "better") {
					onErrorRef.current?.("Better audio isolation could not start");
				}
			});
	}, [betterAvailable, betterEnabled, camera, configuration, enabled]);
}
