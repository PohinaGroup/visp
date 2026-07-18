import type { StyleProp, ViewStyle } from "react-native";

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

/** Peak microphone level, 0 (silence) to 1 (full scale). */
export type AudioLevelEvent = {
	level: number;
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
	sender: { id: string; name: string; color?: string };
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
	): Promise<void>;
	configureAudioInput(audioInputId: string): Promise<void>;
	switchCamera(cameraId: CameraCapability["id"]): Promise<void>;
	setImageStabilization(enabled: boolean): Promise<void>;
	setZoom(level: number): Promise<void>;
	getCapabilities(): Promise<VideoCapabilities>;
	prepare(): Promise<boolean>;
	updateChatOverlay(
		messages: ChatOverlayMessage[],
		corner: ChatOverlayCorner,
	): Promise<void>;
	clearChatOverlay(): Promise<void>;
	start(url: string): Promise<void>;
	stop(): Promise<void>;
};

export type VispSrtViewProps = {
	onAudioLevel?: (event: { nativeEvent: AudioLevelEvent }) => void;
	onStateChange?: (event: { nativeEvent: StreamStateEvent }) => void;
	style?: StyleProp<ViewStyle>;
};
