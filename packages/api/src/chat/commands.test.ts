import { describe, expect, test } from "bun:test";
import {
	type CustomCommand,
	formatDuration,
	renderTemplate,
	resolveCommand,
} from "./commands";
import type { ChatBadge, ChatMessage } from "./contract";

function message(text: string, badges: ChatBadge[] = []): ChatMessage {
	return {
		id: "1",
		provider: "twitch",
		sentAt: new Date().toISOString(),
		sender: { id: "viewer", name: "Viewer", color: "#fff", badges },
		fragments: [{ type: "text", text }],
	};
}

const MOD: ChatBadge[] = [{ type: "moderator", label: "Moderator" }];

const custom: CustomCommand[] = [
	{
		name: "discord",
		response: "Join at example.com/discord",
		modOnly: false,
		enabled: true,
		cooldownSeconds: 10,
	},
	{
		name: "secret",
		response: "Mods only",
		modOnly: true,
		enabled: true,
		cooldownSeconds: 0,
	},
	{
		name: "off",
		response: "Disabled",
		modOnly: false,
		enabled: false,
		cooldownSeconds: 0,
	},
];

function resolve(
	text: string,
	over: {
		badges?: ChatBadge[];
		cooldowns?: Map<string, number>;
		now?: number;
		prefix?: string;
		commandsEnabled?: boolean;
	} = {},
) {
	return resolveCommand({
		message: message(text, over.badges),
		prefix: over.prefix ?? "!",
		commandsEnabled: over.commandsEnabled ?? true,
		commands: custom,
		cooldowns: over.cooldowns ?? new Map(),
		now: over.now,
	});
}

describe("chat command resolution", () => {
	test("ignores ordinary chat, unknown commands, and a disabled bot", () => {
		expect(resolve("hello bitrate")).toBeNull();
		expect(resolve("!nothere")).toBeNull();
		expect(resolve("!bitrate", { commandsEnabled: false })).toBeNull();
		expect(resolve("?bitrate")).toBeNull();
	});

	test("answers built-ins and custom commands, custom shadowing built-ins", () => {
		expect(resolve("!bitrate")).toEqual({ kind: "builtin", name: "bitrate" });
		expect(resolve("!discord")).toEqual({
			kind: "reply",
			text: "Join at example.com/discord",
		});
		expect(resolve("!off")).toBeNull();
		expect(resolve("!commands")).toEqual({
			kind: "reply",
			text: "!bitrate !uptime !viewers !commands !discord",
		});
	});

	test("honours a custom prefix", () => {
		expect(resolve("?uptime", { prefix: "?" })).toEqual({
			kind: "builtin",
			name: "uptime",
		});
		expect(resolve("!uptime", { prefix: "?" })).toBeNull();
	});

	test("keeps mod-only commands away from viewers", () => {
		expect(resolve("!secret")).toBeNull();
		expect(resolve("!secret", { badges: MOD })).toEqual({
			kind: "reply",
			text: "Mods only",
		});
		expect(resolve("!title New title", { badges: MOD })).toEqual({
			kind: "title",
			title: "New title",
		});
		expect(resolve("!title New title")).toBeNull();
		// A bare !title has nothing to set.
		expect(resolve("!title", { badges: MOD })).toBeNull();
	});

	test("rate limits viewers but never the moderators testing it", () => {
		const cooldowns = new Map<string, number>();
		expect(resolve("!discord", { cooldowns, now: 1_000 })).not.toBeNull();
		expect(resolve("!discord", { cooldowns, now: 5_000 })).toBeNull();
		expect(
			resolve("!discord", { badges: MOD, cooldowns, now: 5_000 }),
		).not.toBeNull();
		expect(resolve("!discord", { cooldowns, now: 20_000 })).not.toBeNull();
	});
});

describe("alert templates", () => {
	test("substitutes known placeholders and leaves the rest alone", () => {
		expect(
			renderTemplate("Back after {downtime} on {device} {unknown}", {
				downtime: "45s",
				device: "Phone",
			}),
		).toBe("Back after 45s on Phone {unknown}");
	});

	test("formats durations at chat size", () => {
		expect(formatDuration(45_000)).toBe("45s");
		expect(formatDuration(5 * 60_000)).toBe("5min");
		expect(formatDuration(60 * 60_000)).toBe("1h");
		expect(formatDuration(125 * 60_000)).toBe("2h 5min");
	});
});
