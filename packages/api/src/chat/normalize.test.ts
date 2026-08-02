import { describe, expect, test } from "bun:test";
import {
	kickEmoteUrl,
	normalizeKickMessage,
	normalizeTwitchMessage,
	normalizeYoutubeMessage,
	twitchEmoteUrl,
} from "./normalize";

describe("chat normalization", () => {
	test("normalizes Twitch fragments, badges, and deterministic fallback colors", () => {
		const payload = {
			message_id: "m1",
			chatter_user_id: "u1",
			chatter_user_name: "Alice",
			color: "red",
			badges: [
				{ set_id: "moderator", id: "1" },
				{ set_id: "subscriber", id: "12" },
			],
			message: {
				fragments: [
					{ type: "text", text: "hi " },
					{ type: "emote", text: "Kappa", emote: { id: "25" } },
				],
			},
		};
		const message = normalizeTwitchMessage(payload, (setId, versionId) =>
			setId === "moderator" && versionId === "1"
				? "https://static-cdn.jtvnw.net/mod.png"
				: undefined,
		);
		expect(message?.sender.color).toMatch(/^#[0-9A-F]{6}$/);
		expect(normalizeTwitchMessage(payload)?.sender.color).toBe(
			message?.sender.color,
		);
		expect(message?.sender.badges).toEqual([
			{
				type: "moderator",
				label: "Moderator",
				url: "https://static-cdn.jtvnw.net/mod.png",
			},
			{ type: "subscriber", label: "Subscriber", url: undefined },
		]);
		expect(message?.fragments).toEqual([
			{ type: "text", text: "hi " },
			{ type: "emote", text: "Kappa", url: twitchEmoteUrl("25") },
		]);
	});

	test("orders Kick positions and preserves emote fallback names", () => {
		const content = "Hi [emote:2:Wave] and [emote:1:Clap]";
		const message = normalizeKickMessage({
			message_id: "m2",
			created_at: "2026-01-01T00:00:00Z",
			content,
			sender: {
				user_id: 7,
				username: "Bob",
				identity: {
					username_color: "#aabbcc",
					badges: [
						{ type: "moderator", text: "Mod" },
						{ type: "founder", text: "" },
					],
				},
			},
			emotes: [
				{ emote_id: "1", positions: [{ s: 22, e: 35 }] },
				{ emote_id: "2", positions: [{ s: 3, e: 16 }] },
			],
		});
		expect(message?.sender.color).toBe("#AABBCC");
		expect(message?.sender.badges).toEqual([
			{ type: "moderator", label: "Mod" },
			{ type: "founder", label: "Founder" },
		]);
		expect(message?.fragments).toEqual([
			{ type: "text", text: "Hi " },
			{ type: "emote", text: "Wave", url: kickEmoteUrl("2") },
			{ type: "text", text: " and " },
			{ type: "emote", text: "Clap", url: kickEmoteUrl("1") },
		]);
	});

	test("clamps colors, badges, fragments, and total message length", () => {
		const message = normalizeTwitchMessage({
			message_id: "bounded",
			chatter_user_id: "viewer",
			chatter_user_name: "Viewer",
			color: "#0000ff",
			badges: Array.from({ length: 6 }, (_, index) => ({
				set_id: `badge-${index}-${"x".repeat(40)}`,
				id: index,
			})),
			message: {
				fragments: Array.from({ length: 40 }, () => ({
					text: "x".repeat(30),
					type: "text",
				})),
			},
		});
		expect(message?.sender.color).toBe("#3333FF");
		expect(message?.sender.badges).toHaveLength(4);
		expect(message?.sender.badges.every(({ type }) => type.length <= 32)).toBe(
			true,
		);
		expect(message?.fragments.length).toBeLessThanOrEqual(32);
		expect(
			message?.fragments.reduce(
				(length, fragment) => length + fragment.text.length,
				0,
			),
		).toBe(500);
	});

	test("normalizes displayable YouTube messages and author roles", () => {
		const message = normalizeYoutubeMessage({
			id: "yt-1",
			snippet: {
				type: "superChatEvent",
				hasDisplayContent: true,
				displayMessage: "Great stream!",
				publishedAt: "2026-08-02T12:00:00Z",
			},
			authorDetails: {
				channelId: "channel-1",
				displayName: "YouTube Viewer",
				isChatOwner: true,
				isChatModerator: true,
				isChatSponsor: true,
				isVerified: true,
			},
		});

		expect(message).toMatchObject({
			id: "yt-1",
			provider: "youtube",
			sender: {
				id: "channel-1",
				name: "YouTube Viewer",
				badges: [
					{ type: "broadcaster", label: "Broadcaster" },
					{ type: "moderator", label: "Moderator" },
					{ type: "subscriber", label: "Member" },
					{ type: "verified", label: "Verified" },
				],
			},
			fragments: [{ type: "text", text: "Great stream!" }],
		});
		expect(message?.sender.color).toMatch(/^#[0-9A-F]{6}$/);
	});

	test("ignores non-displayable and malformed YouTube events", () => {
		expect(
			normalizeYoutubeMessage({
				id: "tombstone",
				snippet: { type: "tombstone", hasDisplayContent: false },
			}),
		).toBeNull();
		expect(
			normalizeYoutubeMessage({
				id: "missing-author",
				snippet: { hasDisplayContent: true, displayMessage: "Hello" },
			}),
		).toBeNull();
	});
});
