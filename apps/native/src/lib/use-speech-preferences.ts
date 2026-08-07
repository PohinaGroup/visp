import { useCallback, useEffect, useState } from "react";
import {
	audioIsolation,
	betterAudioIsolation,
	betterCaptions,
	type CaptionLanguage,
	loadCaptionLanguage,
	saveCaptionLanguage,
} from "./speech-preferences";

function useStoredPreference<T>(
	fallback: T,
	load: () => Promise<T>,
	save: (value: T) => Promise<void>,
) {
	const [value, setValue] = useState(fallback);

	useEffect(() => {
		void load()
			.then(setValue)
			.catch(() => setValue(fallback));
	}, [fallback, load]);

	const update = useCallback(
		(next: T) => {
			setValue(next);
			void save(next).catch(() => undefined);
		},
		[save],
	);

	return [value, update] as const;
}

export function useSpeechPreferences() {
	const [audioIsolationEnabled, setAudioIsolationEnabled] = useStoredPreference(
		false,
		audioIsolation.load,
		audioIsolation.save,
	);
	const [betterAudioIsolationEnabled, setBetterAudioIsolationEnabled] =
		useStoredPreference(
			false,
			betterAudioIsolation.load,
			betterAudioIsolation.save,
		);
	const [captionLanguage, setCaptionLanguage] =
		useStoredPreference<CaptionLanguage>(
			"off",
			loadCaptionLanguage,
			saveCaptionLanguage,
		);
	const [betterCaptionsEnabled, setBetterCaptionsEnabled] = useStoredPreference(
		false,
		betterCaptions.load,
		betterCaptions.save,
	);

	return {
		audioIsolationEnabled,
		betterAudioIsolationEnabled,
		betterCaptionsEnabled,
		captionLanguage,
		setAudioIsolationEnabled,
		setBetterAudioIsolationEnabled,
		setBetterCaptionsEnabled,
		setCaptionLanguage,
	};
}
