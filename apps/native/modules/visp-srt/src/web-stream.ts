import { parsePublishCredentials } from "../../../src/lib/stream-url-validation";
import type { VideoFormatCapability } from "./VispSrt.types";

export type WebPublishTarget = {
	password: string;
	publisherScriptUrl: string;
	user: string;
	whipUrl: string;
};

/**
 * Whether `host` is a VISP relay: the configured relay itself or a sibling
 * under the same parent domain (relay-us.visp-stream.com next to
 * relay.visp-stream.com). Bare IPs and single-label hosts only match exactly.
 */
export function isAllowedRelayHost(host: string, configuredHost: string) {
	const candidate = host.toLowerCase();
	const configured = configuredHost.toLowerCase();
	if (!candidate || !configured) return false;
	if (candidate === configured) return true;
	if (/^[\d.]+$/.test(configured) || configured.includes(":")) return false;
	const labels = configured.split(".");
	if (labels.length < 3) return false;
	const parent = labels.slice(1).join(".");
	return candidate.endsWith(`.${parent}`);
}

export function webPublishTarget(
	streamUrl: string,
	relayWebRtcUrl?: string,
): WebPublishTarget {
	const { password, path, user } = parsePublishCredentials(streamUrl);
	let configured: URL;
	let assignedHost: string;
	try {
		assignedHost = new URL(streamUrl).hostname;
		configured = new URL(relayWebRtcUrl ?? "");
	} catch {
		throw new Error("Browser streaming is not configured.");
	}
	// publisher.js is executable code, and the stream URL can be pasted by
	// the user: only load it from a VISP relay.
	if (!isAllowedRelayHost(assignedHost, configured.hostname)) {
		throw new Error("This stream URL does not point to a VISP relay.");
	}
	// Keep same-host overrides for staging ports; never send a regional
	// device's media to the build-time default relay.
	const relay =
		configured.hostname === assignedHost
			? configured
			: new URL(`https://${assignedHost}`);
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
