export const MULTICHAT_PROVIDERS = ["twitch", "kick", "tiktok"] as const;
export type MultiChatProvider = (typeof MULTICHAT_PROVIDERS)[number];

export type MultiChatMessage = {
	id: string;
	provider: MultiChatProvider;
	sentAt: string;
	sender: string;
	color?: string;
	text: string;
};

export type MultiChatStatus = {
	provider: MultiChatProvider;
	state: "connected" | "connecting" | "disconnected" | "error";
	error?: string;
};

export type MultiChatEvent =
	| { type: "message"; message: MultiChatMessage }
	| { type: "status"; status: MultiChatStatus };
