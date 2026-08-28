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
import { AlertBanner } from "../components/alert-banner";
import {
	BrbHoldBanner,
	useBrbHoldPolling,
} from "../components/brb-hold-banner";
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
import { brbHoldingProviders } from "../components/stream-settings-direct-section";
import { StreamSettingsSheet } from "../components/stream-settings-sheet";
import {
	type SignInProvider,
	StreamDestinationEditor,
	StreamLoading,
	StreamSignIn,
} from "../components/stream-setup";
import { appleIdToken, isAppleCancellation } from "../lib/apple-sign-in";
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
import {
	emptySavedStudioNeedsWarning,
	emptyStudioWarningDecision,
} from "../lib/studio-link";
import { useAfterMount } from "../lib/use-after-mount";
import { useFirstLiveTracking } from "../lib/use-first-live-tracking";
import { useLinkStatsReporter } from "../lib/use-link-stats-reporter";
import { useStreamAccount } from "../lib/use-stream-account";
import { useStreamSettingsModel } from "../lib/use-stream-settings-model";
import { useStreamSpeechFeatures } from "../lib/use-stream-speech-features";
import { useWatchSnapshotSync } from "../lib/use-watch-snapshot-sync";

const afterPaint = () =>
	new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

type StopChoice = "cancel" | "card" | "end";

/**
 * ponytail: the web build keeps the plain confirm and always ends the
 * broadcast — the dashboard is a tab away there, and stacking two confirms
 * reads worse than it helps. Give it the three-way prompt if the web app ever
 * ships as someone's only surface.
 */
function confirmStop(holdPossible: boolean): Promise<StopChoice> {
	if (IS_WEB) {
		return Promise.resolve(
			globalThis.confirm("Are you sure?") ? "end" : "cancel",
		);
	}
	if (!holdPossible) {
		return new Promise((resolve) => {
			Alert.alert("Are you sure?", undefined, [
				{ onPress: () => resolve("cancel"), style: "cancel", text: "Cancel" },
				{ onPress: () => resolve("end"), style: "destructive", text: "Stop" },
			]);
		});
	}
	return new Promise((resolve) => {
		Alert.alert(
			"Stop streaming?",
			"Your BRB card can hold the broadcast open until you come back.",
			[
				{ onPress: () => resolve("cancel"), style: "cancel", text: "Cancel" },
				{ onPress: () => resolve("card"), text: "Show BRB card" },
				{
					onPress: () => resolve("end"),
					style: "destructive",
					text: "End broadcast",
				},
			],
		);
	});
}

function confirmEmptyStudio(): Promise<"cancel" | "continue" | "dismiss"> {
	if (IS_WEB) {
		return new Promise((resolve) => {
			const dialog = document.createElement("dialog");
			const title = document.createElement("h2");
			const description = document.createElement("p");
			const form = document.createElement("form");
			title.id = "empty-studio-title";
			title.textContent = "Empty Cloud Studio";
			description.textContent =
				"Your studio has no sources yet. Go live anyway?";
			form.method = "dialog";
			for (const [value, text] of [
				["cancel", "Cancel"],
				["continue", "Continue"],
				["dismiss", "Don't ask again"],
			] as const) {
				const button = document.createElement("button");
				button.value = value;
				button.textContent = text;
				form.append(button);
			}
			dialog.setAttribute("aria-labelledby", title.id);
			dialog.append(title, description, form);
			dialog.addEventListener(
				"close",
				() => {
					const choice = dialog.returnValue;
					dialog.remove();
					resolve(
						choice === "continue" || choice === "dismiss" ? choice : "cancel",
					);
				},
				{ once: true },
			);
			document.body.append(dialog);
			dialog.showModal();
		});
	}
	return new Promise((resolve) =>
		Alert.alert(
			"Empty Cloud Studio",
			"Your studio has no sources yet. Go live anyway?",
			[
				{ onPress: () => resolve("cancel"), style: "cancel", text: "Cancel" },
				{ onPress: () => resolve("continue"), text: "Go live" },
				{ onPress: () => resolve("dismiss"), text: "Don't ask again" },
			],
		),
	);
}

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
	// A manual-URL user is never routed back to the sign-in screen on its own:
	// having a destination is exactly what keeps them out of it. Settings asks.
	const [promptSignIn, setPromptSignIn] = useState(false);
	// Camera bring-up takes seconds and paints nothing but a black preview, so the
	// controls look frozen. Cover them until prepare() settles (success or failure).
	const [starting, setStarting] = useState(true);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [streamInfoOpen, setStreamInfoOpen] = useState(false);
	const [selectedAudioInputId, setSelectedAudioInputId] = useState("default");
	const [selectedZoom, setSelectedZoom] = useState(1);
	const [signingIn, setSigningIn] = useState<SignInProvider>();
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
		brb,
		chatBusy,
		chatConnections,
		chatPreferences,
		endBrb,
		installationId,
		linkChannelProvider,
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
	const directPath = streamAccount.directOutputs?.paths.find(
		({ id }) => id === publishPathId,
	);
	const holdingProviders = useMemo(
		() => (directPath ? brbHoldingProviders(directPath) : []),
		[directPath],
	);
	// A hold can only appear once this device has stopped, and it has to be
	// visible until it is ended — so watch for one exactly while idle.
	useBrbHoldPolling(
		appState === "active" &&
			!isStreamSession(state) &&
			Boolean(userId) &&
			(holdingProviders.length > 0 ||
				Boolean(streamAccount.brb?.enabled && directProviders.length > 0)),
		refreshDirectOutputs,
	);
	useFirstLiveTracking(
		isStreamSession(state) && directProviders.length > 0,
		publishPathId,
		directPath,
		refreshDirectOutputs,
	);
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
					contributionMode,
				)
			: undefined,
	});
	const liveChat = useLiveChat(
		userId,
		appState === "active",
		speechFeatures.speech.onMessage,
		speechFeatures.speech.onAlert,
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
		setStarting(true);
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
		} finally {
			setStarting(false);
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

	const signIn = useCallback(async (provider: SignInProvider) => {
		setSigningIn(provider);
		setMessage(undefined);
		try {
			// Apple never opens a browser: the identity token is verified inline, so
			// this result is the whole answer and the probe below does not apply.
			if (provider === "apple") {
				const { error } = await authClient.signIn.social({
					idToken: await appleIdToken(),
					provider,
				});
				if (error) setMessage(error.message ?? "Apple sign-in failed.");
				return;
			}
			const result =
				provider !== "kick"
					? await authClient.signIn.social({
							callbackURL: authCallbackURL(),
							errorCallbackURL: authCallbackURL(),
							provider,
						})
					: await authClient.signIn.oauth2({
							callbackURL: authCallbackURL(),
							errorCallbackURL: authCallbackURL(),
							providerId: provider,
						});
			if (result.error) {
				setMessage(result.error.message ?? `${provider} sign-in failed.`);
				return;
			}
			// A failed OAuth callback resolves this promise like a success: the
			// server redirects to errorCallbackURL and iOS hands that URL to the
			// auth session, not to the app, so the reason never reaches us. No
			// session after the browser closes is the only signal we get.
			const { data: signedIn } = await authClient.getSession();
			if (!signedIn) {
				setMessage(
					"Sign-in did not complete. If you already have a VISP account, sign in with the provider you used first, then connect this one from settings.",
				);
			}
		} catch (error) {
			if (isAppleCancellation(error)) return;
			setMessage(`${provider} sign-in failed.`);
		} finally {
			setSigningIn(undefined);
		}
	}, []);

	const confirmBondingDataUse = useCallback(async () => {
		if (
			IS_WEB ||
			bondingMode !== "broadcast" ||
			(await hasSeenBondingWarning())
		) {
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
			const reason =
				"To start streaming you need to either fill in the SRT URL or connect a streaming platform in Settings.";
			if (IS_WEB) globalThis.alert(reason);
			else Alert.alert("No destination yet", reason);
			return;
		}
		setMessage(undefined);
		try {
			if (isStreamSession(state)) {
				// With BRB armed, stopping is two intentions wearing one button: a
				// break, or the end of the stream. Only the person pressing it knows.
				const holdPossible = Boolean(
					brb?.enabled && directProviders.length > 0 && publishPathId,
				);
				const choice = await confirmStop(holdPossible);
				if (choice === "cancel") return;
				setToast(undefined);
				await cameraRef.current?.stop();
				if (choice === "end" && holdPossible && publishPathId) {
					await endBrb(publishPathId);
				}
			} else {
				if (userId && publishPathId) {
					try {
						const currentStudio = await apiClient.studio.get.query();
						if (
							emptySavedStudioNeedsWarning(
								currentStudio.settings.mode,
								currentStudio.graph,
								currentStudio.settings.emptyWarningDismissed,
							)
						) {
							const choice = await confirmEmptyStudio();
							const decision = emptyStudioWarningDecision(choice);
							if (!decision.continue) return;
							if (decision.dismiss) {
								await apiClient.studio.emptyWarning.mutate({ dismissed: true });
							}
						}
					} catch {
						// New native clients remain publish-compatible with older servers.
					}
				}
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
		brb?.enabled,
		confirmBondingDataUse,
		configuration,
		contributionMode,
		directProviders.length,
		endBrb,
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
				await afterPaint();
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
				let compatible: VideoConfiguration | undefined;
				if (configuration) {
					try {
						compatible = configurationForLiveCamera(camera, configuration);
					} catch (error) {
						if (isPublishing(state)) throw error;
					}
				}
				if (compatible && configuration) {
					const next = compatible;
					setConfiguration(next);
					await afterPaint();
					try {
						await cameraRef.current?.switchCamera(camera.id);
					} catch (error) {
						setConfiguration((current) =>
							current === next ? configuration : current,
						);
						if (isPublishing(state)) throw error;
						if (
							!(await applyConfiguration(
								configurationForCamera(camera, configuration),
							))
						)
							return;
					}
					setSelectedZoom(defaultZoomLevel(camera));
				} else if (
					!isPublishing(state) &&
					(await applyConfiguration(
						configurationForCamera(camera, configuration),
					))
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
				// Without a session the sign-in screen is the only place left to go,
				// and preview mode would otherwise strand them on a dead camera.
				if (!session) setPreviewing(false);
			})();
		};
		if (IS_WEB) {
			if (globalThis.confirm("Delete VISP destination?")) remove();
			return;
		}
		Alert.alert(
			"Delete VISP destination?",
			session
				? "Your linked device stays on your account and can restore this URL later."
				: "This device forgets the SRT URL and returns to the sign-in screen.",
			[
				{ style: "cancel", text: "Cancel" },
				{
					style: "destructive",
					text: "Delete",
					onPress: remove,
				},
			],
		);
	}, [session, setStreamUrl]);

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
		onSignIn: () => {
			setSettingsOpen(false);
			setPromptSignIn(true);
		},
		onUpdateBondingMode: updateBondingMode,
		onUpdateImageStabilization: updateImageStabilization,
		publishPathId,
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

	if (!session && (promptSignIn || (!editing && !streamUrl && !previewing))) {
		return (
			<StreamSignIn
				message={message}
				onManualSetup={() => {
					setPromptSignIn(false);
					setEditing(true);
				}}
				onPreview={() => {
					setPromptSignIn(false);
					setPreviewing(true);
				}}
				previewLabel={promptSignIn ? "Back to camera" : undefined}
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

	// A signed-in user without a destination lands in the app, not here: the Go Live
	// guard tells them to add a URL or link a platform. The editor is opt-in only.
	if (editing) {
		return (
			<StreamDestinationEditor
				draft={draft}
				hasInstallation={Boolean(installationId)}
				message={message}
				onCancel={() => {
					setDraft("");
					setEditing(false);
					setMessage(undefined);
				}}
				onChangeDraft={setDraft}
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
			<BrbHoldBanner
				busy={preflighting}
				providers={streaming ? [] : holdingProviders}
				onEnd={() => {
					if (publishPathId) void endBrb(publishPathId);
				}}
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
			{chatEnabled && chatPreferences.alerts ? (
				<AlertBanner alerts={liveChat.alerts} />
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
					onAuthorize={(provider) => void linkChannelProvider(provider)}
					onDismiss={() => setStreamInfoOpen(false)}
					showToast={showToast}
					userId={userId}
				/>
			) : null}
			<StreamSettingsSheet {...settingsModel} />
			{starting ? (
				<View style={StyleSheet.absoluteFill}>
					<StreamLoading label="Starting camera..." />
				</View>
			) : null}
		</View>
	);
}
