import { PROVIDER_SCOPES } from "@VISP/api/scopes";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import type {
	AudioInputCapability,
	BondingMode,
	CameraCapability,
	VideoConfiguration,
	VispSrtViewRef,
} from "../../modules/visp-srt";
import type { ChatSettings } from "../components/stream-settings-chat-section";
import type { StreamSettingsSheetProps } from "../components/stream-settings-sheet";
import { authClient } from "./backend";
import type { useStreamAccount } from "./use-stream-account";
import type { useStreamSpeechFeatures } from "./use-stream-speech-features";

export function useStreamSettingsModel({
	audioInputs,
	bondingMode,
	camera,
	cameraSwitchDisabled,
	cameras,
	chatEnabled,
	chatErrors,
	chatStatuses,
	configuration,
	directContribution,
	imageStabilizationEnabled,
	isPresented,
	onApplyAudioInput,
	onApplyConfiguration,
	onRemoveDestination,
	onRetryCamera,
	onSelectCamera,
	onUpdateBondingMode,
	onUpdateImageStabilization,
	publishPathId,
	selectedAudioInputId,
	sessionUser,
	setDraft,
	setEditing,
	setIsPresented,
	settingsDisabled,
	showToast,
	speechFeatures,
	streamAccount,
	streamUrl,
}: {
	audioInputs: AudioInputCapability[];
	bondingMode: BondingMode;
	camera: VispSrtViewRef | null;
	cameraSwitchDisabled: boolean;
	cameras: CameraCapability[];
	chatEnabled: boolean;
	chatErrors: ChatSettings["errors"];
	chatStatuses: ChatSettings["statuses"];
	configuration?: VideoConfiguration;
	directContribution: boolean;
	imageStabilizationEnabled: boolean;
	isPresented: boolean;
	onApplyAudioInput: (audioInputId: string) => void;
	onApplyConfiguration: (configuration: VideoConfiguration) => void;
	onRemoveDestination: () => void;
	onRetryCamera: () => Promise<void>;
	onSelectCamera: (camera: CameraCapability) => void;
	onUpdateBondingMode: (mode: BondingMode) => Promise<void>;
	onUpdateImageStabilization: (enabled: boolean) => void;
	publishPathId?: number;
	selectedAudioInputId: string;
	sessionUser?: { email: string; name: string };
	setDraft: Dispatch<SetStateAction<string>>;
	setEditing: Dispatch<SetStateAction<boolean>>;
	setIsPresented: Dispatch<SetStateAction<boolean>>;
	settingsDisabled: boolean;
	showToast: (message: string) => void;
	speechFeatures: ReturnType<typeof useStreamSpeechFeatures>;
	streamAccount: ReturnType<typeof useStreamAccount>;
	streamUrl: string | null;
}): StreamSettingsSheetProps {
	const [accountOpen, setAccountOpen] = useState(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const { captions, flags, preferences, speech } = speechFeatures;

	return {
		account: sessionUser
			? {
					...sessionUser,
					linkedAccounts: streamAccount.linkedAccounts,
					onSignOut: () => {
						setIsPresented(false);
						void (async () => {
							await camera?.stop();
							await authClient.signOut();
						})();
					},
				}
			: undefined,
		accountOpen,
		advanced: {
			installationId: streamAccount.installationId,
			onRevealPublishDevice: streamAccount.revealPublishDevice,
			publishDevices: streamAccount.publishDevices,
			revealedDeviceUrls: streamAccount.revealedDeviceUrls,
		},
		advancedOpen,
		camera: {
			audioInputs,
			cameraSwitchDisabled,
			cameras,
			configuration,
			directContribution,
			imageStabilizationEnabled,
			onApplyAudioInput,
			onApplyConfiguration,
			onRetry: onRetryCamera,
			onSelectCamera,
			onUpdateImageStabilization,
			selectedAudioInputId,
			settingsDisabled,
		},
		chat: {
			betterTts: flags.betterTts,
			busy: Boolean(streamAccount.chatBusy),
			connections: streamAccount.chatConnections,
			currentAudioOutput: speech.currentAudioOutput,
			enabled: chatEnabled,
			errors: chatErrors,
			onSelectOutput: speech.selectOutput,
			onReauthorizeConnection: streamAccount.reauthorizeChatProvider,
			onToggleConnection: streamAccount.toggleChatConnection,
			onUnlinkConnection: streamAccount.unlinkChatProvider,
			onUpdatePreferences: streamAccount.updateChatPreferences,
			outputId: speech.outputId,
			outputs: speech.outputs,
			preferences: streamAccount.chatPreferences,
			speechVoiceMissing: speech.voiceMissing,
			spokenLanguage: speech.language,
			statuses: chatStatuses,
		},
		destination: {
			onEdit: () => {
				setIsPresented(false);
				setDraft("");
				setEditing(true);
			},
			onRemove: onRemoveDestination,
			streamUrl,
		},
		direct: {
			busy: Boolean(streamAccount.chatBusy),
			directOutputs: streamAccount.directOutputs,
			onApplyDirectSelection: streamAccount.applyDirectSelection,
			onAuthorizeDirect: (provider) =>
				streamAccount.linkProvider(
					provider,
					PROVIDER_SCOPES[provider].streamKeyRequest,
				),
			onUpdateYoutubeTitle: streamAccount.updateYoutubeTitle,
			publishPathId,
		},
		isPresented,
		network: {
			bondingMode,
			onUpdateBondingMode: async (mode) => {
				try {
					await onUpdateBondingMode(mode);
				} catch {
					showToast("Network bonding could not be changed");
				}
			},
		},
		onDismiss: () => setIsPresented(false),
		onToggleAccount: () => {
			if (!accountOpen) void streamAccount.refreshLinkedAccounts();
			setAccountOpen((open) => !open);
		},
		onToggleAdvanced: () => setAdvancedOpen((open) => !open),
		speech: {
			audioIsolationEnabled: preferences.audioIsolationEnabled,
			betterAudioIsolationAvailable: flags.betterAudioIsolationAvailable,
			betterAudioIsolationEnabled: preferences.betterAudioIsolationEnabled,
			betterCaptions: captions.better,
			betterCaptionsEnabled: preferences.betterCaptionsEnabled,
			betterSubtitlesAvailable: flags.betterSubtitlesAvailable,
			captionLanguage: preferences.captionLanguage,
			captionLanguageActive: captions.language,
			onSetAudioIsolationEnabled: preferences.setAudioIsolationEnabled,
			onSetBetterAudioIsolationEnabled:
				preferences.setBetterAudioIsolationEnabled,
			onSetBetterCaptionsEnabled: preferences.setBetterCaptionsEnabled,
			onSetCaptionLanguage: preferences.setCaptionLanguage,
		},
	};
}
