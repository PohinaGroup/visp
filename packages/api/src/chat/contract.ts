export type ChatProvider = "twitch" | "kick";
export type ChatCorner =
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";

export type ChatFragment =
	| { type: "text"; text: string }
	| { type: "emote"; text: string; url: string };

export type ChatBadge = { type: string; label: string; url?: string };

export const PROVIDER_CHIP = {
	twitch: { background: "#9146FF", foreground: "#FFFFFF" },
	kick: { background: "#53FC18", foreground: "#071005" },
} as const;

export const BADGE_CHIP_COLOR = {
	broadcaster: "#E91916",
	moderator: "#00AD03",
	vip: "#E005B9",
	subscriber: "#6441A5",
	founder: "#C79A00",
	default: "#53606E",
} as const;

export type ChatMessage = {
	id: string;
	provider: ChatProvider;
	sentAt: string;
	sender: { id: string; name: string; color: string; badges: ChatBadge[] };
	fragments: ChatFragment[];
};

export type ChatProviderStatus = {
	provider: ChatProvider;
	state: "connected" | "connecting" | "disconnected" | "error";
	error?: string;
};

export type ChatLiveEvent =
	| { type: "message"; message: ChatMessage }
	| { type: "status"; status: ChatProviderStatus };
