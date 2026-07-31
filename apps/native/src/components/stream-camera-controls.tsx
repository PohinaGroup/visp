import { formatBondedLinks, formatLiveLinkHud } from "@VISP/api/link-stats";
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
import { ObsControls, type ObsStatus } from "./obs-control-button";
import { streamScreenStyles as styles } from "./stream-screen.styles";
import { ZoomButton } from "./zoom-button";
const STATE_LABELS: Record<StreamState, string> = {
	connecting: "Connecting",
	error: "Offline",
	idle: "Ready",
	live: "Live",
	preparing: "Starting camera",
	reconnecting: "Reconnecting",
	stopping: "Stopping",
};

export function StreamCameraControls({
	audioTier,
	bondingMode,
	cameraSwitchDisabled,
	cameras,
	chatVisible,
	configuration,
	errorCode,
	imageStabilizationActive,
	linkStats,
	message,
	onEditUrl,
	onExitPreview,
	onFlipCamera,
	onOpenInfo,
	onOpenSettings,
	onSelectZoom,
	onSetObsStatus,
	onToggleOrientation,
	onToggleStream,
	selectedZoom,
	showToast,
	signedIn,
	state,
	streaming,
	streamUrl,
}: {
	audioTier: AudioTier;
	bondingMode: BondingMode;
	cameraSwitchDisabled: boolean;
	cameras: CameraCapability[];
	chatVisible: boolean;
	configuration?: VideoConfiguration;
	errorCode?: string;
	imageStabilizationActive: boolean;
	linkStats: ReturnType<
		typeof import("../lib/use-link-stats-reporter").useLinkStatsReporter
	>["linkStats"];
	message?: string;
	onEditUrl: () => void;
	onExitPreview: () => void;
	onFlipCamera: () => void;
	onOpenInfo: () => void;
	onOpenSettings: () => void;
	onSelectZoom: (level: number) => void;
	onSetObsStatus: (status: ObsStatus | undefined) => void;
	onToggleOrientation: () => void;
	onToggleStream: () => void;
	selectedZoom: number;
	showToast: (text: string, spinning?: boolean) => void;
	signedIn: boolean;
	state: StreamState;
	streaming: boolean;
	streamUrl: string | null;
}) {
	const currentCamera = cameras.find(
		({ id }) => id === configuration?.cameraId,
	);
	const imageStabilizationSupported = supportsImageStabilization(
		currentCamera,
		configuration,
	);

	return (
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
							{imageStabilizationSupported && imageStabilizationActive ? (
								<Text style={styles.featureBadge}>STAB</Text>
							) : null}
							{chatVisible ? (
								<Text style={styles.featureBadge}>CHAT</Text>
							) : null}
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
								{formatLiveLinkHud(linkStats, state === "live")}
								{state === "live" && linkStats?.links?.length
									? ` · ${formatBondedLinks(linkStats.links)}`
									: ""}
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
							accessibilityHint={
								streamUrl ? undefined : "Add an SRT URL before going live"
							}
							accessibilityLabel={streaming ? "Stop streaming" : "Go live"}
							accessibilityRole="button"
							disabled={state === "stopping" || state === "preparing"}
							onPress={onToggleStream}
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
							<Pressable accessibilityRole="button" onPress={onExitPreview}>
								<Text style={styles.urlAction}>Exit preview</Text>
							</Pressable>
						</View>
					)}
				</View>
			</SafeAreaView>
		</View>
	);
}
