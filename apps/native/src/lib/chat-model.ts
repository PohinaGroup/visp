import type { ChatMessage } from "@VISP/api/chat/contract";

export type ChatDisplayMode = "hidden" | "floating" | "embedded";
export type ChatCorner =
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";
export type FloatingPosition = { x: number; y: number };
export type ChatPreferences = {
	mode: ChatDisplayMode;
	corner: ChatCorner;
	disappearingMessages: boolean;
	floating: { portrait: FloatingPosition; landscape: FloatingPosition };
};
export type VisibleChatMessage = ChatMessage & {
	opacity: number;
	receivedAt: number;
};

export const DEFAULT_CHAT_PREFERENCES: ChatPreferences = {
	mode: "hidden",
	corner: "bottom-left",
	disappearingMessages: false,
	floating: {
		portrait: { x: 16, y: 120 },
		landscape: { x: 24, y: 60 },
	},
};

const modes = new Set<ChatDisplayMode>(["hidden", "floating", "embedded"]);
const corners = new Set<ChatCorner>([
	"top-left",
	"top-right",
	"bottom-left",
	"bottom-right",
]);

function position(value: unknown, fallback: FloatingPosition) {
	if (!value || typeof value !== "object") return fallback;
	const candidate = value as Partial<FloatingPosition>;
	return {
		x: Number.isFinite(candidate.x)
			? Math.max(0, Number(candidate.x))
			: fallback.x,
		y: Number.isFinite(candidate.y)
			? Math.max(0, Number(candidate.y))
			: fallback.y,
	};
}

export function parseChatPreferences(value: string | null): ChatPreferences {
	if (!value) return DEFAULT_CHAT_PREFERENCES;
	try {
		const parsed = JSON.parse(value) as Partial<ChatPreferences>;
		return {
			mode: modes.has(parsed.mode as ChatDisplayMode)
				? (parsed.mode as ChatDisplayMode)
				: DEFAULT_CHAT_PREFERENCES.mode,
			corner: corners.has(parsed.corner as ChatCorner)
				? (parsed.corner as ChatCorner)
				: DEFAULT_CHAT_PREFERENCES.corner,
			disappearingMessages: parsed.disappearingMessages === true,
			floating: {
				portrait: position(
					parsed.floating?.portrait,
					DEFAULT_CHAT_PREFERENCES.floating.portrait,
				),
				landscape: position(
					parsed.floating?.landscape,
					DEFAULT_CHAT_PREFERENCES.floating.landscape,
				),
			},
		};
	} catch {
		return DEFAULT_CHAT_PREFERENCES;
	}
}

export function visibleChatMessages(
	messages: Array<ChatMessage & { receivedAt: number }>,
	disappearingMessages: boolean,
	now = Date.now(),
): VisibleChatMessage[] {
	return messages
		.filter(
			(message) => !disappearingMessages || now - message.receivedAt < 12_000,
		)
		.slice(-3)
		.map((message) => ({
			...message,
			opacity: disappearingMessages
				? Math.min(
						1,
						Math.max(0, (12_000 - (now - message.receivedAt)) / 4_000),
					)
				: 1,
		}));
}
