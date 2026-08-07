import type { StreamState } from "../../modules/visp-srt";

/** Connecting, live, or reconnecting — the encoder is active. */
export function isPublishing(state: StreamState): boolean {
	switch (state) {
		case "connecting":
		case "live":
		case "reconnecting":
			return true;
		case "idle":
		case "preparing":
		case "stopping":
		case "error":
			return false;
		default: {
			const _exhaustive: never = state;
			return _exhaustive;
		}
	}
}

/** Publishing or winding down — settings stay locked and the stop control stays up. */
export function isStreamSession(state: StreamState): boolean {
	return isPublishing(state) || state === "stopping";
}
