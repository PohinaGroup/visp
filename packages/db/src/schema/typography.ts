import { relations } from "drizzle-orm";
import {
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { appUser } from "./relay";

export const typographyLanguage = pgEnum("typography_language", ["en", "fi"]);
export const typographyProjectState = pgEnum("typography_project_state", [
	"uploading",
	"processing",
	"ready",
	"failed",
]);
export const typographyJobKind = pgEnum("typography_job_kind", [
	"transcription",
	"export",
]);
export const typographyJobState = pgEnum("typography_job_state", [
	"queued",
	"processing",
	"completed",
	"failed",
]);

export const typographyProject = pgTable(
	"typography_project",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => appUser.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		language: typographyLanguage("language").notNull(),
		state: typographyProjectState("state").default("uploading").notNull(),
		sourceKey: text("source_key").notNull(),
		exportKey: text("export_key"),
		document: jsonb("document").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("typography_project_owner_idx").on(table.userId),
		index("typography_project_expiry_idx").on(table.expiresAt),
	],
);

export const typographyJob = pgTable(
	"typography_job",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => typographyProject.id, { onDelete: "cascade" }),
		kind: typographyJobKind("kind").notNull(),
		state: typographyJobState("state").default("queued").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("typography_job_project_kind_unique").on(
			table.projectId,
			table.kind,
		),
		index("typography_job_queue_idx").on(table.state, table.createdAt),
	],
);

export const typographyProjectRelations = relations(
	typographyProject,
	({ one }) => ({
		user: one(appUser, {
			fields: [typographyProject.userId],
			references: [appUser.id],
		}),
	}),
);
