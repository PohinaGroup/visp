import type { ChatMessage } from "@VISP/api/chat/contract";

export type ChatDisplayMode = "hidden" | "floating" | "embedded";
export type ChatCorner =
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";
export type FloatingPosition = { x: number; y: number };
/** Voice language for reading chat aloud, not a UI language. */
export type SpeechLanguage = "off" | "fi-FI" | "en-US";
export type SpokenLanguage = Exclude<SpeechLanguage, "off">;
export type ChatPreferences = {
	mode: ChatDisplayMode;
	corner: ChatCorner;
	disappearingMessages: boolean;
	speechLanguage: SpeechLanguage;
	betterVoice: boolean;
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
	speechLanguage: "off",
	betterVoice: false,
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
const speechLanguages = new Set<SpeechLanguage>(["off", "fi-FI", "en-US"]);

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
			speechLanguage: speechLanguages.has(
				parsed.speechLanguage as SpeechLanguage,
			)
				? (parsed.speechLanguage as SpeechLanguage)
				: DEFAULT_CHAT_PREFERENCES.speechLanguage,
			betterVoice: parsed.betterVoice === true,
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

const SPEECH_ATTRIBUTION: Record<SpokenLanguage, string> = {
	"en-US": "says",
	"fi-FI": "terveisin",
};
const SPEECH_LINK: Record<SpokenLanguage, string> = {
	"en-US": "link",
	"fi-FI": "linkki",
};
// Time and money, not safety: the server already caps messages at 500
// characters. 200 is roughly ten seconds of speech, which keeps a flood queue
// drainable and bounds the per-message ElevenLabs spend.
const MAX_SPOKEN_BODY = 200;
const MAX_SPOKEN_NAME = 24;

/**
 * What a chat message sounds like, message first and sender last. Empty when
 * there is nothing worth speaking, so an emote train stays silent instead of
 * reading out a bare attribution.
 */
export function speechUtterance(
	message: ChatMessage,
	language: SpokenLanguage,
): string {
	const body = message.fragments
		.filter((fragment) => fragment.type === "text")
		.map((fragment) => fragment.text)
		// Twitch splits text around emotes without keeping their spacing.
		.join(" ")
		.replace(/\b(?:https?:\/\/|www\.)\S+/gi, SPEECH_LINK[language])
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_SPOKEN_BODY)
		.trim();
	if (!body) return "";
	const name = message.sender.name
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_SPOKEN_NAME)
		.trim();
	if (!name) return body;
	return `${body} ${SPEECH_ATTRIBUTION[language]} ${name}`;
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
