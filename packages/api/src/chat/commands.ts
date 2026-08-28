import type { ChatMessage } from "./contract";

export const BUILTIN_COMMANDS = [
	"bitrate",
	"uptime",
	"viewers",
	"commands",
	"title",
] as const;
export type BuiltinCommand = (typeof BUILTIN_COMMANDS)[number];

/** `title` edits the channel; everything else only reads. */
const MOD_ONLY_BUILTINS = new Set<BuiltinCommand>(["title"]);

export const MAX_COMMAND_RESPONSE_LENGTH = 200;
export const COMMAND_NAME_PATTERN = /^[a-z0-9_-]{1,24}$/;

export type CustomCommand = {
	name: string;
	response: string;
	modOnly: boolean;
	enabled: boolean;
	cooldownSeconds: number;
};

export type CommandIntent =
	| { kind: "reply"; text: string }
	| { kind: "builtin"; name: Exclude<BuiltinCommand, "title"> }
	| { kind: "title"; title: string };

export type ResolveInput = {
	message: ChatMessage;
	prefix: string;
	commandsEnabled: boolean;
	commands: CustomCommand[];
	/** Command name to the time it last ran, mutated on a hit. */
	cooldowns: Map<string, number>;
	now?: number;
};

/** Message text without emote images, which no command ever needs. */
export function messageText(message: ChatMessage) {
	return message.fragments
		.map((fragment) => fragment.text)
		.join("")
		.trim();
}

export function isPrivileged(message: ChatMessage) {
	return message.sender.badges.some(
		(badge) => badge.type === "broadcaster" || badge.type === "moderator",
	);
}

/**
 * Pure: what the bot should do about one chat message, or nothing at all.
 *
 * Effects stay with the caller so that a `!viewers` reply costs a provider API
 * call only when someone actually asks, and so this stays testable without a
 * database.
 */
export function resolveCommand(input: ResolveInput): CommandIntent | null {
	if (!input.commandsEnabled) return null;
	const text = messageText(input.message);
	if (!text.startsWith(input.prefix)) return null;
	const [word, ...rest] = text.slice(input.prefix.length).split(/\s+/);
	const name = word?.toLowerCase();
	if (!name) return null;

	const privileged = isPrivileged(input.message);
	const custom = input.commands.find(
		(command) => command.name === name && command.enabled,
	);
	const builtin = BUILTIN_COMMANDS.find((entry) => entry === name);
	// A custom command shadows a built-in: the streamer configured it on purpose.
	if (!custom && !builtin) return null;
	if (
		custom ? custom.modOnly : MOD_ONLY_BUILTINS.has(builtin as BuiltinCommand)
	) {
		if (!privileged) return null;
	}

	const now = input.now ?? Date.now();
	// Broadcaster and mods bypass the cooldown; they are the ones testing it.
	const cooldownMs = (custom?.cooldownSeconds ?? 5) * 1000;
	const lastAt = input.cooldowns.get(name);
	if (!privileged && lastAt !== undefined && now - lastAt < cooldownMs) {
		return null;
	}
	input.cooldowns.set(name, now);

	if (custom) return { kind: "reply", text: custom.response };
	if (builtin === "title") {
		const title = rest.join(" ").trim();
		return title ? { kind: "title", title } : null;
	}
	if (builtin === "commands") {
		const names = [
			...BUILTIN_COMMANDS.filter((entry) => !MOD_ONLY_BUILTINS.has(entry)),
			...input.commands
				.filter((command) => command.enabled && !command.modOnly)
				.map((command) => command.name),
		];
		return {
			kind: "reply",
			text: names.map((entry) => `${input.prefix}${entry}`).join(" "),
		};
	}
	return { kind: "builtin", name: builtin as Exclude<BuiltinCommand, "title"> };
}

/** `{placeholder}` substitution for alert templates. Unknown keys are left alone. */
export function renderTemplate(
	template: string,
	vars: Record<string, string | undefined>,
) {
	return template.replace(/\{(\w+)\}/g, (match, key: string) =>
		vars[key] === undefined ? match : vars[key],
	);
}

/** "2h 5min", "45s" — chat-sized, never a bare seconds count above a minute. */
export function formatDuration(ms: number) {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}min`;
	const hours = Math.floor(minutes / 60);
	const remainder = minutes % 60;
	return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
}
