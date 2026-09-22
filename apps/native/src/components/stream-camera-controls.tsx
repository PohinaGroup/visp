import * as UI from "@expo/ui";
import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
	BondingMode,
	CameraCapability,
	StreamState,
	VideoConfiguration,
} from "../../modules/visp-srt";
import {
	AUDIO_TIER_COLORS,
	AUDIO_TIER_LABELS,
	type AudioTier,
} from "../lib/audio-level";
import {
	formatLabel,
	supportsImageStabilization,
} from "../lib/camera-settings";
import { IS_WEB } from "../lib/platform";
import { LinkStatsHud } from "./link-stats-hud";
import { ObsControls, type ObsStatus } from "./obs-control-button";
import { streamScreenStyles as styles } from "./stream-screen.styles";
import { ZoomButton } from "./zoom-button";

const STATE_LABELS: Record<StreamState, string> = {
	connecting: "Connecting",
	error: "Offline",
	idle: "Ready",
	live: "Relay connected",
	preparing: "Starting camera",
	reconnecting: "Reconnecting",
	stopping: "Stopping",
};

function formatElapsed(milliseconds: number): string {
	const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
	const minutes = Math.floor(seconds / 60);
	return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function StreamCameraControls({
	activeMicrophoneName,
	actionPending,
	audioMuted,
	audioTier,
	audioWarning,
	bondingMode,
	cameraSwitchDisabled,
	cameras,
	chatVisible,
	configuration,
	destinationError,
	destinationStatus,
	errorCode,
	exposureBias,
	focusExposureLocked,
	imageStabilizationActive,
	linkStats,
	linkStatsFresh,
	message,
	onEditUrl,
	onExitPreview,
	onFocusAt,
	onFlipCamera,
	onOpenInfo,
	onOpenSettings,
	onSelectZoom,
	onSetExposureBias,
	onToggleFocusExposureLock,
	onSetObsStatus,
	onToggleMute,
	onToggleOrientation,
	onToggleStream,
	qualityFallbackRecommended,
	reconnectStartedAt,
	selectedZoom,
	showToast,
	signedIn,
	state,
	streaming,
	streamUrl,
	streamStartedAt,
	videoBitrateCeilingKbps,
}: {
	activeMicrophoneName: string;
	actionPending: boolean;
	audioMuted: boolean;
	audioTier: AudioTier;
	audioWarning?: string;
	bondingMode: BondingMode;
	cameraSwitchDisabled: boolean;
	cameras: CameraCapability[];
	chatVisible: boolean;
	configuration?: VideoConfiguration;
	destinationError?: string;
	destinationStatus?: string;
	errorCode?: string;
	exposureBias: number;
	focusExposureLocked: boolean;
	imageStabilizationActive: boolean;
	linkStats: ReturnType<
		typeof import("../lib/use-link-stats-reporter").useLinkStatsReporter
	>["linkStats"];
	linkStatsFresh: boolean;
	message?: string;
	onEditUrl: () => void;
	onExitPreview: () => void;
	onFocusAt: (x: number, y: number) => void;
	onFlipCamera: () => void;
	onOpenInfo: () => void;
	onOpenSettings: () => void;
	onSelectZoom: (level: number) => void;
	onSetExposureBias: (bias: number) => void;
	onToggleFocusExposureLock: () => void;
	onSetObsStatus: (status: ObsStatus | undefined) => void;
	onToggleMute: () => void;
	onToggleOrientation: () => void;
	onToggleStream: () => void;
	qualityFallbackRecommended: boolean;
	reconnectStartedAt?: number;
	selectedZoom: number;
	showToast: (text: string, spinning?: boolean) => void;
	signedIn: boolean;
	state: StreamState;
	streaming: boolean;
	streamUrl: string | null;
	streamStartedAt?: number;
	videoBitrateCeilingKbps: number | undefined;
}) {
	const [now, setNow] = useState(Date.now());
	const [previewSize, setPreviewSize] = useState({ height: 0, width: 0 });
	useEffect(() => {
		if (!streamStartedAt && !reconnectStartedAt) return;
		setNow(Date.now());
		const interval = setInterval(() => setNow(Date.now()), 1_000);
		return () => clearInterval(interval);
	}, [reconnectStartedAt, streamStartedAt]);
	const currentCamera = cameras.find(
		({ id }) => id === configuration?.cameraId,
	);
	const elapsed = streamStartedAt
		? formatElapsed(now - streamStartedAt)
		: undefined;
	const reconnectElapsed = reconnectStartedAt
		? formatElapsed(now - reconnectStartedAt)
		: undefined;
	const imageStabilizationSupported = supportsImageStabilization(
		currentCamera,
		configuration,
	);

	return (
		<View pointerEvents="box-none" style={styles.scrim}>
			{!IS_WEB && configuration ? (
				<Pressable
					accessibilityHint="Tap to focus and expose at that point"
					accessibilityLabel="Camera preview"
					onLayout={({ nativeEvent }) => setPreviewSize(nativeEvent.layout)}
					onPress={({ nativeEvent }) => {
						if (!previewSize.width || !previewSize.height) return;
						onFocusAt(
							nativeEvent.locationX / previewSize.width,
							nativeEvent.locationY / previewSize.height,
						);
					}}
					style={styles.focusSurface}
				/>
			) : null}
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
							<Text style={styles.statusText}>{STATE_LABELS[state]}</Text>
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
							{imageStabilizationSupported && imageStabilizationActive ? (
								<Text style={styles.featureBadge}>STAB</Text>
							) : null}
							{chatVisible ? (
								<Text style={styles.featureBadge}>CHAT</Text>
							) : null}
							{audioMuted ? <Text style={styles.mutedBadge}>MUTED</Text> : null}
							{bondingMode !== "off" ? (
								<Text style={styles.featureBadge}>
									{errorCode === "link-degraded" ? "1 LINK" : "BOND"}
								</Text>
							) : null}
						</View>
					</View>
					<View style={styles.topBarButtons}>
						{signedIn ? (
							<Pressable
								accessibilityRole="button"
								onPress={onOpenInfo}
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
							onPress={onOpenSettings}
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
					{destinationStatus ? (
						<Text style={styles.destinationStatus}>{destinationStatus}</Text>
					) : null}
					{destinationError ? (
						<Pressable
							accessibilityHint="Open destination settings to repair this output"
							accessibilityRole="button"
							onPress={onOpenSettings}
							style={styles.destinationError}
						>
							<Text style={styles.destinationErrorText}>
								Destination problem: {destinationError}. Stop, then open
								settings.
							</Text>
						</Pressable>
					) : null}
					{audioWarning ? (
						<Text style={styles.audioWarning}>{audioWarning}</Text>
					) : null}
					{qualityFallbackRecommended ? (
						<Pressable
							accessibilityRole="button"
							onPress={onOpenSettings}
							style={styles.qualityRecommendation}
						>
							<Text style={styles.qualityRecommendationText}>
								Connection cannot sustain this quality. Stop, then choose
								Reliable 720p30.
							</Text>
						</Pressable>
					) : null}
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
							onPress={onOpenSettings}
						>
							<Text style={styles.format}>
								{currentCamera?.name ?? "Camera"} · {formatLabel(configuration)}{" "}
								· {configuration.fps} fps · {IS_WEB ? "WebRTC" : "SRT"}
							</Text>
						</Pressable>
					) : null}
					{state === "live" || state === "reconnecting" ? (
						<Text style={styles.streamDuration}>
							{elapsed ? `Stream ${elapsed}` : "Starting stream"}
							{reconnectElapsed ? ` · Reconnecting ${reconnectElapsed}` : ""}
						</Text>
					) : (
						<Text style={styles.microphoneName}>{activeMicrophoneName}</Text>
					)}
					{!IS_WEB && configuration ? (
						<View style={styles.exposureControls}>
							<Pressable
								accessibilityRole="button"
								onPress={onToggleFocusExposureLock}
								style={styles.focusLockButton}
							>
								<Text style={styles.focusLockText}>
									{focusExposureLocked ? "AE/AF LOCK" : "LOCK AE/AF"}
								</Text>
							</Pressable>
							<UI.Slider
								max={3}
								min={-3}
								step={0.1}
								value={exposureBias}
								onValueChange={onSetExposureBias}
							/>
							<Text style={styles.exposureLabel}>
								Exposure {exposureBias > 0 ? "+" : ""}
								{exposureBias.toFixed(1)}
							</Text>
						</View>
					) : null}
					<LinkStatsHud
						linkStats={linkStats}
						linkStatsFresh={linkStatsFresh}
						live={state === "live"}
						videoBitrateCeilingKbps={videoBitrateCeilingKbps}
					/>
					{currentCamera && !IS_WEB ? (
						<View accessibilityRole="toolbar" style={styles.zoomControls}>
							{currentCamera.zoomLevels.map((level) => (
								<ZoomButton
									disabled={cameraSwitchDisabled}
									key={level}
									level={level}
									onPress={() => onSelectZoom(level)}
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
								onPress={onFlipCamera}
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
							accessibilityLabel={
								audioMuted ? "Unmute microphone" : "Mute microphone"
							}
							accessibilityRole="button"
							onPress={onToggleMute}
							style={({ pressed }) => [
								styles.roundButton,
								audioMuted && styles.mutedButton,
								pressed && styles.buttonPressed,
							]}
						>
							<Text style={styles.micButtonText}>
								{audioMuted ? "M" : "MIC"}
							</Text>
						</Pressable>
						<Pressable
							accessibilityHint={
								streamUrl ? undefined : "Add an SRT URL before going live"
							}
							accessibilityLabel={streaming ? "Stop streaming" : "Go live"}
							accessibilityRole="button"
							disabled={
								actionPending || state === "stopping" || state === "preparing"
							}
							onPress={onToggleStream}
							style={({ pressed }) => [
								styles.liveButton,
								actionPending && styles.actionDisabled,
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
								onPress={onToggleOrientation}
								style={({ pressed }) => [
									styles.roundButton,
									pressed && styles.buttonPressed,
								]}
							>
								<Text style={styles.roundButtonIcon}>↻</Text>
							</Pressable>
						) : null}
					</View>
					{signedIn ? (
						<ObsControls onError={showToast} onStatusChange={onSetObsStatus} />
					) : null}
					{streamUrl ? null : (
						<View style={styles.urlActions}>
							<Pressable accessibilityRole="button" onPress={onEditUrl}>
								<Text style={styles.urlAction}>Add URL</Text>
							</Pressable>
							{/* Signed in there is nothing to exit to: this screen is the app. */}
							{signedIn ? null : (
								<Pressable accessibilityRole="button" onPress={onExitPreview}>
									<Text style={styles.urlAction}>Exit preview</Text>
								</Pressable>
							)}
						</View>
					)}
				</View>
			</SafeAreaView>
		</View>
	);
}
