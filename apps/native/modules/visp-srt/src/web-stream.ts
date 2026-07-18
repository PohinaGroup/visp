import { parsePublishCredentials } from "../../../src/lib/stream-url-validation";
import type { VideoFormatCapability } from "./VispSrt.types";

export type WebPublishTarget = {
	password: string;
	publisherScriptUrl: string;
	user: string;
	whipUrl: string;
};

export function webPublishTarget(
	streamUrl: string,
	relayWebRtcUrl: string,
): WebPublishTarget {
	const { password, path, user } = parsePublishCredentials(streamUrl);
	let relay: URL;
	try {
		relay = new URL(relayWebRtcUrl);
	} catch {
		throw new Error("Browser streaming is not configured.");
	}
	if (relay.protocol !== "https:") {
		throw new Error("Browser streaming requires an HTTPS relay.");
	}
	const base = relay.toString().replace(/\/$/, "");
	const encodedPath = encodeURIComponent(path);
	return {
		password,
		publisherScriptUrl: `${base}/${encodedPath}/publisher.js`,
		user,
		whipUrl: `${base}/${encodedPath}/whip`,
	};
}

export function webVideoFormats(
	capabilities?: MediaTrackCapabilities,
): VideoFormatCapability[] {
	const formats: VideoFormatCapability[] = [
		{
			fps: [30],
			height: 720,
			stabilizationFps: [],
			width: 1280,
		},
	];
	if (
		(capabilities?.width?.max ?? 0) >= 1920 &&
		(capabilities?.height?.max ?? 0) >= 1080 &&
		(capabilities?.frameRate?.max ?? 0) >= 30
	) {
		formats.push({
			fps: [30],
			height: 1080,
			stabilizationFps: [],
			width: 1920,
		});
	}
	return formats;
}

export function sanitizedMediaError(error: unknown): {
	code: string;
	message: string;
} {
	const name = error instanceof DOMException ? error.name : "";
	if (name === "NotAllowedError" || name === "SecurityError") {
		return {
			code: "permission-denied",
			message: "Allow camera and microphone access in your browser settings.",
		};
	}
	if (name === "NotFoundError" || name === "NotReadableError") {
		return {
			code: "device-unavailable",
			message: "The selected camera or microphone is unavailable.",
		};
	}
	if (name === "OverconstrainedError") {
		return {
			code: "configuration-unavailable",
			message: "The selected camera does not support these stream settings.",
		};
	}
	return {
		code: "media-failed",
		message: "The browser could not start the camera and microphone.",
	};
}

export function stopMediaStream(stream: MediaStream | undefined): void {
	for (const track of stream?.getTracks() ?? []) track.stop();
}
