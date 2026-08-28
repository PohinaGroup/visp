import { sql } from "drizzle-orm";
import {
	bigint,
	bigserial,
	boolean,
	check,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { appUser, relayPath } from "./relay";

export const chatProvider = pgEnum("chat_provider", [
	"twitch",
	"kick",
	"youtube",
]);

export const chatBotSenderModes = ["visp", "self"] as const;

export const chatConnection = pgTable(
	"chat_connection",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		provider: chatProvider("provider").notNull(),
		kickSubscriptionId: text("kick_subscription_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.provider] })],
);

/**
 * The chat bot: what it may post, and what it says. One row per streaming
 * account, created on first save. A null template means "use the built-in
 * default", so changing the default copy does not have to migrate every row.
 */
export const chatBot = pgTable(
	"chat_bot",
	{
		userId: text("user_id")
			.primaryKey()
			.references(() => appUser.id, { onDelete: "cascade" }),
		enabled: boolean("enabled").default(false).notNull(),
		commandsEnabled: boolean("commands_enabled").default(true).notNull(),
		prefix: text("prefix").default("!").notNull(),
		senderMode: text("sender_mode", { enum: chatBotSenderModes })
			.default("visp")
			.notNull(),
		postTwitch: boolean("post_twitch").default(true).notNull(),
		postKick: boolean("post_kick").default(true).notNull(),
		postYoutube: boolean("post_youtube").default(true).notNull(),
		alertLive: boolean("alert_live").default(true).notNull(),
		alertBrb: boolean("alert_brb").default(true).notNull(),
		alertBack: boolean("alert_back").default(true).notNull(),
		alertOffline: boolean("alert_offline").default(false).notNull(),
		liveMessage: text("live_message"),
		brbMessage: text("brb_message"),
		backMessage: text("back_message"),
		offlineMessage: text("offline_message"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		check(
			"chat_bot_prefix_length",
			sql`char_length(${table.prefix}) between 1 and 3`,
		),
		check(
			"chat_bot_sender_mode",
			sql`${table.senderMode} in ('visp', 'self')`,
		),
	],
);

export const chatBotCommand = pgTable(
	"chat_bot_command",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => appUser.id, { onDelete: "cascade" }),
		/** Stored without the prefix, lowercase. */
		name: text("name").notNull(),
		response: text("response").notNull(),
		modOnly: boolean("mod_only").default(false).notNull(),
		enabled: boolean("enabled").default(true).notNull(),
		cooldownSeconds: integer("cooldown_seconds").default(10).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		unique("chat_bot_command_user_name_unique").on(table.userId, table.name),
		check("chat_bot_command_name", sql`${table.name} ~ '^[a-z0-9_-]{1,24}$'`),
		check(
			"chat_bot_command_response_length",
			sql`char_length(${table.response}) between 1 and 200`,
		),
		check(
			"chat_bot_command_cooldown_range",
			sql`${table.cooldownSeconds} between 0 and 3600`,
		),
	],
);

/**
 * Alert de-duplication. The not-ready hook and the 10s reconciler both report
 * the same transition, so "may I send this?" is a conditional upsert against
 * this table rather than anything in application memory.
 */
export const chatBotAlert = pgTable(
	"chat_bot_alert",
	{
		pathId: bigint("path_id", { mode: "number" })
			.notNull()
			.references(() => relayPath.id, { onDelete: "cascade" }),
		event: text("event").notNull(),
		sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.pathId, table.event] }),
		check(
			"chat_bot_alert_event",
			sql`${table.event} in ('live', 'brb', 'back', 'offline')`,
		),
	],
);
