export const DIRECT_PROVIDERS = ["twitch", "kick", "youtube"] as const;
export type DirectProvider = (typeof DIRECT_PROVIDERS)[number];
export type DirectRole = "landscape" | "portrait";
export type DirectOutputRef =
	| { kind: "managed"; provider: DirectProvider; role: DirectRole }
	| {
			kind: "custom";
			outputId: string;
			destinationId: string;
			role: DirectRole;
	  };

export type DirectHookV3Destination = {
	outputId: string;
	kind: "managed" | "custom";
	label: string;
	role: DirectRole;
	protocol: "rtmp" | "rtmps" | "srt";
	muxer: "flv" | "mpegts";
	filter: string | null;
	url: string;
};

export const DIRECT_RUNNING_STATES = [
	"starting",
	"live",
	"retrying",
	"brb",
] as const;

export const DIRECT_OCCUPIED_STATES = [
	...DIRECT_RUNNING_STATES,
	"stopping",
] as const;

export const DIRECT_RESERVATION_MS = 60_000;

export const DIRECT_STATES = [
	"starting",
	"live",
	"retrying",
	"brb",
	"stopping",
	"failed",
	"stopped",
] as const;
export type DirectState = (typeof DIRECT_STATES)[number];

export function isDirectOccupiedState(
	state: string | null | undefined,
): state is (typeof DIRECT_OCCUPIED_STATES)[number] {
	return DIRECT_OCCUPIED_STATES.some((occupied) => occupied === state);
}

export class DirectError extends Error {
	constructor(
		readonly code:
			| "not-found"
			| "invalid"
			| "path-live"
			| "provider-taken"
			| "consent-required"
			| "capacity",
		message: string,
	) {
		super(message);
	}
}
