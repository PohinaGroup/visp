import * as UI from "@expo/ui";
import * as Device from "expo-device";
import {
	GlassView,
	isGlassEffectAPIAvailable,
	isLiquidGlassAvailable,
} from "expo-glass-effect";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	ActivityIndicator,
	Alert,
	AppState,
	type AppStateStatus,
	KeyboardAvoidingView,
	Linking,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	useWindowDimensions,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
	AudioInputCapability,
	AudioLevelEvent,
	CameraCapability,
	StreamState,
	StreamStateEvent,
	VideoConfiguration,
	VispSrtViewRef,
} from "../../modules/visp-srt";
import { VispSrtView } from "../../modules/visp-srt";
import { FloatingChat } from "../components/floating-chat";
import { ObsControlButton } from "../components/obs-control-button";
import { StreamInfoSheet } from "../components/stream-info-sheet";
import {
	AUDIO_TIER_COLORS,
	AUDIO_TIER_LABELS,
	type AudioTier,
	audioTierForLevel,
} from "../lib/audio-level";
import { apiClient, authCallbackURL, authClient } from "../lib/backend";
import {
	loadImageStabilizationPreference,
	saveImageStabilizationPreference,
} from "../lib/camera-preferences";
import {
	configurationForCamera,
	configurationForFormat,
	configurationForLiveCamera,
	defaultZoomLevel,
	formatLabel,
	formatZoomLevel,
	supportsImageStabilization,
} from "../lib/camera-settings";
import {
	type ChatPreferences,
	DEFAULT_CHAT_PREFERENCES,
	loadChatPreferences,
	saveChatPreferences,
} from "../lib/chat-preferences";
import { useLiveChat } from "../lib/live-chat";
import {
	deleteStreamUrl,
	describeStreamUrl,
	loadOrCreateInstallationId,
	loadStreamUrl,
	saveStreamUrl,
	selectPublishUrl,
	validateStreamUrl,
} from "../lib/stream-url";

const ACTIVE_STATES = new Set<StreamState>([
	"connecting",
	"live",
	"reconnecting",
	"stopping",
]);
const MANUAL_STREAM_OWNER = "manual";
const DEFAULT_AUDIO_INPUT_ID = "default";
const IS_WEB = Platform.OS === "web";

const SUBTLE = "#8a919c";
const DESTRUCTIVE = "#e5484d";
const SUBTLE_TEXT = { color: SUBTLE, fontSize: 13 } as const;
const LIQUID_GLASS_AVAILABLE =
	isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

// ponytail: iOS Forms put picker labels inline; Material dropdowns read better with the label above.
function SettingRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	if (Platform.OS === "ios") {
		return (
			<UI.Row alignment="center">
				<UI.Text>{label}</UI.Text>
				<UI.Spacer flexible />
				{children}
			</UI.Row>
		);
	}
	return (
		<UI.Column spacing={4}>
			<UI.Text textStyle={SUBTLE_TEXT}>{label}</UI.Text>
			{children}
		</UI.Column>
	);
}

function ZoomButton({
	disabled,
	level,
	onPress,
	selected,
}: {
	disabled: boolean;
	level: number;
	onPress: () => void;
	selected: boolean;
}) {
	const label = formatZoomLevel(level);
	const button = (
		<Pressable
			accessibilityLabel={`Set zoom to ${label}`}
			accessibilityRole="button"
			accessibilityState={{ disabled, selected }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.zoomButtonPressable,
				pressed && styles.buttonPressed,
			]}
		>
			<Text style={styles.zoomButtonText}>{label}</Text>
		</Pressable>
	);
	if (LIQUID_GLASS_AVAILABLE) {
		return (
			<GlassView
				glassEffectStyle="regular"
				isInteractive={!disabled}
				style={[styles.zoomButton, disabled && styles.actionDisabled]}
				tintColor={selected ? "rgba(255,53,77,0.58)" : undefined}
			>
				{button}
			</GlassView>
		);
	}
	return (
		<View
			style={[
				styles.zoomButton,
				styles.zoomButtonFallback,
				selected && styles.zoomButtonSelected,
				disabled && styles.actionDisabled,
			]}
		>
			{button}
		</View>
	);
}

const STATE_LABELS: Record<StreamState, string> = {
	connecting: "Connecting",
	error: "Offline",
	idle: "Ready",
	live: "Live",
	preparing: "Starting camera",
	reconnecting: "Reconnecting",
	stopping: "Stopping",
};

export default function Index() {
	const window = useWindowDimensions();
	const cameraRef = useRef<VispSrtViewRef>(null);
	const provisionStarted = useRef(false);
	const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const userId = session?.user.id;
	const streamOwner = userId ?? MANUAL_STREAM_OWNER;
	const [appState, setAppState] = useState<AppStateStatus>(
		AppState.currentState,
	);
	const [audioTier, setAudioTier] = useState<AudioTier>(0);
	const [audioInputs, setAudioInputs] = useState<AudioInputCapability[]>([]);
	const [cameras, setCameras] = useState<CameraCapability[]>([]);
	const [configuration, setConfiguration] = useState<VideoConfiguration>();
	const [draft, setDraft] = useState("");
	const [editing, setEditing] = useState(false);
	const [errorCode, setErrorCode] = useState<string>();
	const [imageStabilizationEnabled, setImageStabilizationEnabled] =
		useState<boolean>();
	const [message, setMessage] = useState<string>();
	const [previewing, setPreviewing] = useState(false);
	const [provisioning, setProvisioning] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [streamInfoOpen, setStreamInfoOpen] = useState(false);
	const [selectedAudioInputId, setSelectedAudioInputId] = useState(
		DEFAULT_AUDIO_INPUT_ID,
	);
	const [selectedZoom, setSelectedZoom] = useState(1);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [signingIn, setSigningIn] = useState<"twitch" | "kick">();
	const [state, setState] = useState<StreamState>("idle");
	const [streamUrl, setStreamUrl] = useState<string | null>();
	const [toast, setToast] = useState<{ spinning: boolean; text: string }>();
	const [chatPreferences, setChatPreferences] = useState<ChatPreferences>(
		DEFAULT_CHAT_PREFERENCES,
	);
	const [chatConnections, setChatConnections] = useState<
		Awaited<ReturnType<typeof apiClient.chat.connections.list.query>>
	>([]);
	const [publishDevices, setPublishDevices] = useState<
		Awaited<ReturnType<typeof apiClient.paths.list.query>>
	>([]);
	const [installationId, setInstallationId] = useState<string>();
	const [revealedDeviceUrls, setRevealedDeviceUrls] = useState<
		Record<number, string>
	>({});
	const [chatBusy, setChatBusy] = useState<"twitch" | "kick">();
	const orientation = window.width > window.height ? "landscape" : "portrait";
	const settingsDisabled = state === "preparing" || ACTIVE_STATES.has(state);
	const cameraSwitchDisabled =
		state === "preparing" ||
		state === "stopping" ||
		(IS_WEB && ACTIVE_STATES.has(state));
	const liveChat = useLiveChat(
		userId,
		appState === "active" && chatPreferences.mode !== "hidden",
	);

	const showToast = useCallback((text: string, spinning = false) => {
		clearTimeout(toastTimer.current);
		setToast({ spinning, text });
		if (!spinning) {
			toastTimer.current = setTimeout(() => setToast(undefined), 2500);
		}
	}, []);

	const prepare = useCallback(async () => {
		if (imageStabilizationEnabled === undefined) {
			return;
		}
		try {
			await cameraRef.current?.setImageStabilization(imageStabilizationEnabled);
			const requestedPermissions = await cameraRef.current?.prepare();
			const capabilities = await cameraRef.current?.getCapabilities();
			if (capabilities) {
				setAudioInputs(capabilities.audioInputs);
				setCameras(capabilities.cameras);
				setConfiguration(capabilities.selected);
				setSelectedAudioInputId(capabilities.selectedAudioInputId);
				setSelectedZoom(capabilities.selectedZoom);
				if (requestedPermissions) {
					setSettingsOpen(true);
				}
			}
		} catch {
			// The native module emits a sanitized error with the correct cause.
		}
	}, [imageStabilizationEnabled]);

	useEffect(() => {
		loadImageStabilizationPreference()
			.then(setImageStabilizationEnabled)
			.catch(() => setImageStabilizationEnabled(true));
	}, []);

	useEffect(() => {
		if (sessionPending) {
			return;
		}
		provisionStarted.current = false;
		setStreamUrl(undefined);
		loadStreamUrl(streamOwner)
			.then(setStreamUrl)
			.catch(() => {
				setStreamUrl(null);
				setMessage("The saved SRT destination could not be read.");
			});
	}, [sessionPending, streamOwner]);

	useEffect(() => {
		if (!userId) {
			setChatPreferences(DEFAULT_CHAT_PREFERENCES);
			setChatConnections([]);
			setPublishDevices([]);
			setInstallationId(undefined);
			return;
		}
		loadChatPreferences(userId)
			.then((preferences) =>
				setChatPreferences(
					IS_WEB && preferences.mode === "embedded"
						? { ...preferences, mode: "floating" }
						: preferences,
				),
			)
			.catch(() => setChatPreferences(DEFAULT_CHAT_PREFERENCES));
		apiClient.chat.connections.list
			.query()
			.then(setChatConnections)
			.catch(() => setChatConnections([]));
		apiClient.paths.list
			.query()
			.then(setPublishDevices)
			.catch(() => setPublishDevices([]));
		loadOrCreateInstallationId()
			.then(setInstallationId)
			.catch(() => setMessage("This installation could not be identified."));
	}, [userId]);

	useEffect(() => {
		if (
			chatPreferences.mode === "embedded" &&
			(orientation === "portrait" || orientation === "landscape")
		) {
			void cameraRef.current
				?.updateChatOverlay(liveChat.messages, chatPreferences.corner)
				.catch(() => undefined);
		} else {
			void cameraRef.current?.clearChatOverlay().catch(() => undefined);
		}
	}, [
		chatPreferences.corner,
		chatPreferences.mode,
		liveChat.messages,
		orientation,
	]);

	const updateChatPreferences = useCallback(
		(updater: (current: ChatPreferences) => ChatPreferences) => {
			setChatPreferences((current) => {
				const next = updater(current);
				if (userId)
					void saveChatPreferences(userId, next).catch(() => undefined);
				return next;
			});
		},
		[userId],
	);

	const refreshChatConnections = useCallback(async () => {
		if (!userId) return;
		setChatConnections(await apiClient.chat.connections.list.query());
	}, [userId]);

	const refreshPublishDevices = useCallback(async () => {
		if (!userId) return;
		setPublishDevices(await apiClient.paths.list.query());
	}, [userId]);

	const revealPublishDevice = useCallback(
		async (pathId: number) => {
			try {
				const device = await apiClient.paths.reveal.mutate({ pathId });
				setRevealedDeviceUrls((current) => ({
					...current,
					[pathId]: device.urls.srt,
				}));
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Publish URL could not be revealed",
				);
			}
		},
		[showToast],
	);

	const linkChatProvider = useCallback(
		async (provider: "twitch" | "kick", chatConsent = false) => {
			setChatBusy(provider);
			try {
				const result =
					provider === "twitch"
						? await authClient.linkSocial({
								provider,
								callbackURL: authCallbackURL(),
								// Twitch tokens keep only the last-requested scopes, so always
								// re-request the union or one feature's consent drops the other's.
								scopes: chatConsent
									? ["user:read:chat", "channel:manage:broadcast"]
									: undefined,
							})
						: await authClient.oauth2.link({
								providerId: provider,
								callbackURL: authCallbackURL(),
							});
				if (result.error)
					throw new Error(result.error.message ?? `Could not link ${provider}`);
				await refreshChatConnections();
			} catch (error) {
				showToast(
					error instanceof Error ? error.message : `Could not link ${provider}`,
				);
			} finally {
				setChatBusy(undefined);
			}
		},
		[refreshChatConnections, showToast],
	);

	const toggleChatConnection = useCallback(
		async (connection: (typeof chatConnections)[number]) => {
			if (!connection.linked) {
				await linkChatProvider(connection.provider);
				return;
			}
			if (connection.needsConsent) {
				await linkChatProvider("twitch", true);
				return;
			}
			setChatBusy(connection.provider);
			try {
				if (connection.enabled) {
					await apiClient.chat.connections.disable.mutate({
						provider: connection.provider,
					});
				} else {
					await apiClient.chat.connections.enable.mutate({
						provider: connection.provider,
					});
				}
				await refreshChatConnections();
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Chat connection could not be changed",
				);
			} finally {
				setChatBusy(undefined);
			}
		},
		[linkChatProvider, refreshChatConnections, showToast],
	);

	const unlinkChatProvider = useCallback(
		async (connection: (typeof chatConnections)[number]) => {
			setChatBusy(connection.provider);
			try {
				if (connection.enabled) {
					await apiClient.chat.connections.disable.mutate({
						provider: connection.provider,
					});
				}
				const result = await authClient.unlinkAccount({
					providerId: connection.provider,
				});
				if (result.error)
					throw new Error(
						result.error.message ?? "Provider could not be unlinked",
					);
				await refreshChatConnections();
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Provider could not be unlinked",
				);
			} finally {
				setChatBusy(undefined);
			}
		},
		[refreshChatConnections, showToast],
	);

	const provisionDestination = useCallback(async () => {
		if (!userId || !installationId || streamUrl === undefined) {
			return;
		}
		setProvisioning(true);
		setMessage(undefined);
		try {
			const device = await apiClient.paths.claimNative.mutate({
				installationId,
				label: Device.deviceName ?? Device.modelName ?? "VISP Native",
				...(streamUrl ? { legacyUrl: streamUrl } : {}),
			});
			const url = selectPublishUrl([device.urls]);
			await saveStreamUrl(url, userId);
			setStreamUrl(url);
			await refreshPublishDevices();
		} catch (error) {
			setMessage(
				error instanceof Error
					? error.message
					: "The publish URL could not be created.",
			);
		} finally {
			setProvisioning(false);
		}
	}, [installationId, refreshPublishDevices, streamUrl, userId]);

	useEffect(() => {
		if (
			!userId ||
			!installationId ||
			streamUrl === undefined ||
			provisionStarted.current
		) {
			return;
		}
		provisionStarted.current = true;
		void provisionDestination();
	}, [installationId, provisionDestination, streamUrl, userId]);

	const cameraScreenVisible = Boolean(
		(streamUrl || previewing) &&
			!editing &&
			!(provisioning && !streamUrl && !previewing) &&
			!(session && streamUrl === null && !provisionStarted.current),
	);

	useEffect(() => {
		if (cameraScreenVisible && appState === "active") {
			void prepare();
		}
	}, [appState, cameraScreenVisible, prepare]);

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (nextState) => {
			setAppState(nextState);
			if (!IS_WEB && nextState !== "active") {
				void cameraRef.current?.stop();
			}
		});
		return () => subscription.remove();
	}, []);

	useEffect(() => () => clearTimeout(toastTimer.current), []);

	const onAudioLevel = useCallback(
		({ nativeEvent }: { nativeEvent: AudioLevelEvent }) => {
			setAudioTier(audioTierForLevel(nativeEvent.level));
		},
		[],
	);

	const onStateChange = useCallback(
		({ nativeEvent }: { nativeEvent: StreamStateEvent }) => {
			setState(nativeEvent.state);
			setErrorCode(nativeEvent.code);
			if (!ACTIVE_STATES.has(nativeEvent.state)) {
				setAudioTier(0);
			}
			if (nativeEvent.state === "live") {
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
		[showToast],
	);

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
	}, [draft, streamOwner]);

	const signIn = useCallback(async (provider: "twitch" | "kick") => {
		setSigningIn(provider);
		setMessage(undefined);
		try {
			const result =
				provider === "twitch"
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

	const toggleStream = useCallback(async () => {
		if (!streamUrl) {
			showToast("Add an SRT URL before going live");
			return;
		}
		setMessage(undefined);
		try {
			if (ACTIVE_STATES.has(state)) {
				setToast(undefined);
				await cameraRef.current?.stop();
			} else {
				showToast("Connecting to relay service…", true);
				await cameraRef.current?.start(streamUrl);
			}
		} catch {
			// The native module emits a sanitized error with the correct cause.
		}
	}, [showToast, state, streamUrl]);

	const toggleOrientation = useCallback(async () => {
		if (ACTIVE_STATES.has(state)) {
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

	const applyConfiguration = useCallback(async (next: VideoConfiguration) => {
		try {
			await cameraRef.current?.configure(
				next.cameraId,
				next.width,
				next.height,
				next.fps,
			);
			setConfiguration(next);
			return true;
		} catch {
			// The native module emits a sanitized error with the correct cause.
			return false;
		}
	}, []);

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
				if (ACTIVE_STATES.has(state)) {
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
	}, [refreshChatConnections, refreshPublishDevices]);

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
	}, []);

	if (
		sessionPending ||
		streamUrl === undefined ||
		imageStabilizationEnabled === undefined
	) {
		return (
			<View style={styles.loading}>
				<StatusBar style="light" />
				<ActivityIndicator color="#ffffff" />
				<Text style={styles.loadingText}>Loading publish destination...</Text>
			</View>
		);
	}

	if (!session && !editing && !streamUrl && !previewing) {
		return (
			<View style={styles.setupBackground}>
				<StatusBar style="light" />
				<SafeAreaView style={styles.setup}>
					<Text style={styles.title}>Sign in to VISP</Text>
					<Text style={styles.subtitle}>
						Connect Twitch or Kick to load your relay destination automatically.
					</Text>
					{message ? <Text style={styles.formError}>{message}</Text> : null}
					<Pressable
						accessibilityRole="button"
						disabled={Boolean(signingIn)}
						onPress={() => void signIn("twitch")}
						style={({ pressed }) => [
							styles.primaryButton,
							signingIn && styles.buttonDisabled,
							pressed && styles.buttonPressed,
						]}
					>
						<Text style={styles.primaryButtonText}>
							{signingIn === "twitch"
								? "Opening Twitch..."
								: "Continue with Twitch"}
						</Text>
					</Pressable>
					<Pressable
						accessibilityRole="button"
						disabled={Boolean(signingIn)}
						onPress={() => void signIn("kick")}
						style={({ pressed }) => [
							styles.secondaryButton,
							signingIn && styles.buttonDisabled,
							pressed && styles.buttonPressed,
						]}
					>
						<Text style={styles.secondaryButtonText}>
							{signingIn === "kick" ? "Opening Kick..." : "Continue with Kick"}
						</Text>
					</Pressable>
					<Pressable
						accessibilityRole="button"
						onPress={() => setEditing(true)}
						style={styles.textButton}
					>
						<Text style={styles.textButtonLabel}>Enter SRT URL manually</Text>
					</Pressable>
					<Pressable
						accessibilityRole="button"
						onPress={() => setPreviewing(true)}
						style={styles.textButton}
					>
						<Text style={styles.textButtonLabel}>Look around without URL</Text>
					</Pressable>
				</SafeAreaView>
			</View>
		);
	}

	// Keep the camera mounted while refreshing an existing destination. Flipping to a
	// full-screen loader unmounts VispSrtView, cleanup() kills preview, and prepare()
	// does not re-run because streamUrl/appState deps are unchanged.
	if (
		(provisioning && !streamUrl && !previewing) ||
		(session && streamUrl === null && !provisionStarted.current)
	) {
		return (
			<View style={styles.loading}>
				<StatusBar style="light" />
				<ActivityIndicator color="#ffffff" />
				<Text style={styles.loadingText}>Loading publish destination...</Text>
			</View>
		);
	}

	if ((!streamUrl && !previewing) || editing) {
		return (
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={styles.setupBackground}
			>
				<StatusBar style="light" />
				<SafeAreaView style={styles.setup}>
					<View style={styles.brandMark}>
						<Text style={styles.brandMarkText}>V</Text>
					</View>
					<Text style={styles.title}>
						{streamUrl
							? "Replace destination"
							: session
								? "Connect VISP"
								: "Manual SRT destination"}
					</Text>
					<Text style={styles.subtitle}>
						{session
							? "VISP fills this automatically. You can paste a publish URL manually if automatic setup fails."
							: "Paste your VISP SRT publish URL to stream without signing in."}
					</Text>
					<TextInput
						accessibilityLabel="VISP SRT publish URL"
						autoComplete="off"
						autoCapitalize="none"
						autoCorrect={false}
						inputMode="url"
						onChangeText={setDraft}
						onSubmitEditing={() => void save()}
						placeholder="srt://relay.example:8890?..."
						placeholderTextColor="#6f7785"
						secureTextEntry
						style={styles.input}
						value={draft}
					/>
					{message ? <Text style={styles.formError}>{message}</Text> : null}
					<Pressable
						accessibilityRole="button"
						disabled={!draft.trim()}
						onPress={() => void save()}
						style={({ pressed }) => [
							styles.primaryButton,
							!draft.trim() && styles.buttonDisabled,
							pressed && styles.buttonPressed,
						]}
					>
						<Text style={styles.primaryButtonText}>Save destination</Text>
					</Pressable>
					{editing ? (
						<Pressable
							accessibilityRole="button"
							onPress={() => {
								setDraft("");
								setEditing(false);
								setMessage(undefined);
							}}
							style={styles.textButton}
						>
							<Text style={styles.textButtonLabel}>Cancel</Text>
						</Pressable>
					) : (
						<>
							<Pressable
								accessibilityRole="button"
								onPress={() => void provisionDestination()}
								style={styles.textButton}
							>
								<Text style={styles.textButtonLabel}>
									Try automatic setup again
								</Text>
							</Pressable>
							<Pressable
								accessibilityRole="button"
								onPress={() => setPreviewing(true)}
								style={styles.textButton}
							>
								<Text style={styles.textButtonLabel}>
									Look around without URL
								</Text>
							</Pressable>
						</>
					)}
				</SafeAreaView>
			</KeyboardAvoidingView>
		);
	}

	const streaming =
		state === "live" || state === "connecting" || state === "reconnecting";
	const currentCamera = cameras.find(
		({ id }) => id === configuration?.cameraId,
	);
	const currentFormat = currentCamera?.formats.find(
		({ height, width }) =>
			height === configuration?.height && width === configuration.width,
	);
	const imageStabilizationSupported = supportsImageStabilization(
		currentCamera,
		configuration,
	);

	return (
		<View style={styles.container}>
			<StatusBar style="light" />
			<VispSrtView
				onAudioLevel={onAudioLevel}
				onStateChange={onStateChange}
				ref={cameraRef}
				style={StyleSheet.absoluteFill}
			/>
			<View pointerEvents="box-none" style={styles.scrim}>
				<SafeAreaView edges={["top", "bottom"]} style={styles.controls}>
					<View style={styles.topBar}>
						<View style={styles.statusCluster}>
							<View
								accessibilityLabel={STATE_LABELS[state]}
								style={styles.statusPill}
							>
								<View
									style={[styles.statusDot, state === "live" && styles.liveDot]}
								/>
								{state === "live" ? null : (
									<Text style={styles.statusText}>{STATE_LABELS[state]}</Text>
								)}
							</View>
							<View style={styles.indicatorPill}>
								<View
									accessibilityLabel={`Microphone ${AUDIO_TIER_LABELS[audioTier]}`}
									style={styles.micMeter}
								>
									{([1, 2, 3] as const).map((bar) => (
										<View
											key={bar}
											style={[
												styles.micBar,
												{
													backgroundColor:
														audioTier >= bar
															? AUDIO_TIER_COLORS[audioTier]
															: "rgba(255,255,255,0.28)",
													height: 3 + bar * 3,
												},
											]}
										/>
									))}
								</View>
								{imageStabilizationSupported && imageStabilizationEnabled ? (
									<Text style={styles.featureBadge}>STAB</Text>
								) : null}
								{session && chatPreferences.mode !== "hidden" ? (
									<Text style={styles.featureBadge}>CHAT</Text>
								) : null}
							</View>
						</View>
						<View style={styles.topBarButtons}>
							{session ? (
								<Pressable
									accessibilityRole="button"
									onPress={() => setStreamInfoOpen(true)}
									style={({ pressed }) => [
										styles.settingsButton,
										pressed && styles.buttonPressed,
									]}
								>
									<Text style={styles.settingsButtonText}>Info</Text>
								</Pressable>
							) : null}
							<Pressable
								accessibilityRole="button"
								onPress={openSettings}
								style={({ pressed }) => [
									styles.settingsButton,
									pressed && styles.buttonPressed,
								]}
							>
								<Text style={styles.settingsButtonText}>Settings</Text>
							</Pressable>
						</View>
					</View>

					<View style={styles.bottomPanel}>
						{message ? <Text style={styles.message}>{message}</Text> : null}
						{errorCode === "permission-denied" && !IS_WEB ? (
							<Pressable
								onPress={() => void Linking.openSettings()}
								style={styles.settingsLink}
							>
								<Text style={styles.settingsLinkText}>Open Settings</Text>
							</Pressable>
						) : null}
						{configuration ? (
							<Pressable
								accessibilityHint="Change camera, resolution, and frame rate"
								accessibilityRole="button"
								onPress={openSettings}
							>
								<Text style={styles.format}>
									{currentCamera?.name ?? "Camera"} ·{" "}
									{formatLabel(configuration)} · {configuration.fps} fps ·{" "}
									{IS_WEB ? "WebRTC" : "SRT"}
								</Text>
							</Pressable>
						) : null}
						{currentCamera && !IS_WEB ? (
							<View accessibilityRole="toolbar" style={styles.zoomControls}>
								{currentCamera.zoomLevels.map((level) => (
									<ZoomButton
										disabled={cameraSwitchDisabled}
										key={level}
										level={level}
										onPress={() => void selectZoom(level)}
										selected={Math.abs(level - selectedZoom) < 0.051}
									/>
								))}
							</View>
						) : null}
						<View style={styles.mainActions}>
							{cameras.length > 1 ? (
								<Pressable
									accessibilityLabel="Flip camera"
									accessibilityRole="button"
									disabled={cameraSwitchDisabled}
									onPress={flipCamera}
									style={({ pressed }) => [
										styles.roundButton,
										cameraSwitchDisabled && styles.actionDisabled,
										pressed && styles.buttonPressed,
									]}
								>
									<Text style={styles.roundButtonIcon}>⇄</Text>
								</Pressable>
							) : null}
							<Pressable
								accessibilityHint={
									streamUrl ? undefined : "Add an SRT URL before going live"
								}
								accessibilityLabel={streaming ? "Stop streaming" : "Go live"}
								accessibilityRole="button"
								disabled={state === "stopping" || state === "preparing"}
								onPress={() => void toggleStream()}
								style={({ pressed }) => [
									styles.liveButton,
									streaming && styles.stopButton,
									pressed && styles.buttonPressed,
								]}
							>
								<View
									style={[
										styles.liveButtonIcon,
										streaming && styles.stopButtonIcon,
									]}
								/>
								<Text style={styles.liveButtonText}>
									{streaming ? "Stop" : "Go Live"}
								</Text>
							</Pressable>
							{!IS_WEB ? (
								<Pressable
									accessibilityLabel="Change orientation"
									accessibilityRole="button"
									onPress={() => void toggleOrientation()}
									style={({ pressed }) => [
										styles.roundButton,
										pressed && styles.buttonPressed,
									]}
								>
									<Text style={styles.roundButtonIcon}>↻</Text>
								</Pressable>
							) : null}
						</View>
						{session ? <ObsControlButton onError={showToast} /> : null}
						{streamUrl ? null : (
							<View style={styles.urlActions}>
								<Pressable
									accessibilityRole="button"
									onPress={() => {
										setDraft("");
										setEditing(true);
									}}
								>
									<Text style={styles.urlAction}>Add URL</Text>
								</Pressable>
								<Pressable
									accessibilityRole="button"
									onPress={() => setPreviewing(false)}
								>
									<Text style={styles.urlAction}>Exit preview</Text>
								</Pressable>
							</View>
						)}
					</View>
				</SafeAreaView>
			</View>
			{chatPreferences.mode === "floating" ? (
				<FloatingChat
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
			<UI.BottomSheet
				isPresented={settingsOpen}
				onDismiss={() => setSettingsOpen(false)}
				snapPoints={["half", "full"]}
			>
				<UI.FieldGroup>
					<UI.FieldGroup.Section title="Camera">
						{cameras.length > 1 ? (
							<SettingRow label="Camera">
								<UI.Picker
									enabled={!cameraSwitchDisabled}
									onValueChange={(cameraId) => {
										const camera = cameras.find(({ id }) => id === cameraId);
										if (camera) {
											void selectCamera(camera);
										}
									}}
									selectedValue={configuration?.cameraId ?? ""}
								>
									{cameras.map(({ id, name }) => (
										<UI.Picker.Item key={id} label={name} value={id} />
									))}
								</UI.Picker>
							</SettingRow>
						) : null}
						<SettingRow label="Resolution">
							<UI.Picker
								enabled={!settingsDisabled}
								onValueChange={(value) => {
									const format = currentCamera?.formats.find(
										({ height, width }) => `${width}x${height}` === value,
									);
									if (currentCamera && format) {
										void applyConfiguration(
											configurationForFormat(
												currentCamera.id,
												format,
												configuration?.fps,
											),
										);
									}
								}}
								selectedValue={
									currentFormat
										? `${currentFormat.width}x${currentFormat.height}`
										: ""
								}
							>
								{currentCamera?.formats.map((format) => (
									<UI.Picker.Item
										key={`${format.width}x${format.height}`}
										label={`${format.width}×${format.height}`}
										value={`${format.width}x${format.height}`}
									/>
								))}
							</UI.Picker>
						</SettingRow>
						<SettingRow label="Frame rate">
							<UI.Picker
								enabled={!settingsDisabled}
								onValueChange={(fps) => {
									if (configuration) {
										void applyConfiguration({
											...configuration,
											fps: Number(fps),
										});
									}
								}}
								selectedValue={configuration?.fps ?? 0}
							>
								{currentFormat?.fps.map((fps) => (
									<UI.Picker.Item key={fps} label={`${fps} fps`} value={fps} />
								))}
							</UI.Picker>
						</SettingRow>
						{imageStabilizationSupported ? (
							<SettingRow label="Image stabilization">
								<UI.Switch
									disabled={cameraSwitchDisabled}
									onValueChange={(enabled) =>
										void updateImageStabilization(enabled)
									}
									value={imageStabilizationEnabled}
								/>
							</SettingRow>
						) : null}
						{settingsDisabled ? (
							<UI.FieldGroup.SectionFooter>
								<UI.Text textStyle={SUBTLE_TEXT}>
									Stop the stream to change resolution or frame rate.
								</UI.Text>
							</UI.FieldGroup.SectionFooter>
						) : null}
					</UI.FieldGroup.Section>

					<UI.FieldGroup.Section title="Audio">
						<SettingRow label="Microphone">
							<UI.Picker
								enabled={!settingsDisabled}
								onValueChange={(audioInputId) =>
									void applyAudioInput(String(audioInputId))
								}
								selectedValue={selectedAudioInputId}
							>
								<UI.Picker.Item
									label="System default"
									value={DEFAULT_AUDIO_INPUT_ID}
								/>
								{audioInputs.map(({ id, name }) => (
									<UI.Picker.Item key={id} label={name} value={id} />
								))}
							</UI.Picker>
						</SettingRow>
						{settingsDisabled ? (
							<UI.FieldGroup.SectionFooter>
								<UI.Text textStyle={SUBTLE_TEXT}>
									Stop the stream to change the microphone.
								</UI.Text>
							</UI.FieldGroup.SectionFooter>
						) : null}
					</UI.FieldGroup.Section>

					{session ? (
						<UI.FieldGroup.Section title="Chat overlay">
							<SettingRow label="Position">
								<UI.Picker
									onValueChange={(mode) =>
										updateChatPreferences((current) => ({
											...current,
											mode: mode as ChatPreferences["mode"],
										}))
									}
									selectedValue={chatPreferences.mode}
								>
									<UI.Picker.Item label="Hidden" value="hidden" />
									<UI.Picker.Item label="Floating" value="floating" />
									{!IS_WEB ? (
										<UI.Picker.Item
											label="Embedded in stream"
											value="embedded"
										/>
									) : null}
								</UI.Picker>
							</SettingRow>
							{!IS_WEB && chatPreferences.mode === "embedded" ? (
								<SettingRow label="Corner">
									<UI.Picker
										onValueChange={(corner) =>
											updateChatPreferences((current) => ({
												...current,
												corner: corner as ChatPreferences["corner"],
											}))
										}
										selectedValue={chatPreferences.corner}
									>
										<UI.Picker.Item label="Top left" value="top-left" />
										<UI.Picker.Item label="Top right" value="top-right" />
										<UI.Picker.Item label="Bottom left" value="bottom-left" />
										<UI.Picker.Item label="Bottom right" value="bottom-right" />
									</UI.Picker>
								</SettingRow>
							) : null}
						</UI.FieldGroup.Section>
					) : null}

					<UI.FieldGroup.Section>
						<UI.Row
							alignment="center"
							onPress={() => setAdvancedOpen((open) => !open)}
						>
							<UI.Text>Advanced</UI.Text>
							<UI.Spacer flexible />
							<UI.Text textStyle={SUBTLE_TEXT}>
								{advancedOpen ? "Hide" : "Show"}
							</UI.Text>
						</UI.Row>
					</UI.FieldGroup.Section>

					{advancedOpen ? (
						<>
							{session ? (
								<UI.FieldGroup.Section title="Account">
									<UI.Row alignment="center" spacing={12}>
										<UI.Text>Nickname</UI.Text>
										<UI.Spacer flexible />
										<UI.Text numberOfLines={1} textStyle={SUBTLE_TEXT}>
											{session.user.name}
										</UI.Text>
									</UI.Row>
									<UI.Row alignment="center" spacing={12}>
										<UI.Text>Email</UI.Text>
										<UI.Spacer flexible />
										<UI.Text numberOfLines={1} textStyle={SUBTLE_TEXT}>
											{session.user.email}
										</UI.Text>
									</UI.Row>
								</UI.FieldGroup.Section>
							) : null}

							{session ? (
								<UI.FieldGroup.Section title="Connections">
									{chatConnections.map((connection) => (
										<UI.Row
											alignment="center"
											key={connection.provider}
											spacing={12}
										>
											<UI.Column spacing={2}>
												<UI.Text>
													{connection.provider === "twitch" ? "Twitch" : "Kick"}
												</UI.Text>
												<UI.Text textStyle={SUBTLE_TEXT}>
													{connection.enabled
														? `Chat ${liveChat.statuses[connection.provider] ?? "connected"}`
														: connection.linked
															? "Linked · chat off"
															: "Not linked"}
												</UI.Text>
											</UI.Column>
											<UI.Spacer flexible />
											{connection.linked &&
											chatConnections.filter(({ linked }) => linked).length >
												1 ? (
												<UI.Button
													disabled={Boolean(chatBusy)}
													label="Unlink"
													onPress={() => void unlinkChatProvider(connection)}
													variant="text"
												/>
											) : null}
											{connection.linked && !connection.needsConsent ? (
												<UI.Switch
													disabled={Boolean(chatBusy)}
													onValueChange={() =>
														void toggleChatConnection(connection)
													}
													value={connection.enabled}
												/>
											) : (
												<UI.Button
													disabled={Boolean(chatBusy)}
													label={connection.needsConsent ? "Authorize" : "Link"}
													onPress={() => void toggleChatConnection(connection)}
													variant="outlined"
												/>
											)}
										</UI.Row>
									))}
								</UI.FieldGroup.Section>
							) : null}

							{session && publishDevices.length > 0 ? (
								<UI.FieldGroup.Section title="Publishing devices">
									{publishDevices.map((device) => {
										const revealedUrl = revealedDeviceUrls[device.id];
										const origin =
											device.publishOrigin === "native"
												? "VISP Native"
												: device.publishOrigin === "web"
													? "Web"
													: "Legacy";
										return (
											<UI.Row alignment="center" key={device.id} spacing={12}>
												<UI.Column spacing={2}>
													<UI.Text>
														{device.nativeInstallationId === installationId
															? `${device.label} · This device`
															: device.label}
													</UI.Text>
													<UI.Text textStyle={SUBTLE_TEXT}>
														{`${origin} · ${device.publishing ? "Live" : "Offline"}`}
													</UI.Text>
													{revealedUrl ? (
														<UI.Text
															numberOfLines={3}
															textStyle={{ color: SUBTLE, fontSize: 11 }}
														>
															{revealedUrl}
														</UI.Text>
													) : null}
												</UI.Column>
												<UI.Spacer flexible />
												{device.publishRevealable && !revealedUrl ? (
													<UI.Button
														label="Reveal"
														onPress={() => void revealPublishDevice(device.id)}
														variant="text"
													/>
												) : null}
											</UI.Row>
										);
									})}
								</UI.FieldGroup.Section>
							) : null}

							<UI.FieldGroup.Section title="Destination">
								<UI.Row alignment="center" spacing={12}>
									<UI.Text numberOfLines={1}>
										{streamUrl
											? describeStreamUrl(streamUrl)
											: "No SRT destination"}
									</UI.Text>
									<UI.Spacer flexible />
									<UI.Button
										disabled={settingsDisabled}
										label={streamUrl ? "Replace" : "Add"}
										onPress={() => {
											setSettingsOpen(false);
											setDraft("");
											setEditing(true);
										}}
										variant="text"
									/>
									{streamUrl ? (
										<UI.Button
											disabled={settingsDisabled}
											onPress={removeUrl}
											variant="text"
										>
											<UI.Text textStyle={{ color: DESTRUCTIVE }}>
												Delete
											</UI.Text>
										</UI.Button>
									) : null}
								</UI.Row>
							</UI.FieldGroup.Section>

							{session ? (
								<UI.FieldGroup.Section>
									<UI.Button
										onPress={() => {
											setSettingsOpen(false);
											void (async () => {
												await cameraRef.current?.stop();
												await authClient.signOut();
											})();
										}}
										variant="text"
									>
										<UI.Text textStyle={{ color: DESTRUCTIVE }}>
											Sign out
										</UI.Text>
									</UI.Button>
								</UI.FieldGroup.Section>
							) : null}
						</>
					) : null}
				</UI.FieldGroup>
			</UI.BottomSheet>
		</View>
	);
}

const styles = StyleSheet.create({
	actionDisabled: { opacity: 0.35 },
	bottomPanel: { alignItems: "center", gap: 12 },
	brandMark: {
		alignItems: "center",
		backgroundColor: "#ff354d",
		borderRadius: 16,
		height: 64,
		justifyContent: "center",
		marginBottom: 18,
		width: 64,
	},
	brandMarkText: { color: "white", fontSize: 32, fontWeight: "900" },
	buttonDisabled: { opacity: 0.4 },
	buttonPressed: { transform: [{ scale: 0.98 }] },
	container: { backgroundColor: "#07090d", flex: 1 },
	controls: { flex: 1, justifyContent: "space-between", paddingHorizontal: 20 },
	formError: {
		color: "#ff8795",
		fontSize: 14,
		marginTop: 12,
		textAlign: "center",
	},
	format: { color: "rgba(255,255,255,0.72)", fontSize: 12, fontWeight: "700" },
	input: {
		backgroundColor: "#151922",
		borderColor: "#303747",
		borderRadius: 14,
		borderWidth: 1,
		color: "white",
		fontSize: 16,
		marginTop: 28,
		paddingHorizontal: 16,
		paddingVertical: 16,
		width: "100%",
	},
	liveButton: {
		alignItems: "center",
		backgroundColor: "#ff354d",
		borderRadius: 28,
		flexDirection: "row",
		gap: 10,
		justifyContent: "center",
		minWidth: 164,
		paddingHorizontal: 26,
		paddingVertical: 16,
	},
	liveButtonIcon: {
		backgroundColor: "white",
		borderRadius: 7,
		height: 14,
		width: 14,
	},
	liveButtonText: { color: "white", fontSize: 17, fontWeight: "800" },
	liveDot: { backgroundColor: "#ff354d" },
	loading: {
		alignItems: "center",
		backgroundColor: "#07090d",
		flex: 1,
		justifyContent: "center",
	},
	loadingText: { color: "#9aa3b1", marginTop: 12 },
	message: {
		backgroundColor: "rgba(0,0,0,0.62)",
		borderRadius: 10,
		color: "white",
		fontSize: 13,
		overflow: "hidden",
		paddingHorizontal: 12,
		paddingVertical: 8,
		textAlign: "center",
	},
	mainActions: { flexDirection: "row", gap: 12 },
	roundButton: {
		alignItems: "center",
		backgroundColor: "rgba(16,19,25,0.88)",
		borderRadius: 28,
		height: 56,
		justifyContent: "center",
		width: 56,
	},
	roundButtonIcon: { color: "white", fontSize: 22, lineHeight: 24 },
	zoomButton: {
		borderCurve: "continuous",
		borderRadius: 24,
		height: 48,
		overflow: "hidden",
		width: 48,
	},
	zoomButtonFallback: {
		backgroundColor: "rgba(16,19,25,0.68)",
		borderColor: "rgba(255,255,255,0.3)",
		borderWidth: StyleSheet.hairlineWidth,
	},
	zoomButtonPressable: {
		alignItems: "center",
		flex: 1,
		justifyContent: "center",
	},
	zoomButtonSelected: {
		backgroundColor: "rgba(255,53,77,0.72)",
		borderColor: "rgba(255,255,255,0.72)",
	},
	zoomButtonText: {
		color: "white",
		fontSize: 13,
		fontVariant: ["tabular-nums"],
		fontWeight: "800",
	},
	zoomControls: { flexDirection: "row", gap: 10, justifyContent: "center" },
	primaryButton: {
		alignItems: "center",
		backgroundColor: "#ff354d",
		borderRadius: 14,
		marginTop: 18,
		padding: 16,
		width: "100%",
	},
	primaryButtonText: { color: "white", fontSize: 16, fontWeight: "800" },
	secondaryButton: {
		alignItems: "center",
		borderColor: "#303747",
		borderRadius: 14,
		borderWidth: 1,
		marginTop: 10,
		padding: 16,
		width: "100%",
	},
	secondaryButtonText: { color: "white", fontSize: 16, fontWeight: "800" },
	scrim: {
		backgroundColor: "rgba(0,0,0,0.08)",
		bottom: 0,
		left: 0,
		position: "absolute",
		right: 0,
		top: 0,
	},
	settingsLink: {
		backgroundColor: "rgba(255,255,255,0.16)",
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 9,
	},
	settingsLinkText: { color: "white", fontSize: 14, fontWeight: "700" },
	topBarButtons: { flexDirection: "row", gap: 8 },
	settingsButton: {
		backgroundColor: "rgba(0,0,0,0.6)",
		borderRadius: 18,
		paddingHorizontal: 14,
		paddingVertical: 8,
	},
	settingsButtonText: { color: "white", fontSize: 12, fontWeight: "800" },
	setup: {
		alignItems: "center",
		flex: 1,
		justifyContent: "center",
		padding: 28,
	},
	setupBackground: { backgroundColor: "#07090d", flex: 1 },
	featureBadge: {
		color: "rgba(255,255,255,0.85)",
		fontSize: 10,
		fontWeight: "800",
		letterSpacing: 0.5,
	},
	indicatorPill: {
		alignItems: "center",
		backgroundColor: "rgba(0,0,0,0.6)",
		borderRadius: 18,
		flexDirection: "row",
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	micBar: { borderRadius: 1.5, width: 3 },
	micMeter: {
		alignItems: "flex-end",
		flexDirection: "row",
		gap: 2,
		height: 12,
	},
	statusCluster: {
		alignItems: "center",
		flexDirection: "row",
		flexShrink: 1,
		gap: 8,
	},
	statusDot: {
		backgroundColor: "#8a93a2",
		borderRadius: 4,
		height: 8,
		width: 8,
	},
	statusPill: {
		alignItems: "center",
		backgroundColor: "rgba(0,0,0,0.6)",
		borderRadius: 18,
		flexDirection: "row",
		gap: 8,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	statusText: {
		color: "white",
		fontSize: 12,
		fontWeight: "800",
		textTransform: "uppercase",
	},
	stopButton: {
		backgroundColor: "rgba(16,19,25,0.88)",
		borderColor: "white",
		borderWidth: 2,
	},
	stopButtonIcon: { borderRadius: 2 },
	subtitle: {
		color: "#9aa3b1",
		fontSize: 16,
		lineHeight: 23,
		maxWidth: 360,
		textAlign: "center",
	},
	textButton: { marginTop: 16, padding: 10 },
	textButtonLabel: { color: "#c4cad4", fontSize: 15, fontWeight: "700" },
	title: { color: "white", fontSize: 30, fontWeight: "900", marginBottom: 12 },
	toast: {
		alignItems: "center",
		bottom: 150,
		left: 20,
		position: "absolute",
		right: 20,
	},
	toastContent: {
		alignItems: "center",
		backgroundColor: "rgba(21,25,34,0.96)",
		borderRadius: 12,
		flexDirection: "row",
		gap: 10,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	toastText: {
		color: "white",
		flexShrink: 1,
		fontSize: 14,
		fontWeight: "700",
		textAlign: "center",
	},
	topBar: {
		flexDirection: "row",
		gap: 10,
		justifyContent: "space-between",
		paddingTop: 8,
	},
	urlAction: {
		color: "rgba(255,255,255,0.82)",
		fontSize: 13,
		fontWeight: "700",
	},
	urlActions: { flexDirection: "row", gap: 28, marginBottom: 8, marginTop: 2 },
});
