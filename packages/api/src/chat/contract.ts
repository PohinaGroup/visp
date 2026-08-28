export type ChatProvider = "twitch" | "kick" | "youtube";

/**
 * YouTube chat rides on the Google account link. Lives here, not in
 * `connections.ts`, so the dashboard can call it without dragging the db (and
 * with it `dotenv`, `node:fs`) into the browser bundle.
 */
export function chatAuthProvider(provider: ChatProvider) {
	return provider === "youtube" ? "google" : provider;
}

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
	youtube: { background: "#FF0000", foreground: "#FFFFFF" },
} as const;

export const PROVIDER_PRESENTATION = {
	twitch: { initial: "T", label: "Twitch" },
	kick: { initial: "K", label: "Kick" },
	youtube: { initial: "Y", label: "YouTube" },
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

export type ChatAlertKind = "follow" | "sub" | "gift" | "cheer" | "raid";

export type ChatAlert = {
	id: string;
	provider: ChatProvider;
	kind: ChatAlertKind;
	sentAt: string;
	name: string;
	amount?: number | string;
	tier?: string;
	message?: string;
};

function alertTier(tier?: string) {
	return tier === "1000"
		? "Tier 1"
		: tier === "2000"
			? "Tier 2"
			: tier === "3000"
				? "Tier 3"
				: tier;
}

export function alertText(alert: ChatAlert) {
	const tier = alertTier(alert.tier);
	const suffix = `${tier ? ` · ${tier}` : ""}${alert.message ? `: ${alert.message}` : ""}`;
	switch (alert.kind) {
		case "follow":
			return `${alert.name} followed`;
		case "sub":
			return `${alert.name} subscribed${typeof alert.amount === "number" ? ` for ${alert.amount} month${alert.amount === 1 ? "" : "s"}` : ""}${suffix}`;
		case "gift": {
			const amount = typeof alert.amount === "number" ? alert.amount : 1;
			return `${alert.name} gifted ${amount} subscription${amount === 1 ? "" : "s"}${tier ? ` · ${tier}` : ""}`;
		}
		case "cheer":
			return `${alert.name} ${typeof alert.amount === "string" ? `sent ${alert.amount}` : `cheered ${alert.amount ?? 0} bits`}${alert.message ? `: ${alert.message}` : ""}`;
		case "raid": {
			const amount = typeof alert.amount === "number" ? alert.amount : 0;
			return `${alert.name} raided with ${amount} viewer${amount === 1 ? "" : "s"}`;
		}
	}
}

export type ChatLiveEvent =
	| { type: "message"; message: ChatMessage }
	| { type: "status"; status: ChatProviderStatus }
	| { type: "alert"; alert: ChatAlert };
