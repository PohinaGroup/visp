import type { LinkMetrics } from "@VISP/api/link-stats";
import type { ColorValue, StyleProp, ViewStyle } from "react-native";

export type StreamState =
	| "idle"
	| "preparing"
	| "connecting"
	| "live"
	| "reconnecting"
	| "stopping"
	| "error";

export type StreamStateEvent = {
	attempt?: number;
	code?: string;
	message?: string;
	state: StreamState;
};

export type BondingMode = "off" | "broadcast" | "backup";
export type LinkTransport = "wifi" | "cellular";
export type BondedLinkStats = {
	bitrateKbps: number;
	id: string;
	packetLossPct: number;
	rttMs: number;
	state: string;
	transport: LinkTransport;
};

/** Peak microphone level, 0 (silence) to 1 (full scale). */
export type AudioLevelEvent = {
	level: number;
};

/** Live outbound link / ABR sample (~1 Hz while publishing). */
export type StreamStatsEvent = LinkMetrics & {
	links?: BondedLinkStats[];
};

export type VideoFormatCapability = {
	fps: number[];
	height: number;
	stabilizationFps: number[];
	width: number;
};

export type CameraCapability = {
	formats: VideoFormatCapability[];
	id: string;
	name: string;
	zoomLevels: number[];
};

export type AudioInputCapability = {
	id: string;
	name: string;
};

export type AudioOutputCapability = {
	id: string;
	name: string;
};

export type VispRoutePickerProps = {
	accessibilityLabel?: string;
	activeTintColor?: ColorValue;
	style?: StyleProp<ViewStyle>;
	tintColor?: ColorValue;
};

export type VideoConfiguration = {
	cameraId: CameraCapability["id"];
	fps: number;
	height: number;
	width: number;
};

export type VideoCapabilities = {
	audioInputs: AudioInputCapability[];
	cameras: CameraCapability[];
	selectedAudioInputId: string;
	selectedZoom: number;
	selected: VideoConfiguration;
};

export type ChatOverlayCorner =
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";

export type ChatOverlayMessage = {
	id: string;
	provider: "twitch" | "kick";
	sentAt: string;
	sender: {
		id: string;
		name: string;
		color: string;
		badges: Array<{ type: string; label: string; url?: string }>;
	};
	fragments: Array<
		| { type: "text"; text: string }
		| { type: "emote"; text: string; url: string }
	>;
	opacity?: number;
};

export type VispSrtViewRef = {
	configure(
		cameraId: CameraCapability["id"],
		width: number,
		height: number,
		fps: number,
		maxVideoBitrateKbps: number,
		bondingMode?: BondingMode,
	): Promise<void>;
	configureAudioInput(audioInputId: string): Promise<void>;
	setAudioIsolation(
		mode: "off" | "native" | "better",
		serverUrl?: string,
		authCookie?: string,
	): Promise<void>;
	switchCamera(cameraId: CameraCapability["id"]): Promise<void>;
	setImageStabilization(enabled: boolean): Promise<void>;
	setVideoBitrate(bitrateKbps: number): Promise<void>;
	setZoom(level: number): Promise<void>;
	getCapabilities(): Promise<VideoCapabilities>;
	prepare(): Promise<boolean>;
	updateChatOverlay(
		messages: ChatOverlayMessage[],
		corner: ChatOverlayCorner,
	): Promise<void>;
	clearChatOverlay(): Promise<void>;
	updateCaptionsOverlay(text: string): Promise<void>;
	clearCaptionsOverlay(): Promise<void>;
	startLiveCaptions(
		language: string,
		better: boolean,
		wsUrl?: string,
	): Promise<boolean>;
	stopLiveCaptions(): Promise<void>;
	start(url: string): Promise<void>;
	stop(): Promise<void>;
};

export type VispSrtViewProps = {
	onAudioLevel?: (event: { nativeEvent: AudioLevelEvent }) => void;
	onStateChange?: (event: { nativeEvent: StreamStateEvent }) => void;
	onStats?: (event: { nativeEvent: StreamStatsEvent }) => void;
	style?: StyleProp<ViewStyle>;
};
