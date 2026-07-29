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
	real,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const streamingSoftware = pgEnum("streaming_software", [
	"obs",
	"visp",
	"larix",
	"moblin",
	"other",
]);

export const setupUseCase = pgEnum("setup_use_case", [
	"phone_to_obs",
	"remote_guest",
	"multi_cam",
	"other",
]);

export const streamDestination = pgEnum("stream_destination", [
	"twitch",
	"kick",
	"other",
]);

export const publishOrigin = pgEnum("publish_origin", ["native", "web"]);

export const obsTileAction = pgEnum("obs_tile_action", [
	"scene",
	"stream",
	"recording",
	"virtualcam",
	"replaybuffer",
	"recordpause",
]);

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
	setupUseCase: setupUseCase("setup_use_case"),
	streamDestination: streamDestination("stream_destination"),
	advancedMode: boolean("advanced_mode").default(false).notNull(),
	obsControlTokenId: text("obs_control_token_id").unique(),
	obsControlTokenHash: text("obs_control_token_hash"),
	obsDesiredStreaming: boolean("obs_desired_streaming")
		.default(false)
		.notNull(),
	obsStreaming: boolean("obs_streaming").default(false).notNull(),
	obsScenes: text("obs_scenes").array().default(sql`ARRAY[]::text[]`).notNull(),
	obsCurrentScene: text("obs_current_scene"),
	obsDesiredScene: text("obs_desired_scene"),
	obsCommandVersion: integer("obs_command_version").default(0).notNull(),
	obsAppliedVersion: integer("obs_applied_version").default(0).notNull(),
	obsDesiredRecording: boolean("obs_desired_recording")
		.default(false)
		.notNull(),
	obsRecording: boolean("obs_recording").default(false).notNull(),
	obsDesiredVirtualCam: boolean("obs_desired_virtual_cam")
		.default(false)
		.notNull(),
	obsVirtualCam: boolean("obs_virtual_cam").default(false).notNull(),
	obsDesiredReplayBuffer: boolean("obs_desired_replay_buffer")
		.default(false)
		.notNull(),
	obsReplayBuffer: boolean("obs_replay_buffer").default(false).notNull(),
	obsDesiredRecordPaused: boolean("obs_desired_record_paused")
		.default(false)
		.notNull(),
	obsRecordPaused: boolean("obs_record_paused").default(false).notNull(),
	obsLastSeenAt: timestamp("obs_last_seen_at", { withTimezone: true }),
	// VISP Direct admission control. The relay is one node and Direct always
	// runs distribution encode there, so this gates capacity, not payment.
	directBeta: boolean("direct_beta").default(false).notNull(),
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
		directTwitch: boolean("direct_twitch").default(false).notNull(),
		directKick: boolean("direct_kick").default(false).notNull(),
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
		// One live source per provider per customer. Partial indexes also make
		// stale "disabled" rows impossible.
		uniqueIndex("path_direct_twitch_owner")
			.on(table.userId)
			.where(sql`${table.directTwitch}`),
		uniqueIndex("path_direct_kick_owner")
			.on(table.userId)
			.where(sql`${table.directKick}`),
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
		linkBitrateKbps: integer("link_bitrate_kbps"),
		linkTargetBitrateKbps: integer("link_target_bitrate_kbps"),
		linkRttMs: integer("link_rtt_ms"),
		linkPacketLossPct: real("link_packet_loss_pct"),
		linkCount: integer("link_count"),
		linkDegraded: boolean("link_degraded"),
		linkStatsAt: timestamp("link_stats_at", { withTimezone: true }),
		// starting|live|retrying|failed|stopped. Errors are sanitized — never a
		// destination URL, never a stream key.
		directTwitchState: text("direct_twitch_state"),
		directTwitchError: text("direct_twitch_error"),
		directKickState: text("direct_kick_state"),
		directKickError: text("direct_kick_error"),
	},
	(table) => [
		check(
			"path_state_reader_count_nonnegative",
			sql`${table.readerCount} >= 0`,
		),
	],
);

export const relayStreamSession = pgTable(
	"relay_stream_session",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		pathId: bigint("path_id", { mode: "number" })
			.notNull()
			.references(() => relayPath.id, { onDelete: "cascade" }),
		startedAt: timestamp("started_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		endedAt: timestamp("ended_at", { withTimezone: true }),
		sourceType: text("source_type"),
	},
	(table) => [
		index("relay_stream_session_path_started_idx").on(
			table.pathId,
			table.startedAt,
		),
		uniqueIndex("relay_stream_session_one_open_per_path")
			.on(table.pathId)
			.where(sql`${table.endedAt} is null`),
		check(
			"relay_stream_session_valid_range",
			sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
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

export const obsTile = pgTable(
	"obs_tile",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => appUser.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		label: text("label").notNull(),
		color: text("color"),
		action: obsTileAction("action").notNull(),
		sceneName: text("scene_name"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("obs_tile_user_position_idx").on(table.userId, table.position),
		check(
			"obs_tile_label_length",
			sql`char_length(trim(${table.label})) between 1 and 64`,
		),
		check(
			"obs_tile_scene_requires_name",
			sql`${table.action} <> 'scene' or ${table.sceneName} is not null`,
		),
	],
);

export const appUserRelations = relations(appUser, ({ one, many }) => ({
	user: one(user, { fields: [appUser.id], references: [user.id] }),
	paths: many(relayPath),
	rttSamples: many(rttSample),
	tiles: many(obsTile),
}));

export const obsTileRelations = relations(obsTile, ({ one }) => ({
	user: one(appUser, { fields: [obsTile.userId], references: [appUser.id] }),
}));

export const relayPathRelations = relations(relayPath, ({ one, many }) => ({
	user: one(appUser, { fields: [relayPath.userId], references: [appUser.id] }),
	state: one(pathState),
	sessions: many(relayStreamSession),
}));

export const pathStateRelations = relations(pathState, ({ one }) => ({
	path: one(relayPath, {
		fields: [pathState.pathId],
		references: [relayPath.id],
	}),
}));

export const relayStreamSessionRelations = relations(
	relayStreamSession,
	({ one }) => ({
		path: one(relayPath, {
			fields: [relayStreamSession.pathId],
			references: [relayPath.id],
		}),
	}),
);

export const rttSampleRelations = relations(rttSample, ({ one }) => ({
	user: one(appUser, { fields: [rttSample.userId], references: [appUser.id] }),
}));
