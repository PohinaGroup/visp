import type { DirectProvider } from "@VISP/api/direct";
import { videoBitrateCeilingKbps } from "@VISP/api/link-stats";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	AppState,
	type AppStateStatus,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import type {
	AudioInputCapability,
	AudioLevelEvent,
	BondingMode,
	CameraCapability,
	StreamState,
	StreamStateEvent,
	VideoConfiguration,
	VispSrtViewRef,
} from "../../modules/visp-srt";
import { VispSrtView } from "../../modules/visp-srt";
import {
	DirectViewerOverlay,
	useDirectViewerCounts,
} from "../components/direct-viewer-overlay";
import { EmbeddedChatOverlayBridge } from "../components/embedded-chat-overlay-bridge";
import { FloatingChatLayer } from "../components/floating-chat-layer";
import type { ObsStatus } from "../components/obs-control-button";
import { StreamCameraControls } from "../components/stream-camera-controls";
import { StreamInfoSheet } from "../components/stream-info-sheet";
import { streamScreenStyles as styles } from "../components/stream-screen.styles";
import { StreamSettingsSheet } from "../components/stream-settings-sheet";
import {
	StreamDestinationEditor,
	StreamLoading,
	StreamSignIn,
} from "../components/stream-setup";
import { type AudioTier, audioTierForLevel } from "../lib/audio-level";
import { apiClient, authCallbackURL, authClient } from "../lib/backend";
import {
	hasSeenBondingWarning,
	loadBondingMode,
	markBondingWarningSeen,
	saveBondingMode,
} from "../lib/bonding-preferences";
import {
	loadImageStabilizationPreference,
	saveImageStabilizationPreference,
} from "../lib/camera-preferences";
import {
	configurationForCamera,
	configurationForLiveCamera,
	defaultZoomLevel,
} from "../lib/camera-settings";
import { setChatSpeechAudioOwner } from "../lib/chat-speech";
import {
	configureVideoCapture,
	resolvePublishPathId,
} from "../lib/configure-video-capture";
import { useLiveChat } from "../lib/live-chat";
import { IS_IOS, IS_WEB } from "../lib/platform";
import { isPublishing, isStreamSession } from "../lib/stream-state";
import {
	deleteStreamUrl,
	saveStreamUrl,
	streamOwnerId,
	validateStreamUrl,
} from "../lib/stream-url";
import { useAfterMount } from "../lib/use-after-mount";
import { useLinkStatsReporter } from "../lib/use-link-stats-reporter";
import { useStreamAccount } from "../lib/use-stream-account";
import { useStreamSettingsModel } from "../lib/use-stream-settings-model";
import { useStreamSpeechFeatures } from "../lib/use-stream-speech-features";
import { useWatchSnapshotSync } from "../lib/use-watch-snapshot-sync";

export default function Index() {
	const window = useWindowDimensions();
	const cameraRef = useRef<VispSrtViewRef>(null);
	const [cameraNode, setCameraNode] = useState<VispSrtViewRef | null>(null);
	const attachCamera = useCallback((node: VispSrtViewRef | null) => {
		cameraRef.current = node;
		setCameraNode(node);
	}, []);
	const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const userId = session?.user.id;
	const streamOwner = streamOwnerId(userId);
	const [appState, setAppState] = useState<AppStateStatus>(
		AppState.currentState,
	);
	const [audioTier, setAudioTier] = useState<AudioTier>(0);
	const [bondingMode, setBondingMode] = useState<BondingMode>();
	const [audioInputs, setAudioInputs] = useState<AudioInputCapability[]>([]);
	const [cameras, setCameras] = useState<CameraCapability[]>([]);
	const [configuration, setConfiguration] = useState<VideoConfiguration>();
	const [draft, setDraft] = useState("");
	const [editing, setEditing] = useState(false);
	const [errorCode, setErrorCode] = useState<string>();
	const [imageStabilizationEnabled, setImageStabilizationEnabled] =
		useState<boolean>();
	const [message, setMessage] = useState<string>();
	const [obsStatus, setObsStatus] = useState<ObsStatus>();
	const [liveStartedAt, setLiveStartedAt] = useState<number>();
	const [previewing, setPreviewing] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [streamInfoOpen, setStreamInfoOpen] = useState(false);
	const [selectedAudioInputId, setSelectedAudioInputId] = useState("default");
	const [selectedZoom, setSelectedZoom] = useState(1);
	const [signingIn, setSigningIn] = useState<"twitch" | "kick" | "google">();
	const [state, setState] = useState<StreamState>("idle");
	const [preflighting, setPreflighting] = useState(false);
	const [reconnectAttempt, setReconnectAttempt] = useState<number>();
	const [toast, setToast] = useState<{ spinning: boolean; text: string }>();
	const showToast = useCallback((text: string, spinning = false) => {
		clearTimeout(toastTimer.current);
		setToast({ spinning, text });
		if (!spinning) {
			toastTimer.current = setTimeout(() => setToast(undefined), 2500);
		}
	}, []);
	const onSetObsStatus = useCallback((next: ObsStatus | undefined) => {
		setObsStatus((current) =>
			JSON.stringify(current) === JSON.stringify(next) ? current : next,
		);
	}, []);
	const streamAccount = useStreamAccount({
		sessionPending,
		setMessage,
		showToast,
		userId,
	});
	const {
		awaitingAutoProvision,
		chatBusy,
		chatConnections,
		chatPreferences,
		installationId,
		linkChatProvider,
		provisionDestination,
		provisioning,
		publishDevices,
		refreshChatConnections,
		refreshDirectOutputs,
		refreshPublishDevices,
		setStreamUrl,
		streamUrl,
		updateChatPreferences,
	} = streamAccount;
	const orientation = window.width > window.height ? "landscape" : "portrait";
	const settingsDisabled =
		preflighting || state === "preparing" || isStreamSession(state);
	// No linked and enabled provider means no messages, so the overlay stays off
	// regardless of the stored preference.
	const chatEnabled = chatConnections.some(
		(connection) => connection.linked && connection.enabled,
	);
	const chatOverlayMode = chatEnabled ? chatPreferences.mode : "hidden";
	const cameraSwitchDisabled =
		state === "preparing" ||
		state === "stopping" ||
		(IS_WEB && isStreamSession(state));
	const publishPathId = useMemo(
		() => resolvePublishPathId(streamUrl ?? undefined, publishDevices),
		[publishDevices, streamUrl],
	);
	const publishPath = publishDevices.find(({ id }) => id === publishPathId);
	const directProviders = useMemo(() => {
		const providers: DirectProvider[] = [];
		if (publishPath?.directTwitch) providers.push("twitch");
		if (publishPath?.directKick) providers.push("kick");
		if (publishPath?.directYoutube) providers.push("youtube");
		return providers;
	}, [
		publishPath?.directKick,
		publishPath?.directTwitch,
		publishPath?.directYoutube,
	]);
	const viewerActive = appState === "active" && isPublishing(state);
	const viewerCounts = useDirectViewerCounts(viewerActive, directProviders);
	const directContribution = Boolean(directProviders.length);
	const contributionMode = directContribution ? "direct" : "full";
	const speechFeatures = useStreamSpeechFeatures(cameraNode, {
		appState,
		chatPreferences,
		configuration,
		onSpeechError: showToast,
		state,
		userId,
	});
	const {
		clearLinkStats,
		linkStats,
		onStats: onStatsRaw,
	} = useLinkStatsReporter({
		live: state === "live",
		pathId: publishPathId,
		setVideoBitrate: IS_WEB
			? undefined
			: (bitrateKbps) => cameraRef.current?.setVideoBitrate(bitrateKbps),
		userId,
		videoBitrateCeilingKbps: configuration
			? videoBitrateCeilingKbps(
					configuration.width,
					configuration.height,
					configuration.fps,
				)
			: undefined,
	});
	const liveChat = useLiveChat(
		userId,
		appState === "active",
		speechFeatures.speech.onMessage,
	);

	useEffect(() => {
		const captureOwnsAudio = Boolean(
			cameraNode && configuration && appState === "active",
		);
		setChatSpeechAudioOwner(captureOwnsAudio ? "capture" : "playback");
	}, [appState, cameraNode, configuration]);

	useWatchSnapshotSync({
		audioTier,
		configuration,
		liveStartedAt,
		message,
		messages: liveChat.recentMessages,
		obs: session ? obsStatus : undefined,
		reconnectAttempt,
		state,
		statuses: liveChat.statuses,
		viewers: directProviders.map((provider) => ({
			provider,
			count: viewerCounts[provider],
		})),
	});

	const prepare = useCallback(async () => {
		if (imageStabilizationEnabled === undefined) {
			return;
		}
		try {
			await cameraRef.current?.setImageStabilization(imageStabilizationEnabled);
			const requestedPermissions = await cameraRef.current?.prepare();
			const capabilities = await cameraRef.current?.getCapabilities();
			if (capabilities) {
				const selected = capabilities.selected;
				await configureVideoCapture(
					cameraRef.current,
					selected,
					contributionMode,
					bondingMode ?? "off",
				);
				setAudioInputs(capabilities.audioInputs);
				setCameras(capabilities.cameras);
				setConfiguration(selected);
				setSelectedAudioInputId(capabilities.selectedAudioInputId);
				setSelectedZoom(capabilities.selectedZoom);
				if (requestedPermissions) {
					setSettingsOpen(true);
				}
			}
		} catch {
			// The native module emits a sanitized error with the correct cause.
		}
	}, [contributionMode, imageStabilizationEnabled, bondingMode]);

	const prepareRef = useRef(prepare);
	useEffect(() => {
		prepareRef.current = prepare;
	});

	useEffect(() => {
		loadImageStabilizationPreference()
			.then(setImageStabilizationEnabled)
			.catch(() => setImageStabilizationEnabled(true));
	}, []);

	useEffect(() => {
		loadBondingMode()
			.then(setBondingMode)
			.catch(() => setBondingMode("off"));
	}, []);

	// Prepare per native view instance, not per render state: any full-screen loader
	// (session refetch, destination reload) unmounts VispSrtView and mounts a fresh,
	// unprepared one, and re-preparing on unrelated state churn races the in-flight
	// prepare and leaves the capture session torn down.
	useEffect(() => {
		if (cameraNode && appState === "active") {
			const frame = requestAnimationFrame(() => void prepareRef.current());
			return () => cancelAnimationFrame(frame);
		}
	}, [appState, cameraNode]);

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (nextState) => {
			setAppState(nextState);
			if (!IS_WEB && !IS_IOS && nextState === "background") {
				void cameraRef.current?.stop();
			}
		});
		return () => subscription.remove();
	}, []);

	useEffect(() => () => clearTimeout(toastTimer.current), []);

	const onAudioLevelRaw = useCallback(
		({ nativeEvent }: { nativeEvent: AudioLevelEvent }) => {
			setAudioTier(audioTierForLevel(nativeEvent.level));
		},
		[],
	);

	const onStateChangeRaw = useCallback(
		({ nativeEvent }: { nativeEvent: StreamStateEvent }) => {
			setState(nativeEvent.state);
			setErrorCode(nativeEvent.code);
			setReconnectAttempt(
				nativeEvent.state === "reconnecting" ? nativeEvent.attempt : undefined,
			);
			setLiveStartedAt((current) => {
				if (nativeEvent.state === "live") return current ?? Date.now();
				if (
					nativeEvent.state === "reconnecting" ||
					nativeEvent.state === "stopping"
				)
					return current;
				return undefined;
			});
			if (!isStreamSession(nativeEvent.state)) {
				setAudioTier(0);
				clearLinkStats();
			}
			if (nativeEvent.code === "link-degraded") {
				showToast("Network bonding is running on one link");
			} else if (nativeEvent.code === "links-restored") {
				showToast("Both bonded network links are active");
			} else if (nativeEvent.state === "live") {
				showToast(
					"You're live. The stream usually appears at the destination after about 30 seconds of warm-up.",
				);
			} else if (nativeEvent.state === "error") {
				setToast(undefined);
			}
			setMessage(
				nativeEvent.state === "reconnecting" && nativeEvent.attempt
					? `Reconnect attempt ${nativeEvent.attempt} of 3`
					: nativeEvent.message,
			);
		},
		[clearLinkStats, showToast],
	);
	const onAudioLevel = useAfterMount(onAudioLevelRaw);
	const onStateChange = useAfterMount(onStateChangeRaw);
	const onStats = useAfterMount(onStatsRaw);

	const save = useCallback(async () => {
		try {
			const value = validateStreamUrl(draft);
			await saveStreamUrl(value, streamOwner);
			setStreamUrl(value);
			setDraft("");
			setEditing(false);
			setErrorCode(undefined);
			setMessage(undefined);
		} catch (error) {
			setMessage(
				error instanceof Error ? error.message : "The URL could not be saved.",
			);
		}
	}, [draft, setStreamUrl, streamOwner]);

	const signIn = useCallback(async (provider: "twitch" | "kick" | "google") => {
		setSigningIn(provider);
		setMessage(undefined);
		try {
			const result =
				provider !== "kick"
					? await authClient.signIn.social({
							callbackURL: authCallbackURL(),
							provider,
						})
					: await authClient.signIn.oauth2({
							callbackURL: authCallbackURL(),
							providerId: provider,
						});
			if (result.error) {
				setMessage(result.error.message ?? `${provider} sign-in failed.`);
			}
		} catch {
			setMessage(`${provider} sign-in failed.`);
		} finally {
			setSigningIn(undefined);
		}
	}, []);

	const confirmBondingDataUse = useCallback(async () => {
		if (IS_WEB || bondingMode === "off" || (await hasSeenBondingWarning())) {
			return true;
		}
		return new Promise<boolean>((resolve) => {
			Alert.alert(
				"Use Wi-Fi and cellular together?",
				"Network bonding sends the stream over both connections and can roughly double mobile data use.",
				[
					{ onPress: () => resolve(false), style: "cancel", text: "Cancel" },
					{
						onPress: () => {
							void markBondingWarningSeen();
							resolve(true);
						},
						text: "Go live",
					},
				],
			);
		});
	}, [bondingMode]);

	const toggleStream = useCallback(async () => {
		if (!streamUrl) {
			showToast("Add an SRT URL before going live");
			return;
		}
		setMessage(undefined);
		try {
			if (isStreamSession(state)) {
				const confirmed = IS_WEB
					? globalThis.confirm("Are you sure?")
					: await new Promise<boolean>((resolve) => {
							Alert.alert("Are you sure?", undefined, [
								{
									onPress: () => resolve(false),
									style: "cancel",
									text: "Cancel",
								},
								{
									onPress: () => resolve(true),
									style: "destructive",
									text: "Stop",
								},
							]);
						});
				if (!confirmed) return;
				setToast(undefined);
				await cameraRef.current?.stop();
			} else {
				if (!(await confirmBondingDataUse())) return;
				showToast("Connecting to relay service…", true);
				setPreflighting(true);
				const prepared =
					userId && publishPathId
						? await apiClient.direct.prepare.mutate({ pathId: publishPathId })
						: null;
				if (configuration) {
					await configureVideoCapture(
						cameraRef.current,
						configuration,
						prepared?.contributionMode ?? contributionMode,
						bondingMode ?? "off",
					);
				}
				await cameraRef.current?.start(streamUrl);
				if (prepared) {
					await Promise.all([refreshDirectOutputs(), refreshPublishDevices()]);
				}
			}
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Could not connect to the relay service.",
			);
		} finally {
			setPreflighting(false);
		}
	}, [
		bondingMode,
		confirmBondingDataUse,
		configuration,
		contributionMode,
		publishPathId,
		refreshDirectOutputs,
		refreshPublishDevices,
		showToast,
		state,
		streamUrl,
		userId,
	]);

	const toggleOrientation = useCallback(async () => {
		if (isStreamSession(state)) {
			showToast("You cannot change orientation during stream");
			return;
		}
		try {
			const orientation = await ScreenOrientation.getOrientationAsync();
			const isLandscape =
				orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
				orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
			await ScreenOrientation.lockAsync(
				isLandscape
					? ScreenOrientation.OrientationLock.PORTRAIT_UP
					: ScreenOrientation.OrientationLock.LANDSCAPE,
			);
		} catch {
			showToast("Orientation could not be changed");
		}
	}, [showToast, state]);

	const applyConfiguration = useCallback(
		async (next: VideoConfiguration) => {
			const previous = configuration;
			setConfiguration(next);
			try {
				await configureVideoCapture(
					cameraRef.current,
					next,
					contributionMode,
					bondingMode ?? "off",
				);
				return true;
			} catch {
				setConfiguration((current) => (current === next ? previous : current));
				// The native module emits a sanitized error with the correct cause.
				return false;
			}
		},
		[bondingMode, configuration, contributionMode],
	);

	const updateBondingMode = useCallback(
		async (mode: BondingMode) => {
			if (configuration) {
				await configureVideoCapture(
					cameraRef.current,
					configuration,
					contributionMode,
					mode,
				);
			}
			setBondingMode(mode);
			await saveBondingMode(mode);
		},
		[configuration, contributionMode],
	);

	const applyAudioInput = useCallback(
		async (audioInputId: string) => {
			try {
				await cameraRef.current?.configureAudioInput(audioInputId);
				setSelectedAudioInputId(audioInputId);
			} catch {
				showToast("Microphone could not be changed");
			}
		},
		[showToast],
	);

	const selectCamera = useCallback(
		async (camera: CameraCapability) => {
			if (cameraSwitchDisabled) {
				return;
			}
			try {
				if (isPublishing(state)) {
					const next = configurationForLiveCamera(camera, configuration);
					await cameraRef.current?.switchCamera(camera.id);
					setConfiguration(next);
					setSelectedZoom(defaultZoomLevel(camera));
				} else if (
					await applyConfiguration(
						configurationForCamera(camera, configuration),
					)
				) {
					setSelectedZoom(defaultZoomLevel(camera));
				}
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Camera could not be switched",
				);
			}
		},
		[applyConfiguration, cameraSwitchDisabled, configuration, showToast, state],
	);

	const selectZoom = useCallback(
		async (level: number) => {
			try {
				await cameraRef.current?.setZoom(level);
				setSelectedZoom(level);
			} catch {
				showToast("Zoom could not be changed");
			}
		},
		[showToast],
	);

	const updateImageStabilization = useCallback(
		async (enabled: boolean) => {
			try {
				await cameraRef.current?.setImageStabilization(enabled);
				setImageStabilizationEnabled(enabled);
				try {
					await saveImageStabilizationPreference(enabled);
				} catch {
					showToast("Stabilization changed but could not be remembered");
				}
			} catch {
				showToast("Image stabilization could not be changed");
			}
		},
		[showToast],
	);

	const flipCamera = useCallback(() => {
		if (cameraSwitchDisabled) {
			return;
		}
		const next = cameras.find(({ id }) => id !== configuration?.cameraId);
		if (!next) {
			return;
		}
		void selectCamera(next);
	}, [cameraSwitchDisabled, cameras, configuration?.cameraId, selectCamera]);

	const openSettings = useCallback(() => {
		setSettingsOpen(true);
		void cameraRef.current
			?.getCapabilities()
			.then((capabilities) => {
				setAudioInputs(capabilities.audioInputs);
				setSelectedAudioInputId(capabilities.selectedAudioInputId);
				setSelectedZoom(capabilities.selectedZoom);
			})
			.catch(() => undefined);
		void refreshChatConnections();
		void refreshPublishDevices();
		void refreshDirectOutputs();
		void speechFeatures.flags.refreshAvailability();
		void speechFeatures.speech.refreshOutputs();
	}, [
		refreshChatConnections,
		refreshPublishDevices,
		refreshDirectOutputs,
		speechFeatures.flags.refreshAvailability,
		speechFeatures.speech.refreshOutputs,
	]);

	const removeUrl = useCallback(() => {
		const remove = () => {
			void (async () => {
				await cameraRef.current?.stop();
				await deleteStreamUrl();
				setSettingsOpen(false);
				setStreamUrl(null);
				setMessage(undefined);
			})();
		};
		if (IS_WEB) {
			if (globalThis.confirm("Delete VISP destination?")) remove();
			return;
		}
		Alert.alert(
			"Delete VISP destination?",
			"Your linked device stays on your account and can restore this URL later.",
			[
				{ style: "cancel", text: "Cancel" },
				{
					style: "destructive",
					text: "Delete",
					onPress: remove,
				},
			],
		);
	}, [setStreamUrl]);

	const settingsModel = useStreamSettingsModel({
		audioInputs,
		bondingMode: bondingMode ?? "off",
		camera: cameraNode,
		cameraSwitchDisabled,
		cameras,
		chatEnabled,
		chatErrors: liveChat.errors,
		chatStatuses: liveChat.statuses,
		configuration,
		directContribution,
		imageStabilizationEnabled: imageStabilizationEnabled ?? false,
		isPresented: settingsOpen,
		onApplyAudioInput: applyAudioInput,
		onApplyConfiguration: applyConfiguration,
		onRemoveDestination: removeUrl,
		onRetryCamera: prepare,
		onSelectCamera: selectCamera,
		onUpdateBondingMode: updateBondingMode,
		onUpdateImageStabilization: updateImageStabilization,
		selectedAudioInputId,
		sessionUser: session?.user,
		setDraft,
		setEditing,
		setIsPresented: setSettingsOpen,
		settingsDisabled,
		showToast,
		speechFeatures,
		streamAccount,
		streamUrl: streamUrl ?? null,
	});

	if (
		sessionPending ||
		streamUrl === undefined ||
		imageStabilizationEnabled === undefined ||
		bondingMode === undefined
	) {
		return <StreamLoading />;
	}

	if (!session && !editing && !streamUrl && !previewing) {
		return (
			<StreamSignIn
				message={message}
				onManualSetup={() => setEditing(true)}
				onPreview={() => setPreviewing(true)}
				onSignIn={(provider) => void signIn(provider)}
				signingIn={signingIn}
			/>
		);
	}

	// Keep the camera mounted while refreshing an existing destination. Flipping to a
	// full-screen loader unmounts VispSrtView, cleanup() kills preview, and prepare()
	// does not re-run because streamUrl/appState deps are unchanged.
	if (
		(provisioning && !streamUrl && !previewing) ||
		(session && streamUrl === null && awaitingAutoProvision)
	) {
		return <StreamLoading />;
	}

	if ((!streamUrl && !previewing) || editing) {
		return (
			<StreamDestinationEditor
				draft={draft}
				editing={editing}
				hasInstallation={Boolean(installationId)}
				message={message}
				onCancel={() => {
					setDraft("");
					setEditing(false);
					setMessage(undefined);
				}}
				onChangeDraft={setDraft}
				onPreview={() => setPreviewing(true)}
				onProvision={() => void provisionDestination(true)}
				onSave={() => void save()}
				provisioning={provisioning}
				signedIn={Boolean(session)}
				streamUrl={streamUrl}
			/>
		);
	}

	const streaming = isStreamSession(state);
	return (
		<View style={styles.container}>
			<StatusBar style="light" />
			<VispSrtView
				onAudioLevel={onAudioLevel}
				onStateChange={onStateChange}
				onStats={onStats}
				ref={attachCamera}
				style={StyleSheet.absoluteFill}
			/>
			<StreamCameraControls
				actionPending={preflighting}
				audioTier={audioTier}
				bondingMode={bondingMode}
				cameraSwitchDisabled={cameraSwitchDisabled}
				cameras={cameras}
				chatVisible={Boolean(session && chatOverlayMode !== "hidden")}
				configuration={configuration}
				errorCode={errorCode}
				imageStabilizationActive={imageStabilizationEnabled}
				linkStats={linkStats}
				message={message}
				onEditUrl={() => {
					setDraft("");
					setEditing(true);
				}}
				onExitPreview={() => setPreviewing(false)}
				onFlipCamera={flipCamera}
				onOpenInfo={() => setStreamInfoOpen(true)}
				onOpenSettings={openSettings}
				onSelectZoom={(level) => void selectZoom(level)}
				onSetObsStatus={onSetObsStatus}
				onToggleOrientation={() => void toggleOrientation()}
				onToggleStream={() => void toggleStream()}
				selectedZoom={selectedZoom}
				showToast={showToast}
				signedIn={Boolean(session)}
				state={state}
				streaming={streaming}
				streamUrl={streamUrl}
			/>
			<DirectViewerOverlay
				active={viewerActive}
				counts={viewerCounts}
				providers={directProviders}
			/>
			<EmbeddedChatOverlayBridge
				cameraRef={cameraRef}
				corner={chatPreferences.corner}
				disappearingMessages={chatPreferences.disappearingMessages}
				enabled={
					chatOverlayMode === "embedded" &&
					(orientation === "portrait" || orientation === "landscape")
				}
				messages={liveChat.messages}
			/>
			{chatOverlayMode === "floating" ? (
				<FloatingChatLayer
					disappearingMessages={chatPreferences.disappearingMessages}
					messages={liveChat.messages}
					onPositionChange={(position) =>
						updateChatPreferences((current) => ({
							...current,
							floating: { ...current.floating, [orientation]: position },
						}))
					}
					position={chatPreferences.floating[orientation]}
				/>
			) : null}
			{toast ? (
				<View
					accessibilityLiveRegion="polite"
					pointerEvents="none"
					style={styles.toast}
				>
					<View style={styles.toastContent}>
						{toast.spinning ? (
							<ActivityIndicator color="white" size="small" />
						) : null}
						<Text style={styles.toastText}>{toast.text}</Text>
					</View>
				</View>
			) : null}
			{userId ? (
				<StreamInfoSheet
					authorizing={Boolean(chatBusy)}
					connections={chatConnections}
					isPresented={streamInfoOpen}
					onAuthorize={(provider) => void linkChatProvider(provider, true)}
					onDismiss={() => setStreamInfoOpen(false)}
					showToast={showToast}
					userId={userId}
				/>
			) : null}
			<StreamSettingsSheet {...settingsModel} />
		</View>
	);
}
