import { sql } from "drizzle-orm";
import {
	bigserial,
	check,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

/** What an admin action changed; kept small enough to diff on screen. */
export type AdminAuditSnapshot = Record<string, unknown>;

/**
 * One row per admin action, written by `audit()` in the admin router.
 *
 * `actor_id` and `target_id` deliberately have no foreign keys: the log is
 * history, so it must outlive a deleted admin, user, or relay, and must never
 * cascade away with them. Display names are joined at read time and simply
 * go missing once the row they pointed at is gone.
 */
export const adminAuditLog = pgTable(
	"admin_audit_log",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		actorId: text("actor_id").notNull(),
		targetType: text("target_type", { enum: ["user", "relay"] }).notNull(),
		targetId: text("target_id").notNull(),
		action: text("action").notNull(),
		before: jsonb("before").$type<AdminAuditSnapshot>(),
		after: jsonb("after").$type<AdminAuditSnapshot>(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		check(
			"admin_audit_log_target_type",
			sql`${table.targetType} in ('user', 'relay')`,
		),
		index("admin_audit_log_created_at_idx").on(table.createdAt.desc()),
		index("admin_audit_log_target_created_at_idx").on(
			table.targetType,
			table.targetId,
			table.createdAt.desc(),
		),
		index("admin_audit_log_actor_created_at_idx").on(
			table.actorId,
			table.createdAt.desc(),
		),
	],
);
