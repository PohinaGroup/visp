import {
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const chatProvider = pgEnum("chat_provider", [
	"twitch",
	"kick",
	"youtube",
]);

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
