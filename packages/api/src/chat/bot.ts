import { db } from "@VISP/db";
import {
	appUser,
	chatBot,
	chatBotCommand,
	pathState,
	relayPath,
	relayStreamSession,
} from "@VISP/db/schema/index";
import { and, count, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { type AdvisoryLock, tryAdvisoryLock } from "../advisory-lock";
import { getViewerCounts, updateStreamInfo } from "../channel/stream-info";
import { formatLinkStats, linkStatsFromPath } from "../link-stats";
import { moderatorEntitledSql } from "../plan";
import {
	type CommandIntent,
	type CustomCommand,
	formatDuration,
	messageText,
	resolveCommand,
} from "./commands";
import type { ChatMessage, ChatProvider } from "./contract";
import { chatHub } from "./hub";
import { ChatModerator } from "./moderator";
import { sendChatMessage } from "./send";
import {
	assertBotSenderModeAllowed,
	type BotSenderMode,
	canSelectBotSender,
	resolveBotSenderMode,
} from "./sender";

/** A null column means "use this", so changing the wording needs no migration. */
export const DEFAULT_ALERT_MESSAGES = {
	live: "Now live.",
	brb: "Signal dropped — the stream is held on the BRB card, back shortly.",
	back: "Back — the signal recovered after {downtime}.",
	offline: "Stream ended after {uptime}. Thanks for watching!",
} as const;

export type AlertEvent = keyof typeof DEFAULT_ALERT_MESSAGES;
export const ALERT_EVENTS = Object.keys(DEFAULT_ALERT_MESSAGES) as AlertEvent[];

export const MAX_ALERT_MESSAGE_LENGTH = 200;
/** Every command is matched against each chat line, so keep the set small. */
export const MAX_BOT_COMMANDS = 100;
/**
 * How long a bot trusts its cached settings and commands. Writes on this
 * instance invalidate at once; another instance's write shows up within this.
 */
const BOT_CONFIG_TTL_MS = 30_000;

export class BotCommandLimitError extends Error {
	constructor() {
		super(`You can have up to ${MAX_BOT_COMMANDS} custom commands`);
		this.name = "BotCommandLimitError";
	}
}

type Cached<T> = { value: Promise<T>; expiresAt: number };
const settingsCache = new Map<string, Cached<BotSettings>>();
const commandsCache = new Map<string, Cached<CustomCommand[]>>();

function cached<T>(
	cache: Map<string, Cached<T>>,
	userId: string,
	load: () => Promise<T>,
) {
	const now = Date.now();
	const hit = cache.get(userId);
	if (hit && hit.expiresAt > now) return hit.value;
	// Concurrent chat lines share one in-flight query.
	const value = load();
	const entry = { value, expiresAt: now + BOT_CONFIG_TTL_MS };
	cache.set(userId, entry);
	value.catch(() => {
		if (cache.get(userId) === entry) cache.delete(userId);
	});
	return value;
}

/** Drops this instance's cached bot settings and commands for `userId`. */
export function invalidateBotConfig(userId: string) {
	settingsCache.delete(userId);
	commandsCache.delete(userId);
}

export type ModeratorSettings = {
	enabled: boolean;
	rules: string;
	maxTimeoutSeconds: number;
	onRaid: boolean;
	onGift: boolean;
	onSignal: boolean;
	onQuestions: boolean;
};

/** Lives here, not in moderator.ts: that module is loaded through a cycle. */
export const DEFAULT_MODERATOR_SETTINGS: ModeratorSettings = {
	enabled: true,
	rules: "",
	maxTimeoutSeconds: 600,
	onRaid: true,
	onGift: true,
	onSignal: true,
	onQuestions: false,
};

export type BotSettings = {
	enabled: boolean;
	commandsEnabled: boolean;
	prefix: string;
	senderMode: BotSenderMode;
	targets: Record<ChatProvider, boolean>;
	alerts: Record<AlertEvent, boolean>;
	messages: Record<AlertEvent, string | null>;
	/** The AI moderator (Plus); independent of `enabled`, which is posting. */
	moderator: ModeratorSettings;
};

const DEFAULT_SETTINGS: BotSettings = {
	enabled: false,
	commandsEnabled: true,
	prefix: "!",
	senderMode: "visp",
	targets: { twitch: true, kick: true, youtube: true },
	alerts: { live: true, brb: true, back: true, offline: false },
	messages: { live: null, brb: null, back: null, offline: null },
	moderator: DEFAULT_MODERATOR_SETTINGS,
};

function toSettings(
	row: typeof chatBot.$inferSelect | undefined,
	canSelectSender: boolean,
): BotSettings {
	if (!row) return DEFAULT_SETTINGS;
	return {
		enabled: row.enabled,
		commandsEnabled: row.commandsEnabled,
		prefix: row.prefix,
		senderMode: resolveBotSenderMode(row.senderMode, canSelectSender),
		targets: {
			twitch: row.postTwitch,
			kick: row.postKick,
			youtube: row.postYoutube,
		},
		alerts: {
			live: row.alertLive,
			brb: row.alertBrb,
			back: row.alertBack,
			offline: row.alertOffline,
		},
		messages: {
			live: row.liveMessage,
			brb: row.brbMessage,
			back: row.backMessage,
			offline: row.offlineMessage,
		},
		moderator: {
			enabled: row.modEnabled,
			rules: row.modRules,
			maxTimeoutSeconds: row.modMaxTimeoutSeconds,
			onRaid: row.modOnRaid,
			onGift: row.modOnGift,
			onSignal: row.modOnSignal,
			onQuestions: row.modOnQuestions,
		},
	};
}

export async function getBotSettingsAccess(userId: string) {
	const [row, canSelectSender] = await Promise.all([
		db.query.chatBot.findFirst({ where: eq(chatBot.userId, userId) }),
		canSelectBotSender(userId),
	]);
	return { settings: toSettings(row, canSelectSender), canSelectSender };
}

export async function getBotSettings(userId: string): Promise<BotSettings> {
	return (await getBotSettingsAccess(userId)).settings;
}

export async function setBotSettings(userId: string, input: BotSettings) {
	const canSelectSender = await canSelectBotSender(userId);
	assertBotSenderModeAllowed(input.senderMode, canSelectSender);
	const trim = (value: string | null) =>
		value?.trim().slice(0, MAX_ALERT_MESSAGE_LENGTH) || null;
	const values = {
		userId,
		enabled: input.enabled,
		commandsEnabled: input.commandsEnabled,
		prefix: input.prefix,
		senderMode: input.senderMode,
		postTwitch: input.targets.twitch,
		postKick: input.targets.kick,
		postYoutube: input.targets.youtube,
		alertLive: input.alerts.live,
		alertBrb: input.alerts.brb,
		alertBack: input.alerts.back,
		alertOffline: input.alerts.offline,
		liveMessage: trim(input.messages.live),
		brbMessage: trim(input.messages.brb),
		backMessage: trim(input.messages.back),
		offlineMessage: trim(input.messages.offline),
		modEnabled: input.moderator.enabled,
		modRules: input.moderator.rules.trim().slice(0, 2000),
		modMaxTimeoutSeconds: input.moderator.maxTimeoutSeconds,
		modOnRaid: input.moderator.onRaid,
		modOnGift: input.moderator.onGift,
		modOnSignal: input.moderator.onSignal,
		modOnQuestions: input.moderator.onQuestions,
	};
	const [row] = await db
		.insert(chatBot)
		.values(values)
		.onConflictDoUpdate({ target: chatBot.userId, set: values })
		.returning();
	invalidateBotConfig(userId);
	return toSettings(row, canSelectSender);
}

export async function listBotCommands(userId: string) {
	return db
		.select()
		.from(chatBotCommand)
		.where(eq(chatBotCommand.userId, userId))
		.orderBy(chatBotCommand.name)
		.limit(MAX_BOT_COMMANDS);
}

export async function upsertBotCommand(
	userId: string,
	input: Omit<CustomCommand, "enabled"> & { enabled?: boolean },
) {
	// `enabled` is written only when sent, so an edit that omits it cannot
	// re-enable a command the user switched off.
	const values = {
		userId,
		name: input.name.toLowerCase(),
		response: input.response,
		modOnly: input.modOnly,
		cooldownSeconds: input.cooldownSeconds,
		...(input.enabled === undefined ? {} : { enabled: input.enabled }),
	};
	const row = await db.transaction(async (tx) => {
		// Serialises this user's creates so two at once cannot both pass the cap.
		await tx.execute(
			sql`select pg_advisory_xact_lock(hashtextextended(${`chat:bot-commands:${userId}`}, 0))`,
		);
		const [existing] = await tx
			.select({ id: chatBotCommand.id })
			.from(chatBotCommand)
			.where(
				and(
					eq(chatBotCommand.userId, userId),
					eq(chatBotCommand.name, values.name),
				),
			);
		if (!existing) {
			const [total] = await tx
				.select({ count: count() })
				.from(chatBotCommand)
				.where(eq(chatBotCommand.userId, userId));
			if ((total?.count ?? 0) >= MAX_BOT_COMMANDS)
				throw new BotCommandLimitError();
		}
		const [saved] = await tx
			.insert(chatBotCommand)
			.values({ enabled: true, ...values })
			.onConflictDoUpdate({
				target: [chatBotCommand.userId, chatBotCommand.name],
				set: values,
			})
			.returning();
		return saved;
	});
	invalidateBotConfig(userId);
	return row;
}

export async function deleteBotCommand(userId: string, name: string) {
	const [row] = await db
		.delete(chatBotCommand)
		.where(
			and(
				eq(chatBotCommand.userId, userId),
				eq(chatBotCommand.name, name.toLowerCase()),
			),
		)
		.returning({ name: chatBotCommand.name });
	invalidateBotConfig(userId);
	return Boolean(row);
}

/**
 * Whichever of this account's devices is on air (publishing first, else a BRB
 * hold), with its link stats when fresh.
 */
export async function currentPath(userId: string) {
	const rows = await db
		.select({
			pathId: pathState.pathId,
			linkBitrateKbps: pathState.linkBitrateKbps,
			linkTargetBitrateKbps: pathState.linkTargetBitrateKbps,
			linkRttMs: pathState.linkRttMs,
			linkPacketLossPct: pathState.linkPacketLossPct,
			linkStatsAt: pathState.linkStatsAt,
			publishing: pathState.publishing,
			brbSince: pathState.brbSince,
		})
		.from(pathState)
		.innerJoin(relayPath, eq(relayPath.id, pathState.pathId))
		.where(and(eq(relayPath.userId, userId), isNull(relayPath.revokedAt)));
	const row =
		rows.find((row) => row.publishing) ??
		rows.find((row) => row.brbSince !== null);
	if (!row) return null;
	return {
		pathId: row.pathId,
		publishing: Boolean(row.publishing),
		brbSince: row.brbSince,
		link: linkStatsFromPath(row),
	};
}

/** Live link stats for whichever of this account's devices is publishing. */
async function currentLinkStats(userId: string) {
	return (await currentPath(userId))?.link ?? null;
}

export async function currentUptimeMs(userId: string, now: number) {
	const [session] = await db
		.select({ startedAt: relayStreamSession.startedAt })
		.from(relayStreamSession)
		.innerJoin(relayPath, eq(relayPath.id, relayStreamSession.pathId))
		.where(
			and(
				eq(relayPath.userId, userId),
				isNull(relayStreamSession.endedAt),
				isNull(relayPath.revokedAt),
			),
		)
		.orderBy(desc(relayStreamSession.startedAt))
		.limit(1);
	return session ? now - session.startedAt.getTime() : null;
}

/** What a resolved command replies with, or null when there is nothing to say. */
export async function runIntent(
	userId: string,
	intent: CommandIntent,
): Promise<string | null> {
	if (intent.kind === "reply") return intent.text;
	if (intent.kind === "title") {
		const results = await updateStreamInfo(userId, { title: intent.title });
		const ok = results.filter((result) => result.ok).map((r) => r.provider);
		return ok.length > 0
			? `Title updated on ${ok.join(", ")}.`
			: "Could not update the title.";
	}
	if (intent.name === "bitrate") {
		const stats = await currentLinkStats(userId);
		return stats ? formatLinkStats(stats) : "Nothing is publishing right now.";
	}
	if (intent.name === "uptime") {
		const uptime = await currentUptimeMs(userId, Date.now());
		return uptime === null
			? "Nothing is publishing right now."
			: `Live for ${formatDuration(uptime)}.`;
	}
	const counts = await getViewerCounts(userId, ["twitch", "kick", "youtube"]);
	const parts = Object.entries(counts).flatMap(([provider, count]) =>
		count === null ? [] : [`${provider} ${count}`],
	);
	return parts.length > 0 ? parts.join(" · ") : "No viewer counts available.";
}

/**
 * One user's bot: a headless chat listener.
 *
 * Subscribing is what starts the Twitch and YouTube connectors — they key off
 * the hub's audience count — so the bot hearing chat while nobody has the
 * dashboard or overlay open needs no change to either connector.
 */
class UserBot {
	private readonly cooldowns = new Map<string, number>();
	/** Texts this bot just posted, so its own lines never trigger it. */
	private readonly echoes = new Map<string, number>();
	private readonly moderator: ChatModerator;
	private readonly unsubscribe: () => void;

	constructor(
		private readonly userId: string,
		private readonly lock: AdvisoryLock,
	) {
		// Same subscription, second consumer: the moderator hears every line and
		// every alert, and decides for itself whether it may act.
		this.moderator = new ChatModerator(userId, {
			settings: () =>
				cached(settingsCache, userId, () => getBotSettings(userId)),
			echoes: this.echoes,
			path: () => currentPath(userId),
			uptimeMs: (now) => currentUptimeMs(userId, now),
		});
		this.unsubscribe = chatHub.subscribe(userId, (event) => {
			if (event.type === "alert") {
				void this.moderator
					.onAlert(event.alert)
					.catch((error) => console.error("AI moderator failed", error));
				return;
			}
			if (event.type !== "message") return;
			void this.onMessage(event.message).catch((error) =>
				console.error("Chat bot failed", error),
			);
			void this.moderator
				.observe(event.message)
				.catch((error) => console.error("AI moderator failed", error));
		});
	}

	async stop() {
		this.unsubscribe();
		this.moderator.stop();
		invalidateBotConfig(this.userId);
		await this.lock.release();
	}

	private isEcho(message: ChatMessage) {
		const text = messageText(message);
		const sentAt = this.echoes.get(text);
		return sentAt !== undefined && Date.now() - sentAt < 30_000;
	}

	private async onMessage(message: ChatMessage) {
		// Most chat lines are not commands: settings come from a short cache and
		// commands load only once the prefix matches.
		const text = messageText(message);
		if (this.isEcho(message)) return;
		const settings = await cached(settingsCache, this.userId, () =>
			getBotSettings(this.userId),
		);
		if (!settings.enabled || !settings.commandsEnabled) return;
		if (!settings.targets[message.provider]) return;
		if (!text.startsWith(settings.prefix)) return;
		const intent = resolveCommand({
			message,
			prefix: settings.prefix,
			commandsEnabled: settings.commandsEnabled,
			commands: await cached(commandsCache, this.userId, () =>
				listBotCommands(this.userId),
			),
			cooldowns: this.cooldowns,
		});
		if (!intent) return;
		const reply = await runIntent(this.userId, intent);
		if (!reply) return;
		// Replies go back to the platform that asked. Answering one viewer on
		// three platforms is how a bot becomes the thing chat mutes.
		this.echoes.set(reply, Date.now());
		if (this.echoes.size > 50) this.echoes.clear();
		await sendChatMessage(this.userId, message.provider, reply);
	}
}

const bots = new Map<string, UserBot>();
const starting = new Set<string>();

/**
 * Accounts with something on air (BRB counts, chat is awake) that either
 * answer commands or get the AI moderator: Plus or comped, and not switched
 * off. A missing `chat_bot` row means the defaults, so the moderator starts
 * for an entitled account that never opened the card.
 */
async function liveBotUsers() {
	const rows = await db
		.selectDistinct({ userId: relayPath.userId })
		.from(relayPath)
		.innerJoin(pathState, eq(pathState.pathId, relayPath.id))
		.innerJoin(appUser, eq(appUser.id, relayPath.userId))
		.leftJoin(chatBot, eq(chatBot.userId, relayPath.userId))
		.where(
			and(
				isNull(relayPath.revokedAt),
				or(eq(pathState.publishing, true), isNotNull(pathState.brbSince)),
				or(
					and(eq(chatBot.enabled, true), eq(chatBot.commandsEnabled, true)),
					and(sql`coalesce(${chatBot.modEnabled}, true)`, moderatorEntitledSql),
				),
			),
		);
	return new Set(rows.map((row) => row.userId));
}

async function syncBots() {
	const live = await liveBotUsers();
	for (const [userId, bot] of bots) {
		if (live.has(userId)) continue;
		bots.delete(userId);
		await bot.stop();
	}
	for (const userId of live) {
		if (bots.has(userId) || starting.has(userId)) continue;
		starting.add(userId);
		try {
			// One owner per account across instances, like the chat connectors.
			const lock = await tryAdvisoryLock(`chat:bot:${userId}`, () => {
				void bots.get(userId)?.stop();
				bots.delete(userId);
			});
			if (lock) {
				bots.set(userId, new UserBot(userId, lock));
				// Commands answer only when both switches are on; say which is off.
				void getBotSettings(userId)
					.then((s) =>
						console.info(
							`Chat bot started for ${userId}: posting ${s.enabled ? "on" : "off"}, commands ${s.commandsEnabled ? "on" : "off"}, twitch ${s.targets.twitch ? "on" : "off"}, sender ${s.senderMode}, AI moderator ${s.moderator.enabled ? "on" : "off"}`,
						),
					)
					.catch(() => undefined);
			}
		} finally {
			starting.delete(userId);
		}
	}
}

export function startChatBots(intervalMs = 10_000) {
	const run = () =>
		void syncBots().catch((error) =>
			console.error("Chat bot sync failed", error),
		);
	run();
	const timer = setInterval(run, intervalMs);
	return () => {
		clearInterval(timer);
		for (const [userId, bot] of bots) {
			bots.delete(userId);
			void bot.stop();
		}
	};
}
