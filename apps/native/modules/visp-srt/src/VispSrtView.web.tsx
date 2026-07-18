import {
	type CSSProperties,
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
} from "react";
import { View } from "react-native";
import type {
	CameraCapability,
	StreamStateEvent,
	VideoCapabilities,
	VideoConfiguration,
	VispSrtViewProps,
	VispSrtViewRef,
} from "./VispSrt.types";
import {
	sanitizedMediaError,
	stopMediaStream,
	webPublishTarget,
	webVideoFormats,
} from "./web-stream";

type PublisherOptions = {
	audioBitrate: number;
	audioCodec: string;
	audioVoice: boolean;
	onConnected: () => void;
	onError: (error: string) => void;
	pass: string;
	stream: MediaStream;
	url: string;
	user: string;
	videoBitrate: number;
	videoCodec: string;
};

type Publisher = { close(): void };
type PublisherConstructor = new (options: PublisherOptions) => Publisher;
type WakeLockSentinelLike = { release(): Promise<void> };

const videoStyle: CSSProperties = {
	background: "black",
	height: "100%",
	objectFit: "cover",
	width: "100%",
};

let publisherScript: Promise<PublisherConstructor> | undefined;

function publisherClass(scriptUrl: string): Promise<PublisherConstructor> {
	const existing = (
		window as unknown as {
			MediaMTXWebRTCPublisher?: PublisherConstructor;
		}
	).MediaMTXWebRTCPublisher;
	if (existing) return Promise.resolve(existing);
	if (publisherScript) return publisherScript;
	const loading = new Promise<PublisherConstructor>((resolve, reject) => {
		const script = document.createElement("script");
		script.src = scriptUrl;
		script.async = true;
		script.onload = () => {
			const loaded = (
				window as unknown as {
					MediaMTXWebRTCPublisher?: PublisherConstructor;
				}
			).MediaMTXWebRTCPublisher;
			if (loaded) resolve(loaded);
			else reject(new Error("Publisher unavailable"));
		};
		script.onerror = () => reject(new Error("Publisher unavailable"));
		document.head.appendChild(script);
	}).catch((error: unknown) => {
		publisherScript = undefined;
		throw error;
	});
	publisherScript = loading;
	return loading;
}

function h264Supported(): boolean {
	if (typeof RTCRtpSender === "undefined") return false;
	return Boolean(
		RTCRtpSender.getCapabilities?.("video")?.codecs.some(
			(codec) => codec.mimeType.toLowerCase() === "video/h264",
		),
	);
}

export default forwardRef<VispSrtViewRef, VispSrtViewProps>(
	function VispSrtView({ onAudioLevel, onStateChange, style }, ref) {
		const videoRef = useRef<HTMLVideoElement>(null);
		const streamRef = useRef<MediaStream | undefined>(undefined);
		const publisherRef = useRef<Publisher | undefined>(undefined);
		const audioContextRef = useRef<AudioContext | undefined>(undefined);
		const audioFrameRef = useRef<number | undefined>(undefined);
		const wakeLockRef = useRef<WakeLockSentinelLike | undefined>(undefined);
		const activeRef = useRef(false);
		const selectedAudioRef = useRef("default");
		const configurationRef = useRef<VideoConfiguration>({
			cameraId: "",
			fps: 30,
			height: 720,
			width: 1280,
		});
		const capabilitiesRef = useRef<VideoCapabilities | undefined>(undefined);
		const stateCallbackRef = useRef(onStateChange);
		const audioCallbackRef = useRef(onAudioLevel);

		stateCallbackRef.current = onStateChange;
		audioCallbackRef.current = onAudioLevel;

		const emitState = useCallback((event: StreamStateEvent) => {
			stateCallbackRef.current?.({ nativeEvent: event });
		}, []);

		const stopAudioMeter = useCallback(() => {
			if (audioFrameRef.current !== undefined) {
				cancelAnimationFrame(audioFrameRef.current);
				audioFrameRef.current = undefined;
			}
			void audioContextRef.current?.close();
			audioContextRef.current = undefined;
		}, []);

		const startAudioMeter = useCallback(
			(stream: MediaStream) => {
				stopAudioMeter();
				const AudioContextClass = window.AudioContext;
				if (!AudioContextClass || stream.getAudioTracks().length === 0) return;
				const context = new AudioContextClass();
				void context.resume().catch(() => undefined);
				const analyser = context.createAnalyser();
				analyser.fftSize = 256;
				context.createMediaStreamSource(stream).connect(analyser);
				const samples = new Uint8Array(analyser.fftSize);
				const sample = () => {
					analyser.getByteTimeDomainData(samples);
					let peak = 0;
					for (const value of samples)
						peak = Math.max(peak, Math.abs(value - 128));
					audioCallbackRef.current?.({ nativeEvent: { level: peak / 128 } });
					audioFrameRef.current = requestAnimationFrame(sample);
				};
				audioContextRef.current = context;
				sample();
			},
			[stopAudioMeter],
		);

		const releaseWakeLock = useCallback(async () => {
			const lock = wakeLockRef.current;
			wakeLockRef.current = undefined;
			await lock?.release().catch(() => undefined);
		}, []);

		const requestWakeLock = useCallback(async () => {
			if (!activeRef.current || document.visibilityState !== "visible") return;
			const wakeLock = (
				navigator as Navigator & {
					wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
				}
			).wakeLock;
			if (!wakeLock) return;
			wakeLockRef.current = await wakeLock
				.request("screen")
				.catch(() => undefined);
		}, []);

		const stopMedia = useCallback(() => {
			stopAudioMeter();
			stopMediaStream(streamRef.current);
			streamRef.current = undefined;
			if (videoRef.current) videoRef.current.srcObject = null;
		}, [stopAudioMeter]);

		const acquireMedia = useCallback(async () => {
			if (!navigator.mediaDevices?.getUserMedia) {
				throw new Error("Media devices are unavailable");
			}
			const selected = configurationRef.current;
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					...(selectedAudioRef.current !== "default"
						? { deviceId: { exact: selectedAudioRef.current } }
						: {}),
				},
				video: {
					...(selected.cameraId
						? { deviceId: { exact: selected.cameraId } }
						: {}),
					frameRate: { ideal: selected.fps, max: selected.fps },
					height: { ideal: selected.height },
					width: { ideal: selected.width },
				},
			});
			stopMedia();
			streamRef.current = stream;
			if (videoRef.current) {
				videoRef.current.srcObject = stream;
				await videoRef.current.play().catch(() => undefined);
			}
			startAudioMeter(stream);

			const devices = await navigator.mediaDevices.enumerateDevices();
			const videoTrack = stream.getVideoTracks()[0];
			const settings = videoTrack?.getSettings() ?? {};
			const selectedCameraId = settings.deviceId ?? selected.cameraId;
			const selectedFormats = webVideoFormats(videoTrack?.getCapabilities?.());
			const cameras: CameraCapability[] = devices
				.filter((device) => device.kind === "videoinput")
				.map((device, index) => ({
					formats:
						device.deviceId === selectedCameraId
							? selectedFormats
							: webVideoFormats(),
					id: device.deviceId,
					name: device.label || `Camera ${index + 1}`,
					zoomLevels: [1],
				}));
			if (!cameras.length && selectedCameraId) {
				cameras.push({
					formats: selectedFormats,
					id: selectedCameraId,
					name: "Camera",
					zoomLevels: [1],
				});
			}
			configurationRef.current = {
				...selected,
				cameraId: selectedCameraId || cameras[0]?.id || "",
			};
			const audioInputs = devices
				.filter(
					(device) =>
						device.kind === "audioinput" && device.deviceId !== "default",
				)
				.map((device, index) => ({
					id: device.deviceId,
					name: device.label || `Microphone ${index + 1}`,
				}));
			capabilitiesRef.current = {
				audioInputs,
				cameras,
				selected: configurationRef.current,
				selectedAudioInputId: selectedAudioRef.current,
				selectedZoom: 1,
			};
		}, [startAudioMeter, stopMedia]);

		const prepare = useCallback(async () => {
			emitState({ state: "preparing" });
			let requestedPermissions = false;
			try {
				const permissionNames = ["camera", "microphone"] as PermissionName[];
				const permissions = await Promise.all(
					permissionNames.map((name) =>
						navigator.permissions?.query({ name }).catch(() => undefined),
					),
				);
				requestedPermissions = permissions.some(
					(permission) => permission?.state === "prompt",
				);
				await acquireMedia();
				emitState({ state: "idle" });
				return requestedPermissions;
			} catch (error) {
				const sanitized = sanitizedMediaError(error);
				emitState({ ...sanitized, state: "error" });
				throw new Error(sanitized.message);
			}
		}, [acquireMedia, emitState]);

		const stopPublisher = useCallback(
			async (emit = true) => {
				if (emit) emitState({ state: "stopping" });
				activeRef.current = false;
				publisherRef.current?.close();
				publisherRef.current = undefined;
				await releaseWakeLock();
				stopMedia();
				if (emit) emitState({ state: "idle" });
			},
			[emitState, releaseWakeLock, stopMedia],
		);

		useImperativeHandle(
			ref,
			() => ({
				async clearChatOverlay() {},
				async configure(cameraId, width, height, fps) {
					if (activeRef.current)
						throw new Error("Camera settings cannot change while live.");
					configurationRef.current = { cameraId, fps, height, width };
					await acquireMedia();
				},
				async configureAudioInput(audioInputId) {
					if (activeRef.current)
						throw new Error("Microphone settings cannot change while live.");
					selectedAudioRef.current = audioInputId;
					await acquireMedia();
				},
				async getCapabilities() {
					if (!capabilitiesRef.current) await prepare();
					if (!capabilitiesRef.current)
						throw new Error("Camera capabilities are unavailable.");
					return capabilitiesRef.current;
				},
				prepare,
				async setImageStabilization() {},
				async setZoom() {},
				async start(streamUrl) {
					if (!streamRef.current) await prepare();
					if (!streamRef.current) throw new Error("Camera is unavailable.");
					if (!h264Supported()) {
						emitState({
							code: "codec-unavailable",
							message: "This browser cannot publish H.264 video.",
							state: "error",
						});
						throw new Error("This browser cannot publish H.264 video.");
					}
					try {
						const relayUrl = process.env.EXPO_PUBLIC_RELAY_WEBRTC_URL;
						if (!relayUrl)
							throw new Error("Browser streaming is not configured.");
						const target = webPublishTarget(streamUrl, relayUrl);
						const PublisherClass = await publisherClass(
							target.publisherScriptUrl,
						);
						activeRef.current = true;
						emitState({ state: "connecting" });
						publisherRef.current = new PublisherClass({
							audioBitrate: 96,
							audioCodec: "opus/48000",
							audioVoice: true,
							onConnected: () => {
								emitState({ state: "live" });
								void requestWakeLock();
							},
							onError: () => {
								if (activeRef.current) {
									emitState({
										message: "Reconnecting to the relay…",
										state: "reconnecting",
									});
								}
							},
							pass: target.password,
							stream: streamRef.current,
							url: target.whipUrl,
							user: target.user,
							videoBitrate: 3500,
							videoCodec: "h264/90000",
						});
					} catch {
						activeRef.current = false;
						emitState({
							code: "connection-failed",
							message: "The browser could not connect to the relay.",
							state: "error",
						});
						throw new Error("The browser could not connect to the relay.");
					}
				},
				stop: stopPublisher,
				async switchCamera(cameraId) {
					if (activeRef.current)
						throw new Error("Camera switching is unavailable while live.");
					configurationRef.current = {
						...configurationRef.current,
						cameraId,
					};
					await acquireMedia();
				},
				async updateChatOverlay() {},
			}),
			[acquireMedia, emitState, prepare, requestWakeLock, stopPublisher],
		);

		useEffect(() => {
			const visibility = () => {
				if (document.visibilityState === "visible") void requestWakeLock();
			};
			const unload = () => void stopPublisher(false);
			document.addEventListener("visibilitychange", visibility);
			window.addEventListener("beforeunload", unload);
			return () => {
				document.removeEventListener("visibilitychange", visibility);
				window.removeEventListener("beforeunload", unload);
				void stopPublisher(false);
			};
		}, [requestWakeLock, stopPublisher]);

		return (
			<View style={style}>
				<video autoPlay muted playsInline ref={videoRef} style={videoStyle} />
			</View>
		);
	},
);
