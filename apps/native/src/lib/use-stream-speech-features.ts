import type { ChatAlert, ChatMessage } from "@VISP/api/chat/contract";
import { useCallback, useEffect, useState } from "react";
import { type AppStateStatus, Platform } from "react-native";
import type {
	AudioOutputCapability,
	StreamState,
	VideoConfiguration,
	VispSrtViewRef,
} from "../../modules/visp-srt";
import VispSrtModule from "../../modules/visp-srt";
import { loadSpeechOutput, saveSpeechOutput } from "./audio-preferences";
import type { ChatPreferences } from "./chat-preferences";
import {
	enqueueAlert,
	enqueueChatMessage,
	hasVoiceFor,
	stopChatSpeech,
} from "./chat-speech";
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
	const [speechOutputId, setSpeechOutputId] = useState("default");
	const [speechOutputs, setSpeechOutputs] = useState<AudioOutputCapability[]>(
		[],
	);
	const [currentAudioOutput, setCurrentAudioOutput] = useState<string>();
	const spokenLanguage =
		chatPreferences.speechLanguage === "off"
			? undefined
			: isSpokenLocale(chatPreferences.speechLanguage)
				? chatPreferences.speechLanguage
				: undefined;
	const speechActive = Boolean(spokenLanguage && appState === "active");
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
	const refreshSpeechOutputs = useCallback(async () => {
		if (Platform.OS === "android") {
			const outputs = await VispSrtModule.audioOutputs();
			setSpeechOutputs(outputs);
			setSpeechOutputId((current) => {
				if (current === "default" || outputs.some(({ id }) => id === current)) {
					return current;
				}
				void saveSpeechOutput("default");
				return "default";
			});
		} else if (Platform.OS === "ios") {
			setCurrentAudioOutput(VispSrtModule.currentAudioOutput() ?? undefined);
		}
	}, []);
	const selectSpeechOutput = useCallback(async (outputId: string) => {
		await saveSpeechOutput(outputId);
		setSpeechOutputId(outputId);
	}, []);

	useEffect(() => {
		if (Platform.OS === "android") {
			void Promise.all([loadSpeechOutput(), VispSrtModule.audioOutputs()]).then(
				([stored, outputs]) => {
					setSpeechOutputs(outputs);
					setSpeechOutputId(
						stored === "default" || outputs.some(({ id }) => id === stored)
							? stored
							: "default",
					);
				},
			);
			return;
		}
		if (Platform.OS !== "ios") return;
		void refreshSpeechOutputs();
		const subscription = VispSrtModule.addListener(
			"onAudioRouteChange",
			({ name }) => setCurrentAudioOutput(name),
		);
		return () => subscription.remove();
	}, [refreshSpeechOutputs]);

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
			enqueueChatMessage(message, spokenLanguage, betterVoice, speechOutputId);
		},
		[betterVoice, speechActive, speechOutputId, spokenLanguage],
	);
	const onChatAlert = useCallback(
		(alert: ChatAlert) => {
			if (!speechActive || !spokenLanguage) return;
			enqueueAlert(alert, spokenLanguage, betterVoice, speechOutputId);
		},
		[betterVoice, speechActive, speechOutputId, spokenLanguage],
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
			currentAudioOutput,
			language: spokenLanguage,
			onAlert: onChatAlert,
			onMessage: onChatMessage,
			outputId: speechOutputId,
			outputs: speechOutputs,
			refreshOutputs: refreshSpeechOutputs,
			selectOutput: selectSpeechOutput,
			voiceMissing: speechVoiceMissing,
		},
	};
}
