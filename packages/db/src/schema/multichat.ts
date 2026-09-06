import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const multiChatProvider = pgEnum("multichat_provider", [
	"twitch",
	"kick",
	"tiktok",
]);

/** One revocable browser-source credential per VISP account. */
export const multiChatOverlay = pgTable("multichat_overlay", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	tokenId: text("token_id"),
	tokenHash: text("token_hash"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

/** A public channel nickname, never a broadcaster OAuth credential. */
export const multiChatSource = pgTable(
	"multichat_source",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		provider: multiChatProvider("provider").notNull(),
		channelLogin: text("channel_login").notNull(),
		/** Platform ID resolved from the nickname when the connector starts. */
		channelId: text("channel_id"),
		/** Kick owns webhook subscriptions; this is cleared when the source stops. */
		kickSubscriptionId: text("kick_subscription_id"),
		enabled: boolean("enabled").default(false).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.provider] }),
		check(
			"multichat_source_login_length",
			sql`char_length(${table.channelLogin}) between 1 and 64`,
		),
	],
);
