import type { ChatBadge, ChatFragment, ChatMessage } from "./contract";

const MAX_BADGES = 4;
const MAX_FRAGMENTS = 32;
const MAX_MESSAGE_LENGTH = 500;
const MAX_NAME_LENGTH = 64;
const COLOR = /^#[0-9a-f]{6}$/i;
const TWITCH_DEFAULT_COLORS = [
	"#FF0000",
	"#0000FF",
	"#00FF00",
	"#B22222",
	"#FF7F50",
	"#9ACD32",
	"#FF4500",
	"#2E8B57",
	"#DAA520",
	"#D2691E",
	"#5F9EA0",
	"#1E90FF",
	"#FF69B4",
	"#8A2BE2",
	"#00FF7F",
] as const;

function string(value: unknown, max: number) {
	return typeof value === "string" ? value.slice(0, max) : "";
}

function identifier(value: unknown, max = 160) {
	return typeof value === "string" || typeof value === "number"
		? String(value).slice(0, max)
		: "";
}

function date(value: unknown) {
	const parsed = typeof value === "string" ? new Date(value) : new Date();
	return Number.isNaN(parsed.getTime())
		? new Date().toISOString()
		: parsed.toISOString();
}

function senderColor(value: unknown, seedId: string) {
	const fallback =
		TWITCH_DEFAULT_COLORS[
			[...seedId].reduce(
				(hash, character) =>
					Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16_777_619) >>> 0,
				2_166_136_261,
			) % TWITCH_DEFAULT_COLORS.length
		] ?? "#FF0000";
	const hex =
		typeof value === "string" && COLOR.test(value)
			? value.toUpperCase()
			: fallback;
	const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
	const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
	const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
	const max = Math.max(red, green, blue);
	const min = Math.min(red, green, blue);
	const lightness = (max + min) / 2;
	if (lightness >= 0.6) return hex;
	if (max === min) return "#999999";
	const saturation = (max - min) / (1 - Math.abs(2 * lightness - 1));
	const targetRange = saturation * (1 - Math.abs(2 * 0.6 - 1));
	const targetMin = 0.6 - targetRange / 2;
	const adjust = (channel: number) =>
		Math.round(
			(targetMin + ((channel - min) / (max - min)) * targetRange) * 255,
		)
			.toString(16)
			.padStart(2, "0")
			.toUpperCase();
	return `#${adjust(red)}${adjust(green)}${adjust(blue)}`;
}

function slug(value: unknown) {
	return string(value, 128)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 32);
}

function humanize(value: string) {
	return value
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function finish(
	message: Omit<ChatMessage, "fragments"> & { fragments: ChatFragment[] },
): ChatMessage | null {
	let remaining = MAX_MESSAGE_LENGTH;
	const fragments: ChatFragment[] = [];
	for (const fragment of message.fragments.slice(0, MAX_FRAGMENTS)) {
		if (remaining <= 0) break;
		const text = fragment.text.slice(0, remaining);
		if (!text) continue;
		remaining -= text.length;
		fragments.push(
			fragment.type === "text" ? { type: "text", text } : { ...fragment, text },
		);
	}
	if (
		!message.id ||
		!message.sender.id ||
		!message.sender.name ||
		fragments.length === 0
	) {
		return null;
	}
	return {
		...message,
		sender: {
			...message.sender,
			badges: message.sender.badges.slice(0, MAX_BADGES).flatMap((badge) => {
				const type = slug(badge.type);
				const label = string(badge.label, 24);
				return type && label ? [{ ...badge, type, label }] : [];
			}),
		},
		fragments,
	};
}

export function twitchEmoteUrl(id: string) {
	return `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/static/dark/1.0`;
}

export function kickEmoteUrl(id: string) {
	return `https://files.kick.com/emotes/${encodeURIComponent(id)}/fullsize`;
}

export function normalizeTwitchMessage(
	payload: unknown,
	resolve?: (setId: string, versionId: string) => string | undefined,
): ChatMessage | null {
	if (!payload || typeof payload !== "object") return null;
	const event = payload as Record<string, unknown>;
	const message = event.message as { fragments?: unknown[] } | undefined;
	const senderId = identifier(event.chatter_user_id, 128);
	const fragments = (message?.fragments ?? []).flatMap<ChatFragment>((raw) => {
		if (!raw || typeof raw !== "object") return [];
		const fragment = raw as {
			emote?: { id?: unknown } | null;
			text?: unknown;
			type?: unknown;
		};
		const text = string(fragment.text, MAX_MESSAGE_LENGTH);
		const emoteId = string(fragment.emote?.id, 128);
		if (fragment.type === "emote" && emoteId) {
			return [{ type: "emote", text, url: twitchEmoteUrl(emoteId) }];
		}
		return text ? [{ type: "text", text }] : [];
	});
	const badges = (
		(event.badges as unknown[] | undefined) ?? []
	).flatMap<ChatBadge>((raw) => {
		if (!raw || typeof raw !== "object") return [];
		const badge = raw as { id?: unknown; set_id?: unknown };
		const type = slug(badge.set_id);
		const version = identifier(badge.id, 128);
		if (!type || !version) return [];
		return [
			{
				type,
				label: humanize(type),
				url: resolve?.(type, version),
			},
		];
	});
	return finish({
		id: identifier(event.message_id),
		provider: "twitch",
		sentAt: date(event.sent_at),
		sender: {
			id: senderId,
			name: string(
				event.chatter_user_name ?? event.chatter_user_login,
				MAX_NAME_LENGTH,
			),
			color: senderColor(event.color, senderId),
			badges,
		},
		fragments,
	});
}

type KickPosition = { e?: unknown; s?: unknown };
type KickEmote = { emote_id?: unknown; positions?: KickPosition[] };

export function normalizeKickMessage(payload: unknown): ChatMessage | null {
	if (!payload || typeof payload !== "object") return null;
	const event = payload as Record<string, unknown>;
	const sender = (event.sender ?? {}) as Record<string, unknown>;
	const identity = (sender.identity ?? {}) as Record<string, unknown>;
	const senderId = identifier(sender.user_id, 128);
	const content = string(event.content, MAX_MESSAGE_LENGTH);
	const positions = ((event.emotes as KickEmote[] | undefined) ?? [])
		.flatMap((emote) => {
			const id = string(emote.emote_id, 128);
			return (emote.positions ?? []).map((position) => ({
				id,
				start: Number(position.s),
				end: Number(position.e),
			}));
		})
		.filter(
			({ id, start, end }) =>
				id && Number.isInteger(start) && Number.isInteger(end),
		)
		.sort((a, b) => a.start - b.start)
		.slice(0, MAX_FRAGMENTS);

	const fragments: ChatFragment[] = [];
	let cursor = 0;
	for (const position of positions) {
		if (
			position.start < cursor ||
			position.start < 0 ||
			position.end < position.start ||
			position.end >= content.length
		)
			continue;
		if (position.start > cursor)
			fragments.push({
				type: "text",
				text: content.slice(cursor, position.start),
			});
		const token = content.slice(position.start, position.end + 1);
		const name = token.match(/^\[emote:[^:]+:(.+)]$/)?.[1] ?? token;
		fragments.push({
			type: "emote",
			text: name,
			url: kickEmoteUrl(position.id),
		});
		cursor = position.end + 1;
	}
	if (cursor < content.length)
		fragments.push({ type: "text", text: content.slice(cursor) });
	const badges = (
		(identity.badges as unknown[] | undefined) ?? []
	).flatMap<ChatBadge>((raw) => {
		if (!raw || typeof raw !== "object") return [];
		const badge = raw as { text?: unknown; type?: unknown };
		const type = slug(badge.type);
		if (!type) return [];
		return [
			{
				type,
				label: string(badge.text, 24) || humanize(type),
			},
		];
	});

	return finish({
		id: identifier(event.message_id),
		provider: "kick",
		sentAt: date(event.created_at),
		sender: {
			id: senderId,
			name: string(sender.username, MAX_NAME_LENGTH),
			color: senderColor(identity.username_color, senderId),
			badges,
		},
		fragments,
	});
}

export function normalizeYoutubeMessage(payload: unknown): ChatMessage | null {
	if (!payload || typeof payload !== "object") return null;
	const message = payload as Record<string, unknown>;
	const snippet = (message.snippet ?? {}) as Record<string, unknown>;
	const author = (message.authorDetails ?? {}) as Record<string, unknown>;
	if (
		snippet.hasDisplayContent !== true ||
		snippet.type === "tombstone" ||
		snippet.type === "chatEndedEvent"
	) {
		return null;
	}
	const senderId = identifier(author.channelId, 128);
	const badges: ChatBadge[] = [
		...(author.isChatOwner === true
			? [{ type: "broadcaster", label: "Broadcaster" }]
			: []),
		...(author.isChatModerator === true
			? [{ type: "moderator", label: "Moderator" }]
			: []),
		...(author.isChatSponsor === true
			? [{ type: "subscriber", label: "Member" }]
			: []),
		...(author.isVerified === true
			? [{ type: "verified", label: "Verified" }]
			: []),
	];
	return finish({
		id: identifier(message.id),
		provider: "youtube",
		sentAt: date(snippet.publishedAt),
		sender: {
			id: senderId,
			name: string(author.displayName, MAX_NAME_LENGTH),
			color: senderColor(undefined, senderId),
			badges,
		},
		fragments: [
			{
				type: "text",
				text: string(snippet.displayMessage, MAX_MESSAGE_LENGTH),
			},
		],
	});
}
