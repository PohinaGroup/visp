import { relations, sql } from "drizzle-orm";
import {
	bigint,
	bigserial,
	boolean,
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const streamingSoftware = pgEnum("streaming_software", [
	"obs",
	"visp",
	"larix",
	"moblin",
	"other",
]);

export const publishOrigin = pgEnum("publish_origin", ["native", "web"]);

export const appUser = pgTable("app_user", {
	id: text("id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	handle: text("handle").notNull().unique(),
	publishSecretHash: text("publish_secret_hash"),
	readSecretHash: text("read_secret_hash"),
	readSecretEncrypted: text("read_secret_encrypted"),
	secretsRotatedAt: timestamp("secrets_rotated_at", { withTimezone: true }),
	deviceCount: integer("device_count"),
	streamingSoftware: streamingSoftware("streaming_software"),
	obsControlTokenId: text("obs_control_token_id").unique(),
	obsControlTokenHash: text("obs_control_token_hash"),
	obsDesiredStreaming: boolean("obs_desired_streaming")
		.default(false)
		.notNull(),
	obsStreaming: boolean("obs_streaming").default(false).notNull(),
	obsCommandVersion: integer("obs_command_version").default(0).notNull(),
	obsAppliedVersion: integer("obs_applied_version").default(0).notNull(),
	obsLastSeenAt: timestamp("obs_last_seen_at", { withTimezone: true }),
	onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const relayPath = pgTable(
	"path",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => appUser.id, { onDelete: "cascade" }),
		seq: integer("seq").notNull(),
		slug: text("slug").notNull().unique(),
		label: text("label").notNull(),
		publishSecretHash: text("publish_secret_hash"),
		publishSecretEncrypted: text("publish_secret_encrypted"),
		publishOrigin: publishOrigin("publish_origin"),
		nativeInstallationId: text("native_installation_id"),
		publishLastConnectedAt: timestamp("publish_last_connected_at", {
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
	},
	(table) => [
		unique("path_user_seq_unique").on(table.userId, table.seq),
		unique("path_user_native_installation_unique").on(
			table.userId,
			table.nativeInstallationId,
		),
		check("path_seq_positive", sql`${table.seq} > 0`),
		check(
			"path_label_length",
			sql`char_length(trim(${table.label})) between 1 and 64`,
		),
	],
);

export const pathState = pgTable(
	"path_state",
	{
		pathId: bigint("path_id", { mode: "number" })
			.primaryKey()
			.references(() => relayPath.id, { onDelete: "cascade" }),
		publishing: boolean("publishing").default(false).notNull(),
		readerCount: integer("reader_count").default(0).notNull(),
		sourceType: text("source_type"),
		lastEventAt: timestamp("last_event_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		check(
			"path_state_reader_count_nonnegative",
			sql`${table.readerCount} >= 0`,
		),
	],
);

export const rttSample = pgTable(
	"rtt_sample",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => appUser.id, { onDelete: "cascade" }),
		rttMs: integer("rtt_ms").notNull(),
		method: text("method").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("rtt_sample_user_created_idx").on(table.userId, table.createdAt),
		check("rtt_sample_range", sql`${table.rttMs} between 1 and 10000`),
		check(
			"rtt_sample_method",
			sql`${table.method} in ('browser-probe', 'manual')`,
		),
	],
);

export const appUserRelations = relations(appUser, ({ one, many }) => ({
	user: one(user, { fields: [appUser.id], references: [user.id] }),
	paths: many(relayPath),
	rttSamples: many(rttSample),
}));

export const relayPathRelations = relations(relayPath, ({ one }) => ({
	user: one(appUser, { fields: [relayPath.userId], references: [appUser.id] }),
	state: one(pathState),
}));

export const pathStateRelations = relations(pathState, ({ one }) => ({
	path: one(relayPath, {
		fields: [pathState.pathId],
		references: [relayPath.id],
	}),
}));

export const rttSampleRelations = relations(rttSample, ({ one }) => ({
	user: one(appUser, { fields: [rttSample.userId], references: [appUser.id] }),
}));
