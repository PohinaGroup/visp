import type { ChatMessage } from "@VISP/api/chat/contract";
import { useCallback, useEffect, useState } from "react";
import type { AppStateStatus } from "react-native";
import type {
	StreamState,
	VideoConfiguration,
	VispSrtViewRef,
} from "../../modules/visp-srt";
import type { ChatPreferences } from "./chat-preferences";
import { enqueueChatMessage, hasVoiceFor, stopChatSpeech } from "./chat-speech";
import { IS_WEB } from "./platform";
import type { SpokenCaptionLanguage } from "./speech-preferences";
import { isSpokenLocale } from "./spoken-language";
import { isPublishing } from "./stream-state";
import { useAudioIsolation } from "./use-audio-isolation";
import { useBetterFeatureFlags } from "./use-better-feature-flags";
import { useLiveCaptions } from "./use-live-captions";
import { useSpeechPreferences } from "./use-speech-preferences";

export function useStreamSpeechFeatures(
	camera: VispSrtViewRef | null,
	{
		appState,
		chatPreferences,
		configuration,
		onSpeechError,
		state,
		userId,
	}: {
		appState: AppStateStatus;
		chatPreferences: ChatPreferences;
		configuration?: VideoConfiguration;
		onSpeechError?: (message: string) => void;
		state: StreamState;
		userId?: string;
	},
) {
	const preferences = useSpeechPreferences();
	const flags = useBetterFeatureFlags(userId);
	const [speechVoiceMissing, setSpeechVoiceMissing] = useState(false);
	const spokenLanguage =
		chatPreferences.speechLanguage === "off"
			? undefined
			: isSpokenLocale(chatPreferences.speechLanguage)
				? chatPreferences.speechLanguage
				: undefined;
	const speechActive = Boolean(
		spokenLanguage && appState === "active" && isPublishing(state),
	);
	const captionLanguageActive =
		preferences.captionLanguage === "off"
			? undefined
			: (preferences.captionLanguage as SpokenCaptionLanguage);
	const captionsActive = Boolean(
		!IS_WEB &&
			captionLanguageActive &&
			appState === "active" &&
			isPublishing(state),
	);
	const betterCaptions =
		flags.betterSubtitlesAvailable &&
		preferences.betterCaptionsEnabled &&
		Boolean(captionLanguageActive);
	const betterVoice = flags.betterTts && !IS_WEB && chatPreferences.betterVoice;

	useAudioIsolation(camera, {
		betterAvailable: flags.betterAudioIsolationAvailable,
		betterEnabled: preferences.betterAudioIsolationEnabled,
		configuration,
		enabled: preferences.audioIsolationEnabled,
		onError: onSpeechError,
	});
	useLiveCaptions(camera, {
		active: captionsActive,
		better: betterCaptions,
		language: captionLanguageActive,
		onError: onSpeechError,
	});

	useEffect(() => {
		if (speechActive) return () => stopChatSpeech();
		stopChatSpeech();
	}, [speechActive]);

	useEffect(() => {
		if (!spokenLanguage) {
			setSpeechVoiceMissing(false);
			return;
		}
		let disposed = false;
		void hasVoiceFor(spokenLanguage).then((available) => {
			if (!disposed) setSpeechVoiceMissing(!available);
		});
		return () => {
			disposed = true;
		};
	}, [spokenLanguage]);

	const onChatMessage = useCallback(
		(message: ChatMessage) => {
			if (!speechActive || !spokenLanguage) return;
			enqueueChatMessage(message, spokenLanguage, betterVoice);
		},
		[betterVoice, speechActive, spokenLanguage],
	);

	return {
		captions: {
			active: captionsActive,
			better: betterCaptions,
			language: captionLanguageActive,
		},
		flags,
		preferences,
		speech: {
			active: speechActive,
			language: spokenLanguage,
			onMessage: onChatMessage,
			voiceMissing: speechVoiceMissing,
		},
	};
}
