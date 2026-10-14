import { relations } from "drizzle-orm";
import {
	bigint,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { appUser } from "./relay";

/**
 * One OBS backup uploaded by the VISP OBS plugin. The files themselves live in
 * object storage under obs-backups/{userId}/{id}/; this row is what makes a
 * backup listable, owner-scoped and prunable. A null completedAt means the
 * plugin is still uploading (or gave up), and such a backup is never listed.
 */
export const obsBackup = pgTable(
	"obs_backup",
	{
		id: uuid("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => appUser.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		/** Sealed backups are checked again once their upload URLs expired. */
		reconcileAfter: timestamp("reconcile_after", { withTimezone: true }),
		fileCount: integer("file_count").default(0).notNull(),
		totalBytes: bigint("total_bytes", { mode: "number" }).default(0).notNull(),
		label: text("label"),
		os: text("os"),
		obsVersion: text("obs_version"),
	},
	(table) => [
		index("obs_backup_user_completed_idx").on(table.userId, table.completedAt),
	],
);

export const obsBackupRelations = relations(obsBackup, ({ one }) => ({
	user: one(appUser, {
		fields: [obsBackup.userId],
		references: [appUser.id],
	}),
}));
